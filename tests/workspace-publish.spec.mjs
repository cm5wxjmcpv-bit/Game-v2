import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

const corsHeaders = {
  'access-control-allow-origin': 'http://127.0.0.1:4173',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'Accept,Authorization,Content-Type,X-GitHub-Api-Version',
  'content-type': 'application/json',
};
const publishCommitSha = 'a'.repeat(40);

function json(route, payload, status = 200) {
  return route.fulfill({ status, headers: corsHeaders, body: JSON.stringify(payload) });
}

test('Publish & Play opens the current browser build without a token or GitHub request', async ({ page }) => {
  const githubRequests = [];
  page.on('request', (request) => {
    if (request.url().startsWith('https://api.github.com/')) githubRequests.push(request.url());
  });

  await page.goto('/builder/workspace.html?game=scene-demo');
  await expect(page.locator('#projectSummary')).toContainText('Generic Scene Demo');
  await page.locator('#workspaceActorTabBtn').click();
  await page.locator('#actorList [data-actor-id="scene_actor"]').click();
  await page.locator('#actorNameInput').fill('Browser Build Explorer');
  await page.locator('#saveActorBtn').click();

  await page.locator('#workspacePublishTabBtn').click();
  await expect(page.locator('#publishAndPlayBtn')).toBeEnabled();
  await page.locator('#publishAndPlayBtn').click();

  await expect(page).toHaveURL(/\/preview\.html\?game=scene-demo&localPublish=1&scene=scene_lab/);
  await expect(page.locator('#previewModeLabel')).toHaveText('Published Browser Build');
  await expect(page.locator('#previewDetails')).toContainText('scene-demo › scene_lab');
  const snapshot = await page.evaluate(() => JSON.parse(localStorage.getItem('pixel_engine_local_publish_scene-demo')));
  expect(snapshot.files.some((file) => file.path === 'games/scene-demo/data/actors.json' && file.content.includes('Browser Build Explorer'))).toBe(true);
  expect(githubRequests).toEqual([]);
});

test('workspace publishes changed package JSON to a new draft pull request without storing the token', async ({ page }) => {
  const actorFile = await fs.readFile('games/scene-demo/data/actors.json', 'utf8');
  const apiCalls = [];
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.route('https://api.github.com/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (method === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: corsHeaders, body: '' });
    }
    const body = request.postDataJSON?.() || null;
    apiCalls.push({ method, path: url.pathname, body, authorization: request.headers().authorization });
    if (url.pathname === '/repos/cm5wxjmcpv-bit/L-C-Forge') return json(route, { full_name: 'cm5wxjmcpv-bit/L-C-Forge' });
    if (url.pathname.endsWith('/git/ref/heads/main')) return json(route, { object: { sha: 'base-sha' } });
    if (url.pathname.includes('/contents/games/scene-demo/data/actors.json')) {
      return json(route, { type: 'file', encoding: 'base64', content: Buffer.from(actorFile).toString('base64') });
    }
    if (url.pathname.endsWith('/git/commits/base-sha')) return json(route, { tree: { sha: 'base-tree' } });
    if (url.pathname.endsWith('/git/blobs')) return json(route, { sha: 'actor-blob' }, 201);
    if (url.pathname.endsWith('/git/trees')) return json(route, { sha: 'publish-tree' }, 201);
    if (url.pathname.endsWith('/git/commits')) return json(route, { sha: publishCommitSha }, 201);
    if (url.pathname.endsWith('/git/refs')) return json(route, { ref: body.ref }, 201);
    if (url.pathname.endsWith('/pulls')) {
      return json(route, { number: 22, html_url: 'https://github.com/cm5wxjmcpv-bit/L-C-Forge/pull/22' }, 201);
    }
    return json(route, { message: `Unexpected ${method} ${url.pathname}` }, 404);
  });

  await page.goto('/builder/workspace.html?game=scene-demo');
  await expect(page.locator('#projectSummary')).toContainText('Generic Scene Demo');
  await page.locator('#workspaceActorTabBtn').click();
  await page.locator('#actorList [data-actor-id="scene_actor"]').click();
  await page.locator('#actorNameInput').fill('Published Explorer');
  await page.locator('#saveActorBtn').click();

  await page.locator('#workspacePublishTabBtn').click();
  await expect(page.locator('#publishFileList')).toContainText('games/scene-demo/data/actors.json');
  await expect(page.locator('#publishPlanSummary')).toContainText('ready for one-click Publish & Play');
  await page.locator('.workspace-github-publish summary').click();
  await page.locator('#publishTokenInput').fill('github_pat_browser_test');
  await page.locator('#publishConfirmInput').check();
  await expect(page.locator('#publishDraftPrBtn')).toBeEnabled();
  await page.locator('#publishDraftPrBtn').click();

  await expect(page.locator('#publishPrLink')).toBeVisible();
  await expect(page.locator('#publishPrLink')).toHaveAttribute('href', 'https://github.com/cm5wxjmcpv-bit/L-C-Forge/pull/22');
  await expect(page.locator('#publishPreviewLink')).toBeVisible();
  const previewHref = await page.locator('#publishPreviewLink').getAttribute('href');
  const previewUrl = new URL(previewHref);
  expect(previewUrl.pathname).toBe('/preview.html');
  expect(previewUrl.searchParams.get('game')).toBe('scene-demo');
  expect(previewUrl.searchParams.get('scene')).toBe('scene_lab');
  expect(previewUrl.searchParams.get('previewCommit')).toBe(publishCommitSha);
  expect(previewUrl.searchParams.get('previewPr')).toBe('22');
  await expect(page.locator('#publishStatus')).toContainText('Draft pull request #22 created');
  await expect(page.locator('#publishTokenInput')).toHaveValue('');

  const storedValues = await page.evaluate(() => Object.keys(localStorage).map((key) => localStorage.getItem(key) || ''));
  expect(storedValues.join('\n')).not.toContain('github_pat_browser_test');
  expect(pageErrors).toEqual([]);
  expect(apiCalls.every((call) => call.authorization === 'Bearer github_pat_browser_test')).toBe(true);
  expect(apiCalls.find((call) => call.path.endsWith('/git/refs')).body.ref).toMatch(/^refs\/heads\/workspace\/scene-demo-/);
  const pullRequestCall = apiCalls.find((call) => call.path.endsWith('/pulls'));
  expect(pullRequestCall.body.draft).toBe(true);
  expect(pullRequestCall.body.base).toBe('main');
  expect(pullRequestCall.body.head).toMatch(/^workspace\/scene-demo-/);
});

test('workspace publish plan reports no changes without requesting a token', async ({ page }) => {
  await page.goto('/builder/workspace.html?game=scene-demo');
  await expect(page.locator('#projectSummary')).toContainText('Generic Scene Demo');
  await page.locator('#workspacePublishTabBtn').click();
  await expect(page.locator('#publishPlanSummary')).toContainText('no unpublished changes');
  await expect(page.locator('#publishAndPlayBtn')).toBeEnabled();
  await expect(page.locator('#publishDraftPrBtn')).toBeDisabled();
});

test('workspace publish refuses a stale draft when the current save fails', async ({ page }) => {
  await page.goto('/builder/workspace.html?game=scene-demo');
  await expect(page.locator('#projectSummary')).toContainText('Generic Scene Demo');
  await page.locator('#saveDraftBtn').click();
  await expect(page.locator('#workspaceMessage')).toContainText('saved');
  await page.locator('#workspaceActorTabBtn').click();
  await page.locator('#actorList [data-actor-id="scene_actor"]').click();
  await page.locator('#actorNameInput').fill('Unsaved Publish Actor');
  await page.locator('#saveActorBtn').click();

  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function failCurrentPublishDraft(key, value) {
      if (String(key) === 'pixel_engine_builder_workspace_scene-demo') {
        throw new DOMException('Audit quota reached', 'QuotaExceededError');
      }
      return original.call(this, key, value);
    };
  });
  await page.locator('#workspacePublishTabBtn').click();

  await expect(page.locator('#publishStatus')).toContainText(/current workspace draft could not be saved/i);
  await expect(page.locator('#publishStatus')).toHaveClass(/error/);
  await expect(page.locator('#publishPlanSummary')).toContainText('No publish plan');
  await expect(page.locator('#publishDraftPrBtn')).toBeDisabled();
  const storedActorName = await page.evaluate(() => {
    const draft = JSON.parse(localStorage.getItem('pixel_engine_builder_workspace_scene-demo'));
    return draft.actors.find((actor) => actor.id === 'scene_actor').name;
  });
  expect(storedActorName).toBe('Scene Explorer');
});

test('rapid publish submission creates only one draft pull request', async ({ page }) => {
  const actorFile = await fs.readFile('games/scene-demo/data/actors.json', 'utf8');
  let delayBaseline = false;
  let delayedRequests = 0;
  let releaseBaseline;
  const baselineGate = new Promise((resolve) => { releaseBaseline = resolve; });
  let pullRequestCalls = 0;
  let lastApiCallAt = 0;

  await page.route('**/games/scene-demo/data/actors.json', async (route) => {
    if (delayBaseline) {
      delayedRequests += 1;
      await baselineGate;
    }
    await route.continue();
  });
  await page.route('https://api.github.com/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    lastApiCallAt = Date.now();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: corsHeaders, body: '' });
    const body = request.postDataJSON?.() || null;
    if (url.pathname === '/repos/cm5wxjmcpv-bit/L-C-Forge') return json(route, { full_name: 'cm5wxjmcpv-bit/L-C-Forge' });
    if (url.pathname.endsWith('/git/ref/heads/main')) return json(route, { object: { sha: 'base-sha' } });
    if (url.pathname.includes('/contents/games/scene-demo/data/actors.json')) {
      return json(route, { type: 'file', encoding: 'base64', content: Buffer.from(actorFile).toString('base64') });
    }
    if (url.pathname.endsWith('/git/commits/base-sha')) return json(route, { tree: { sha: 'base-tree' } });
    if (url.pathname.endsWith('/git/blobs')) return json(route, { sha: 'actor-blob' }, 201);
    if (url.pathname.endsWith('/git/trees')) return json(route, { sha: 'publish-tree' }, 201);
    if (url.pathname.endsWith('/git/commits')) return json(route, { sha: publishCommitSha }, 201);
    if (url.pathname.endsWith('/git/refs')) return json(route, { ref: body.ref }, 201);
    if (url.pathname.endsWith('/pulls')) {
      pullRequestCalls += 1;
      lastApiCallAt = Date.now();
      return json(route, {
        number: 30 + pullRequestCalls,
        html_url: `https://github.com/cm5wxjmcpv-bit/L-C-Forge/pull/${30 + pullRequestCalls}`,
      }, 201);
    }
    return json(route, { message: `Unexpected ${method} ${url.pathname}` }, 404);
  });

  await page.goto('/builder/workspace.html?game=scene-demo');
  await expect(page.locator('#projectSummary')).toContainText('Generic Scene Demo');
  await page.locator('#workspaceActorTabBtn').click();
  await page.locator('#actorList [data-actor-id="scene_actor"]').click();
  await page.locator('#actorNameInput').fill('Single Publish Explorer');
  await page.locator('#saveActorBtn').click();
  await page.locator('#workspacePublishTabBtn').click();
  await expect(page.locator('#publishPlanSummary')).toContainText('ready for one-click Publish & Play');
  await page.locator('.workspace-github-publish summary').click();
  await page.locator('#publishTokenInput').fill('github_pat_single_submit_test');
  await page.locator('#publishConfirmInput').check();
  await expect(page.locator('#publishDraftPrBtn')).toBeEnabled();

  delayBaseline = true;
  await page.locator('#publishDraftPrBtn').dblclick({ delay: 20 });
  await expect.poll(() => delayedRequests).toBe(1);
  releaseBaseline();

  await expect.poll(() => pullRequestCalls, { timeout: 5_000 }).toBeGreaterThanOrEqual(1);
  await expect.poll(() => Date.now() - lastApiCallAt, { timeout: 5_000 }).toBeGreaterThan(500);
  expect(pullRequestCalls).toBe(1);
  await expect(page.locator('#publishStatus')).toContainText('Draft pull request');
});

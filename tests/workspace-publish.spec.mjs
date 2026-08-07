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
    if (url.pathname === '/repos/cm5wxjmcpv-bit/Game-v2') return json(route, { full_name: 'cm5wxjmcpv-bit/Game-v2' });
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
      return json(route, { number: 22, html_url: 'https://github.com/cm5wxjmcpv-bit/Game-v2/pull/22' }, 201);
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
  await expect(page.locator('#publishPlanSummary')).toContainText('draft pull request');
  await page.locator('#publishTokenInput').fill('github_pat_browser_test');
  await page.locator('#publishConfirmInput').check();
  await expect(page.locator('#publishDraftPrBtn')).toBeEnabled();
  await page.locator('#publishDraftPrBtn').click();

  await expect(page.locator('#publishPrLink')).toBeVisible();
  await expect(page.locator('#publishPrLink')).toHaveAttribute('href', 'https://github.com/cm5wxjmcpv-bit/Game-v2/pull/22');
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
  await expect(page.locator('#publishPlanSummary')).toContainText('no changed game files');
  await expect(page.locator('#publishDraftPrBtn')).toBeDisabled();
});

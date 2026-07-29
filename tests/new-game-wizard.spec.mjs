import { expect, test } from '@playwright/test';
import fs from 'node:fs/promises';

const corsHeaders = {
  'access-control-allow-origin': 'http://127.0.0.1:4173',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'Accept,Authorization,Content-Type,X-GitHub-Api-Version',
  'content-type': 'application/json',
};

function json(route, payload, status = 200) {
  return route.fulfill({ status, headers: corsHeaders, body: JSON.stringify(payload) });
}

test('new game wizard previews and publishes a complete package through a draft PR', async ({ page }) => {
  const catalogFile = await fs.readFile('games/catalog.json', 'utf8');
  const apiCalls = [];
  const pageErrors = [];
  let blobIndex = 0;
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.route('https://api.github.com/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: corsHeaders, body: '' });
    const body = request.postDataJSON?.() || null;
    apiCalls.push({ method, path: url.pathname, body, authorization: request.headers().authorization });
    if (url.pathname === '/repos/cm5wxjmcpv-bit/Game-v2') return json(route, { full_name: 'cm5wxjmcpv-bit/Game-v2' });
    if (url.pathname.endsWith('/git/ref/heads/main')) return json(route, { object: { sha: 'base-sha' } });
    if (url.pathname.includes('/contents/games/catalog.json')) {
      return json(route, { type: 'file', encoding: 'base64', content: Buffer.from(catalogFile).toString('base64') });
    }
    if (url.pathname.includes('/contents/games/rescue-quest/')) return json(route, { message: 'Not Found' }, 404);
    if (url.pathname.endsWith('/git/commits/base-sha')) return json(route, { tree: { sha: 'base-tree' } });
    if (url.pathname.endsWith('/git/blobs')) return json(route, { sha: `blob-${blobIndex += 1}` }, 201);
    if (url.pathname.endsWith('/git/trees')) return json(route, { sha: 'wizard-tree' }, 201);
    if (url.pathname.endsWith('/git/commits')) return json(route, { sha: 'wizard-commit' }, 201);
    if (url.pathname.endsWith('/git/refs')) return json(route, { ref: body.ref }, 201);
    if (url.pathname.endsWith('/pulls')) {
      return json(route, { number: 26, html_url: 'https://github.com/cm5wxjmcpv-bit/Game-v2/pull/26' }, 201);
    }
    return json(route, { message: `Unexpected ${method} ${url.pathname}` }, 404);
  });

  await page.goto('/builder/workspace.html?game=scene-demo');
  await expect(page.locator('#projectSummary')).toContainText('Generic Scene Demo');
  await page.locator('#workspaceNewGameTabBtn').click();
  await expect(page.locator('#workspaceNewGameTab')).toHaveClass(/active/);

  await page.locator('#newGameNameInput').fill('Rescue Quest');
  await expect(page.locator('#newGameIdInput')).toHaveValue('rescue-quest');
  await page.locator('#newGamePlayerInput').fill('Responder');
  await page.locator('#newGameMapWidthInput').fill('12');
  await page.locator('#newGameMapHeightInput').fill('9');

  await expect(page.locator('#newGamePlanSummary')).toContainText('Rescue Quest');
  await expect(page.locator('#newGameFileTree')).toContainText('games/rescue-quest/game.json');
  await expect(page.locator('#newGameFileTree')).toContainText('games/rescue-quest/data/config/save.json');
  await expect(page.locator('#newGameFileTree')).toContainText('games/rescue-quest/data/scenes/start.json');
  await page.locator('[data-wizard-path="games/rescue-quest/game.json"]').click();
  await expect(page.locator('#newGameFilePreview')).toContainText('"id": "rescue-quest"');
  await expect(page.locator('#newGameFilePreview')).toContainText('"startScene"');

  await page.locator('#newGameTokenInput').fill('github_pat_wizard_test');
  await page.locator('#newGameConfirmInput').check();
  await expect(page.locator('#newGamePublishBtn')).toBeEnabled();
  await page.locator('#newGamePublishBtn').click();

  await expect(page.locator('#newGamePrLink')).toBeVisible();
  await expect(page.locator('#newGamePrLink')).toHaveAttribute('href', 'https://github.com/cm5wxjmcpv-bit/Game-v2/pull/26');
  await expect(page.locator('#newGameStatus')).toContainText('Draft pull request #26 created');
  await expect(page.locator('#newGameTokenInput')).toHaveValue('');
  expect(pageErrors).toEqual([]);

  const storedValues = await page.evaluate(() => Object.keys(localStorage).map((key) => localStorage.getItem(key) || ''));
  expect(storedValues.join('\n')).not.toContain('github_pat_wizard_test');
  expect(apiCalls.every((call) => call.authorization === 'Bearer github_pat_wizard_test')).toBe(true);
  expect(apiCalls.find((call) => call.path.endsWith('/git/refs')).body.ref).toMatch(/^refs\/heads\/workspace\/rescue-quest-/);
  const tree = apiCalls.find((call) => call.path.endsWith('/git/trees')).body.tree;
  expect(tree.some((entry) => entry.path === 'games/catalog.json')).toBe(true);
  expect(tree.some((entry) => entry.path === 'games/rescue-quest/game.json')).toBe(true);
  const pullRequest = apiCalls.find((call) => call.path.endsWith('/pulls')).body;
  expect(pullRequest.draft).toBe(true);
  expect(pullRequest.base).toBe('main');
  expect(pullRequest.head).toMatch(/^workspace\/rescue-quest-/);
});

test('new game wizard blocks a duplicate package ID', async ({ page }) => {
  await page.goto('/builder/workspace.html?game=scene-demo');
  await expect(page.locator('#projectSummary')).toContainText('Generic Scene Demo');
  await page.locator('#workspaceNewGameTabBtn').click();
  await page.locator('#newGameIdInput').fill('scene-demo');
  await expect(page.locator('#newGamePlanSummary')).toContainText('already uses');
  await expect(page.locator('#newGameFileTree')).toBeEmpty();
  await expect(page.locator('#newGamePublishBtn')).toBeDisabled();
});

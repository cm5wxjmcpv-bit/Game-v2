import { expect, test } from '@playwright/test';

const ROUTES = [
  { path: '/?game=sample-rpg', marker: '#new-game' },
  { path: '/?game=sandbox-demo', marker: '#new-game' },
  { path: '/?game=scene-demo', marker: '#new-game' },
  { path: '/builder/', marker: '#gridContainer' },
  { path: '/builder/workspace.html?game=scene-demo', marker: '#projectSummary' },
  { path: '/builder/viewer.html', marker: 'body' },
];

function monitorPage(page) {
  const consoleErrors = [];
  const pageErrors = [];
  const badResponses = [];
  const failedRequests = [];

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) {
      badResponses.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.url()} (${request.failure()?.errorText || 'failed'})`);
  });

  return {
    assertClean(label) {
      expect.soft(consoleErrors, `${label}: console errors`).toEqual([]);
      expect.soft(pageErrors, `${label}: uncaught errors`).toEqual([]);
      expect.soft(badResponses, `${label}: HTTP errors`).toEqual([]);
      expect.soft(failedRequests, `${label}: failed requests`).toEqual([]);
    },
  };
}

async function expectNoHorizontalOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body?.scrollWidth || 0,
  }));
  expect.soft(
    Math.max(dimensions.document, dimensions.body),
    `${label}: page should not overflow horizontally`,
  ).toBeLessThanOrEqual(dimensions.viewport + 2);
}

for (const route of ROUTES) {
  test(`route remains functional and contained: ${route.path}`, async ({ page }) => {
    const monitor = monitorPage(page);
    await page.goto(route.path);
    await expect(page.locator(route.marker).first()).toBeVisible();
    await expectNoHorizontalOverflow(page, route.path);
    monitor.assertClean(route.path);
  });
}

test('missing map handoff fails safely without broken requests', async ({ page }) => {
  const monitor = monitorPage(page);
  await page.goto('/builder/map-bridge.html');
  await expect(page.locator('#bridgeStatus')).toContainText(/No valid workspace map handoff/i);
  await expect(page.locator('#returnBridgeBtn')).toBeDisabled();
  await expect(page.locator('#cancelBridgeBtn')).toBeVisible();
  await expectNoHorizontalOverflow(page, 'missing map handoff');
  monitor.assertClean('missing map handoff');
});

test('corrupted game saves do not prevent a clean new-game screen', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('pixel_engine_save_scene-demo_slot_1', '{not-valid-json');
    localStorage.setItem('pixel_engine_save_v1', 'null');
  });
  const monitor = monitorPage(page);
  await page.goto('/?game=scene-demo');
  await expect(page.locator('#new-game')).toBeVisible();
  await expect(page.locator('#load-game')).toBeHidden();
  monitor.assertClean('corrupted game save');
});

test('corrupted workspace draft falls back to package data', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('pixel_engine_builder_workspace_scene-demo', '{broken');
  });
  const monitor = monitorPage(page);
  await page.goto('/builder/workspace.html?game=scene-demo');
  await expect(page.locator('#projectSummary')).toContainText('Generic Scene Demo');
  await expect(page.locator('#sceneSelect')).toHaveValue('scene_lab');
  await expect(page.locator('#actorList')).toContainText('Scene Explorer');
  monitor.assertClean('corrupted workspace draft');
});

test('rapid package switching finishes on the final requested project', async ({ page }) => {
  const monitor = monitorPage(page);
  await page.goto('/builder/workspace.html?game=scene-demo');
  await expect(page.locator('#projectSummary')).toContainText('Generic Scene Demo');

  await page.locator('#projectSelect').selectOption('sample-rpg');
  await page.locator('#projectSelect').selectOption('sandbox-demo');
  await page.locator('#projectSelect').selectOption('scene-demo');

  await expect(page.locator('#projectSummary')).toContainText('Generic Scene Demo');
  await expect(page.locator('#sceneSelect')).toHaveValue('scene_lab');
  await expect(page.locator('#packageTileSummary')).toContainText('3 registered tile(s)');
  monitor.assertClean('rapid package switching');
});

test('a failed stale project request cannot surface after a newer project loads', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route('**/games/sample-rpg/game.json', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"expected audit failure"}' });
  });

  await page.goto('/builder/workspace.html?game=scene-demo');
  await expect(page.locator('#projectSummary')).toContainText('Generic Scene Demo');
  const staleRequest = page.waitForRequest(/\/games\/sample-rpg\/game\.json$/);
  await page.locator('#projectSelect').selectOption('sample-rpg');
  await staleRequest;
  await page.locator('#projectSelect').selectOption('scene-demo');

  await expect(page.locator('#projectSummary')).toContainText('Generic Scene Demo');
  await expect(page.locator('#sceneSelect')).toHaveValue('scene_lab');
  await page.waitForTimeout(350);
  expect(pageErrors).toEqual([]);
});

test('workspace primary controls are keyboard reachable', async ({ page }) => {
  await page.goto('/builder/workspace.html?game=scene-demo');
  await expect(page.locator('#projectSummary')).toContainText('Generic Scene Demo');

  const reached = await page.evaluate(async () => {
    const targets = new Set(['projectSelect', 'loadProjectBtn', 'saveDraftBtn', 'workspaceSceneTabBtn']);
    const visited = [];
    for (let index = 0; index < 40; index += 1) {
      document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
      visited.push(document.activeElement?.id || document.activeElement?.tagName || '');
      if ([...targets].every((id) => visited.includes(id))) break;
    }
    return visited;
  });

  // Browser-native Tab movement cannot be synthesized reliably inside page.evaluate,
  // so the real keyboard loop below is authoritative; the evaluated list remains diagnostic.
  const realVisited = [];
  for (let index = 0; index < 40; index += 1) {
    await page.keyboard.press('Tab');
    realVisited.push(await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName || ''));
  }
  for (const id of ['projectSelect', 'loadProjectBtn', 'saveDraftBtn', 'workspaceSceneTabBtn']) {
    expect.soft(realVisited, `keyboard focus should reach ${id}; diagnostic=${reached.join(',')}`).toContain(id);
  }
});

test('builder tab controls remain operable with keyboard activation', async ({ page }) => {
  const monitor = monitorPage(page);
  await page.goto('/builder/');
  const itemTab = page.locator('#tabItemEditorBtn');
  await itemTab.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#itemEditorTab')).toHaveClass(/active/);

  const textureTab = page.locator('#tabTextureBuilderBtn');
  await textureTab.focus();
  await page.keyboard.press('Space');
  await expect(page.locator('#textureBuilderTab')).toHaveClass(/active/);
  monitor.assertClean('builder keyboard tabs');
});

test('builder tabs expose synchronized accessible tab semantics', async ({ page }) => {
  await page.goto('/builder/');
  const tabs = [
    ['tabMapEditorBtn', 'mapEditorTab'],
    ['tabViewerBtn', 'viewerTab'],
    ['tabItemEditorBtn', 'itemEditorTab'],
    ['tabTextureBuilderBtn', 'textureBuilderTab'],
  ];
  await expect(page.locator('.tab-bar').first()).toHaveAttribute('role', 'tablist');

  for (const [buttonId, panelId] of tabs) {
    const button = page.locator(`#${buttonId}`);
    const panel = page.locator(`#${panelId}`);
    await expect(button).toHaveAttribute('role', 'tab');
    await expect(button).toHaveAttribute('aria-controls', panelId);
    await expect(panel).toHaveAttribute('role', 'tabpanel');
    await expect(panel).toHaveAttribute('aria-labelledby', buttonId);
    await button.click();
    await expect(button).toHaveAttribute('aria-selected', 'true');
    await expect(panel).toBeVisible();
    await expectNoHorizontalOverflow(page, `builder tab ${buttonId}`);
  }
});

test('every workspace workflow panel remains contained after activation', async ({ page }) => {
  await page.goto('/builder/workspace.html?game=scene-demo');
  await expect(page.locator('#projectSummary')).toContainText('Generic Scene Demo');
  await expect(page.locator('#workspaceObjectsTabBtn')).toBeVisible();
  const tabs = [
    ['workspaceSceneTabBtn', 'workspaceSceneTab'],
    ['workspaceActorTabBtn', 'workspaceActorTab'],
    ['workspaceObjectsTabBtn', 'workspaceObjectsTab'],
    ['workspaceNewGameTabBtn', 'workspaceNewGameTab'],
    ['workspacePublishTabBtn', 'workspacePublishTab'],
  ];

  for (const [buttonId, panelId] of tabs) {
    const button = page.locator(`#${buttonId}`);
    const panel = page.locator(`#${panelId}`);
    await expect(button).toHaveAttribute('role', 'tab');
    await expect(button).toHaveAttribute('aria-controls', panelId);
    await expect(panel).toHaveAttribute('role', 'tabpanel');
    await expect(panel).toHaveAttribute('aria-labelledby', buttonId);
    await button.click();
    await expect(button).toHaveAttribute('aria-selected', 'true');
    await expect(button).toHaveAttribute('tabindex', '0');
    await expect(panel).toHaveAttribute('aria-hidden', 'false');
    await expect(panel).toBeVisible();
    await expectNoHorizontalOverflow(page, `workspace tab ${buttonId}`);
  }

  await page.locator('#workspaceSceneTabBtn').click();
  await page.locator('#workspaceSceneTabBtn').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#workspaceActorTabBtn')).toBeFocused();
  await expect(page.locator('#workspaceActorTabBtn')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#workspaceActorTab')).toBeVisible();
});

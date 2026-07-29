import { expect, test } from '@playwright/test';

function monitorPage(page) {
  const consoleErrors = [];
  const pageErrors = [];
  const badResponses = [];
  const failedRequests = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) badResponses.push(`${response.status()} ${response.url()}`);
  });
  page.on('requestfailed', (request) => failedRequests.push(`${request.url()} (${request.failure()?.errorText || 'failed'})`));
  return {
    assertClean(label) {
      expect.soft(consoleErrors, `${label}: browser console errors`).toEqual([]);
      expect.soft(pageErrors, `${label}: uncaught page errors`).toEqual([]);
      expect.soft(badResponses, `${label}: HTTP error responses`).toEqual([]);
      expect.soft(failedRequests, `${label}: failed network requests`).toEqual([]);
    },
  };
}

test('workspace scene completes a lossless tile and spawn round trip through the established map editor', async ({ page }) => {
  const monitor = monitorPage(page);
  await page.goto('/builder/workspace.html?game=scene-demo');
  await expect(page.locator('#projectSummary')).toContainText('Generic Scene Demo');
  await expect(page.locator('#sceneSelect')).toHaveValue('scene_lab');
  await expect(page.locator('#openMapEditorBtn')).toBeVisible();

  await page.locator('#openMapEditorBtn').click();
  await expect(page).toHaveURL(/\/builder\/map-bridge\.html$/);
  await expect(page.locator('#bridgeTitle')).toContainText('scene_lab');
  await expect(page.locator('#returnBridgeBtn')).toBeEnabled();

  const builder = page.frameLocator('#builderFrame');
  await expect(builder.locator('#mapIdInput')).toHaveValue('scene_lab');
  await expect(builder.locator('#mapIdInput')).toBeDisabled();
  await expect(builder.locator('#gridContainer .cell')).toHaveCount(30);
  await expect(builder.locator('#tabItemEditorBtn')).toBeDisabled();

  await builder.locator('#mapNameInput').fill('Edited Generic Scene Lab');
  await builder.locator('#layerTileBtn').click();
  await expect(builder.locator('.tile-btn[data-tile-id="custom_texture_bridge_1"]')).toBeEnabled();
  await builder.locator('.tile-btn[data-tile-id="custom_texture_bridge_1"]').click();
  await builder.locator('.cell[data-row="1"][data-col="1"]').click();

  await builder.locator('#layerObjectBtn').click();
  await expect(builder.locator('.tile-btn[data-tile-id="player_start"]')).toBeEnabled();
  await expect(builder.locator('.tile-btn[data-tile-id="portal_level"]')).toBeDisabled();
  await builder.locator('#eraserBtn').click();
  await builder.locator('.cell[data-row="1"][data-col="1"]').click();
  await builder.locator('.tile-btn[data-tile-id="player_start"]').click();
  await builder.locator('.cell[data-row="3"][data-col="2"]').click();

  await page.locator('#returnBridgeBtn').click();
  await expect(page).toHaveURL(/\/builder\/workspace\.html\?game=scene-demo$/);
  await expect(page.locator('#workspaceMessage')).toContainText('Map layout returned');

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pixel_engine_builder_workspace_scene-demo')));
  const scene = saved.scenes.find((entry) => entry.id === 'scene_lab');
  expect(scene.name).toBe('Edited Generic Scene Lab');
  expect(scene.tiles[1][1]).toBe('scene_wall');
  expect(scene.spawn).toEqual({ x: 2, y: 3 });
  expect(scene.entities.map((entry) => entry.id).sort()).toEqual(['solid_crate', 'welcome_beacon']);
  expect(scene.objects.portals).toEqual([{ x: 4, y: 3, targetScene: 'fallback_room' }]);
  expect(JSON.stringify(scene)).not.toContain('custom_texture_bridge_');

  const libraryRaw = await page.evaluate(() => localStorage.getItem('levelBuilderCustomTextureLibrary'));
  expect(libraryRaw || '').not.toContain('custom_texture_bridge_');
  monitor.assertClean('workspace map bridge');
});

test('map bridge without a workspace handoff fails safely', async ({ page }) => {
  const monitor = monitorPage(page);
  await page.goto('/builder/map-bridge.html');
  await expect(page.locator('#bridgeStatus')).toContainText(/No valid workspace map handoff/i);
  await expect(page.locator('#returnBridgeBtn')).toBeDisabled();
  await expect(page.locator('#cancelBridgeBtn')).toContainText('Back to Workspace');
  monitor.assertClean('missing map bridge handoff');
});

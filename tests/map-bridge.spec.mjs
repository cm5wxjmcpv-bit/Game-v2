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

test('workspace builds a custom texture into a level and stages both for publishing', async ({ page }) => {
  const monitor = monitorPage(page);
  await page.goto('/builder/workspace.html?game=scene-demo');
  await expect(page.locator('#projectSummary')).toContainText('Generic Scene Demo');
  await expect(page.locator('#sceneSelect')).toHaveValue('scene_lab');
  await expect(page.locator('#openMapEditorBtn')).toHaveText('Build Level & Textures');
  await expect(page.locator('#packageTileSummary')).toContainText('2 of 3');

  const accentToggle = page.locator('[data-package-tile-id="scene_accent"]');
  await expect(accentToggle).toBeVisible();
  await expect(accentToggle).not.toBeChecked();
  await accentToggle.check();
  await expect(page.locator('#packageTileSummary')).toContainText('3 of 3');
  await expect(page.locator('#workspaceMessage')).toContainText('tile permissions saved');

  await page.locator('#openMapEditorBtn').click();
  await expect(page).toHaveURL(/\/builder\/map-bridge\.html$/);
  await expect(page.locator('#bridgeTitle')).toContainText('scene_lab');
  await expect(page.locator('#returnBridgeBtn')).toHaveText('Send Level & Textures to Workspace');
  await expect(page.locator('#returnBridgeBtn')).toBeEnabled();

  const builder = page.frameLocator('#builderFrame');
  await expect(builder.locator('#mapIdInput')).toHaveValue('scene_lab');
  await expect(builder.locator('#mapIdInput')).toBeDisabled();
  await expect(builder.locator('#gridContainer .cell')).toHaveCount(30);
  await expect(builder.locator('.site-header')).toBeHidden();
  await expect(builder.locator('#tabViewerBtn')).toBeHidden();
  await expect(builder.locator('#tabItemEditorBtn')).toBeHidden();
  await expect(builder.locator('.game-texture-pack-panel')).toBeHidden();
  await expect(builder.locator('.game-sync-preview-panel')).toBeHidden();
  await expect(builder.locator('#openViewerBtn')).toBeHidden();
  await expect(builder.locator('#tabTextureBuilderBtn')).toBeEnabled();

  await builder.locator('#tabTextureBuilderBtn').click();
  await expect(builder.locator('#textureBuilderTab')).toHaveClass(/active/);
  await builder.locator('#textureFilenameInput').fill('Crimson Floor');
  await builder.locator('#textureColorPicker').fill('#aa1122');
  await builder.locator('.texture-cell[data-row="0"][data-col="0"]').click();
  await builder.locator('.texture-cell[data-row="0"][data-col="1"]').click();
  await builder.locator('#textureSaveAndUseBtn').click();
  await expect(builder.locator('#mapEditorTab')).toHaveClass(/active/);
  await expect(builder.locator('#selectedToolLabel')).toContainText('custom_texture_crimson_floor');
  await expect(builder.locator('#message')).toContainText('ready to paint');

  await builder.locator('#mapNameInput').fill('Edited Generic Scene Lab');
  await builder.locator('#layerTileBtn').click();
  const customTile = builder.locator('.tile-btn[data-tile-id="custom_texture_crimson_floor"]');
  await expect(customTile).toBeEnabled();
  await customTile.click();
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
  await expect(page.locator('#workspaceMessage')).toContainText('1 used custom texture');
  await expect(page.locator('#workspaceMessage')).toContainText('Scene Objects');

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pixel_engine_builder_workspace_scene-demo')));
  const scene = saved.scenes.find((entry) => entry.id === 'scene_lab');
  expect(scene.name).toBe('Edited Generic Scene Lab');
  expect(scene.tiles[1][1]).toBe('custom_texture_crimson_floor');
  expect(scene.spawn).toEqual({ x: 2, y: 3 });
  expect(scene._workspaceEditorTileIds).toContain('custom_texture_crimson_floor');
  expect(scene.entities.map((entry) => entry.id).sort()).toEqual(['solid_crate', 'welcome_beacon']);
  expect(scene.objects.portals).toEqual([{ x: 4, y: 3, targetScene: 'fallback_room' }]);
  expect(JSON.stringify(scene)).not.toContain('custom_texture_bridge_');

  const assets = await page.evaluate(() => JSON.parse(localStorage.getItem('pixel_engine_builder_assets_scene-demo')));
  expect(assets.textures).toHaveLength(1);
  expect(assets.textures[0].id).toBe('custom_texture_crimson_floor');
  expect(assets.textures[0].image).toMatch(/^data:image\/png;base64,/);

  const libraryRaw = await page.evaluate(() => localStorage.getItem('levelBuilderCustomTextureLibrary'));
  expect(libraryRaw || '').not.toContain('custom_texture_bridge_');
  expect(libraryRaw || '').not.toContain('custom_texture_crimson_floor');

  await page.locator('#workspacePublishTabBtn').click();
  await expect(page.locator('#publishStatus')).toContainText('ready for review');
  await expect(page.locator('#publishFileList')).toContainText('games/scene-demo/data/scenes/scene_lab.json');
  await expect(page.locator('#publishFileList')).toContainText('games/scene-demo/data/core.json');
  await expect(page.locator('#publishFileList')).toContainText('tiles/textures');
  monitor.assertClean('workspace custom texture level workflow');
});

test('image import saves, maps, and stages a custom texture without manual mapping', async ({ page }) => {
  const monitor = monitorPage(page);
  await page.goto('/builder/workspace.html?game=scene-demo');
  await expect(page.locator('#projectSummary')).toContainText('Generic Scene Demo');
  await expect(page.locator('#openMapEditorBtn')).toBeEnabled();
  await page.locator('#openMapEditorBtn').click();
  await expect(page).toHaveURL(/\/builder\/map-bridge\.html$/);

  const builder = page.frameLocator('#builderFrame');
  await builder.locator('#tabTextureBuilderBtn').click();
  await expect(builder.locator('#textureBuilderTab')).toHaveClass(/active/);
  await expect(builder.locator('#textureImageImportInput')).toHaveAttribute('accept', /image\/png/);
  await builder.locator('#textureSizeSelect').selectOption('32');
  await builder.locator('#textureImageImportMode').selectOption('fit');

  const imageBase64 = await builder.locator('body').evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 2;
    const context = canvas.getContext('2d');
    context.fillStyle = '#cc3311';
    context.fillRect(0, 0, 2, 2);
    context.fillStyle = '#2255dd';
    context.fillRect(2, 0, 2, 2);
    return canvas.toDataURL('image/png').split(',')[1];
  });

  await builder.locator('#textureImageImportInput').setInputFiles({
    name: 'Castle Brick.png',
    mimeType: 'image/png',
    buffer: Buffer.from(imageBase64, 'base64'),
  });

  await expect(builder.locator('#mapEditorTab')).toHaveClass(/active/);
  await expect(builder.locator('#selectedToolLabel')).toContainText('custom_texture_castle_brick');
  await expect(builder.locator('#message')).toContainText('saved, mapped, and ready to paint');
  const importedTile = builder.locator('.tile-btn[data-tile-id="custom_texture_castle_brick"]');
  await expect(importedTile).toBeVisible();
  await expect(importedTile).toBeEnabled();
  await builder.locator('.cell[data-row="2"][data-col="2"]').click();

  const importedLibraryEntry = await builder.locator('body').evaluate(() => {
    const library = JSON.parse(localStorage.getItem('levelBuilderCustomTextureLibrary'));
    return library.textures.find((entry) => entry.id === 'custom_texture_castle_brick');
  });
  expect(importedLibraryEntry.size).toBe(32);
  expect(importedLibraryEntry.pixels).toHaveLength(32);
  expect(importedLibraryEntry.pixels[0][0]).toBeNull();
  expect(importedLibraryEntry.pixels[8][0].color).toBe('#cc3311');
  expect(importedLibraryEntry.pixels[8][31].color).toBe('#2255dd');

  await page.locator('#returnBridgeBtn').click();
  await expect(page).toHaveURL(/\/builder\/workspace\.html\?game=scene-demo$/);
  await expect(page.locator('#workspaceMessage')).toContainText('1 used custom texture');

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pixel_engine_builder_workspace_scene-demo')));
  const scene = saved.scenes.find((entry) => entry.id === 'scene_lab');
  expect(scene.tiles[2][2]).toBe('custom_texture_castle_brick');

  const assets = await page.evaluate(() => JSON.parse(localStorage.getItem('pixel_engine_builder_assets_scene-demo')));
  expect(assets.textures).toHaveLength(1);
  expect(assets.textures[0].id).toBe('custom_texture_castle_brick');
  expect(assets.textures[0].image).toMatch(/^data:image\/png;base64,/);

  await page.locator('#workspacePublishTabBtn').click();
  await expect(page.locator('#publishStatus')).toContainText('ready for review');
  await expect(page.locator('#publishFileList')).toContainText('tiles/textures');
  monitor.assertClean('image import texture workflow');
});

test('map bridge without a workspace handoff fails safely', async ({ page }) => {
  const monitor = monitorPage(page);
  await page.goto('/builder/map-bridge.html');
  await expect(page.locator('#bridgeStatus')).toContainText(/No valid workspace map handoff/i);
  await expect(page.locator('#returnBridgeBtn')).toBeDisabled();
  await expect(page.locator('#cancelBridgeBtn')).toContainText('Back to Workspace');
  monitor.assertClean('missing map bridge handoff');
});

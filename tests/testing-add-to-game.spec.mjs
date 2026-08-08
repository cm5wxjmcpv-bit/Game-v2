import { expect, test } from '@playwright/test';

const TESTING_LIBRARY_KEY = 'pixel_engine_testing_level_library_v1';
const WORKSPACE_DRAFT_KEY = 'pixel_engine_builder_workspace_scene-demo';
const WORKSPACE_ASSET_KEY = 'pixel_engine_builder_assets_scene-demo';

function savedMap(mapId = 'library_level', mapName = 'Library Level', mapType = 'level') {
  return {
    version: 1,
    levels: [{
      libraryId: `testing_${mapId}_1`,
      name: mapName,
      createdAt: '2026-08-07T22:00:00.000Z',
      updatedAt: '2026-08-07T22:00:00.000Z',
      textures: [],
      map: {
        width: 2,
        height: 2,
        mapType,
        mapId,
        mapName,
        tiles: [['floor_grass', 'floor_sand'], ['wall_stone', 'floor_grass']],
        tileLayer: [['floor_grass', 'floor_sand'], ['wall_stone', 'floor_grass']],
        objectLayer: [['player_start', 'none'], ['none', 'none']],
      },
    }],
  };
}

test('Add to Game creates an independent game workspace scene and stages world registration', async ({ page }) => {
  const originalLibrary = savedMap();
  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(key, JSON.stringify(value));
  }, { key: TESTING_LIBRARY_KEY, value: originalLibrary });

  await page.goto('/builder/testing-space.html');
  const card = page.locator('[data-testing-level-id="testing_library_level_1"]');
  await card.getByRole('button', { name: 'Add to Game' }).click();

  const dialog = page.getByRole('dialog', { name: 'Add Testing Map to Game' });
  await expect(dialog).toBeVisible();
  await dialog.locator('#testingAddGameSelect').selectOption('scene-demo');
  await dialog.getByRole('button', { name: 'Add to Game Workspace' }).click();

  await page.waitForURL(/\/builder\/workspace\.html\?game=scene-demo/);
  await expect(page.locator('#workspaceMessage')).toContainText('Testing Space original is unchanged');
  await expect(page.locator('#sceneSelect')).toHaveValue('library_level');
  await expect(page.locator('#sceneSelect option[value="library_level"]')).toContainText('[level]');

  const staged = await page.evaluate(({ draftKey, assetKey, libraryKey }) => ({
    draft: JSON.parse(localStorage.getItem(draftKey)),
    assets: JSON.parse(localStorage.getItem(assetKey)),
    library: JSON.parse(localStorage.getItem(libraryKey)),
  }), { draftKey: WORKSPACE_DRAFT_KEY, assetKey: WORKSPACE_ASSET_KEY, libraryKey: TESTING_LIBRARY_KEY });

  const copied = staged.draft.scenes.find((scene) => scene.id === 'library_level');
  expect(copied).toBeTruthy();
  expect(copied.name).toBe('Library Level');
  expect(copied.mapType).toBe('level');
  expect(copied.tiles).toEqual([
    ['floor_grass_a', 'floor_sand_a'],
    ['wall_rock_a', 'floor_grass_a'],
  ]);
  expect(copied.spawn).toEqual({ x: 0, y: 0 });
  expect(staged.assets.files).toHaveLength(1);
  expect(staged.assets.files[0].path).toBe('games/scene-demo/data/world.json');
  expect(staged.assets.files[0].currentPayload.levels).toContain('library_level');
  expect(staged.library).toEqual(originalLibrary);

  await page.locator('#workspacePublishTabBtn').click();
  await expect(page.locator('#publishPlanSummary')).not.toContainText('cannot be published');
  await expect(page.locator('#publishFileList')).toContainText('games/scene-demo/data/levels/library_level.json');
  await expect(page.locator('#publishFileList')).toContainText('games/scene-demo/data/world.json');
});

test('Add to Game refuses to overwrite a game scene with the same ID', async ({ page }) => {
  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(key, JSON.stringify(value));
  }, { key: TESTING_LIBRARY_KEY, value: savedMap('scene_lab', 'Collision Level') });

  await page.goto('/builder/testing-space.html');
  await page.getByRole('button', { name: 'Add to Game' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add Testing Map to Game' });
  await dialog.locator('#testingAddGameSelect').selectOption('scene-demo');
  await dialog.getByRole('button', { name: 'Add to Game Workspace' }).click();

  await page.waitForURL(/\/builder\/workspace\.html\?game=scene-demo/);
  await expect(page.locator('#workspaceMessage')).toContainText(/already exists.*never overwritten/i);
  const sceneOptions = page.locator('#sceneSelect option[value="scene_lab"]');
  await expect(sceneOptions).toHaveCount(1);

  const assetDraft = await page.evaluate((key) => localStorage.getItem(key), WORKSPACE_ASSET_KEY);
  expect(assetDraft).toBeNull();
});

test('Building maps stay Buildings from Testing Space through the publish plan', async ({ page }) => {
  const originalLibrary = savedMap('blacksmith_shop', 'Blacksmith Shop', 'building');
  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(key, JSON.stringify(value));
  }, { key: TESTING_LIBRARY_KEY, value: originalLibrary });

  await page.goto('/builder/testing-space.html');
  const card = page.locator('[data-testing-level-id="testing_blacksmith_shop_1"]');
  await expect(card).toContainText('Building map');
  await card.getByRole('button', { name: 'Add to Game' }).click();

  const dialog = page.getByRole('dialog', { name: 'Add Testing Map to Game' });
  await dialog.locator('#testingAddGameSelect').selectOption('scene-demo');
  await dialog.getByRole('button', { name: 'Add to Game Workspace' }).click();

  await page.waitForURL(/\/builder\/workspace\.html\?game=scene-demo/);
  await expect(page.locator('#workspaceMessage')).toContainText('new building');
  await expect(page.locator('#sceneSelect')).toHaveValue('blacksmith_shop');
  await expect(page.locator('#sceneSelect option[value="blacksmith_shop"]')).toContainText('[building]');

  const staged = await page.evaluate(({ draftKey, assetKey, libraryKey }) => ({
    draft: JSON.parse(localStorage.getItem(draftKey)),
    assets: JSON.parse(localStorage.getItem(assetKey)),
    library: JSON.parse(localStorage.getItem(libraryKey)),
  }), { draftKey: WORKSPACE_DRAFT_KEY, assetKey: WORKSPACE_ASSET_KEY, libraryKey: TESTING_LIBRARY_KEY });

  const copied = staged.draft.scenes.find((scene) => scene.id === 'blacksmith_shop');
  expect(copied).toBeTruthy();
  expect(copied.mapType).toBe('building');
  expect(staged.assets.files).toHaveLength(1);
  expect(staged.assets.files[0].currentPayload.buildings).toContain('blacksmith_shop');
  expect(staged.assets.files[0].currentPayload.levels || []).not.toContain('blacksmith_shop');
  expect(staged.assets.files[0].currentPayload.towns || []).not.toContain('blacksmith_shop');
  expect(staged.library).toEqual(originalLibrary);

  await page.locator('#workspacePublishTabBtn').click();
  await expect(page.locator('#publishPlanSummary')).not.toContainText('cannot be published');
  await expect(page.locator('#publishFileList')).toContainText('games/scene-demo/data/buildings/blacksmith_shop.json');
  await expect(page.locator('#publishFileList')).toContainText('games/scene-demo/data/world.json');
});

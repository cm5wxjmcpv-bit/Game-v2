import { expect, test } from '@playwright/test';

const LIBRARY_KEY = 'pixel_engine_testing_level_library_v1';

test('Main Hub exposes the project-neutral Testing Space', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Open Testing Space' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Testing Space', exact: true }).first()).toHaveAttribute('href', './builder/testing-space.html');
});

test('testing level can be built, saved, managed, previewed, and reopened', async ({ page }) => {
  await page.goto('/builder/testing-editor.html?testing=new');
  const builder = page.frameLocator('#testingBuilderFrame');

  await expect(builder.locator('#gridContainer .cell')).toHaveCount(900);
  await builder.locator('#mapIdInput').fill('testing_library_level');
  await builder.locator('#mapNameInput').fill('Testing Library Level');

  await builder.locator('.tile-btn[data-tile-id="floor_grass_a"]').click();
  await builder.locator('.cell[data-row="2"][data-col="3"]').click();
  await builder.locator('#layerObjectBtn').click();
  await builder.locator('.tile-btn[data-tile-id="player_start"]').click();
  await builder.locator('.cell[data-row="2"][data-col="3"]').click();

  await page.locator('#testingSaveBtn').click();
  await expect(page.locator('#testingEditorStatus')).toContainText('Saved “Testing Library Level”');

  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), LIBRARY_KEY);
  expect(stored.levels).toHaveLength(1);
  expect(stored.levels[0].map.mapId).toBe('testing_library_level');
  expect(stored.levels[0].map.tileLayer[2][3]).toBe('floor_grass_a');
  expect(stored.levels[0].map.objectLayer[2][3]).toBe('player_start');
  const libraryId = stored.levels[0].libraryId;

  await page.goto('/builder/testing-space.html');
  await expect(page.locator(`[data-testing-level-id="${libraryId}"]`)).toContainText('Testing Library Level');
  await expect(page.locator('#testingSummary')).toContainText('1 saved testing level');

  await page.locator(`[data-testing-level-id="${libraryId}"] [data-testing-action="test"]`).click();
  await expect(page.locator('#testingViewerTitle')).toContainText('Testing Library Level');
  const viewer = page.frameLocator('#testingBuilderFrame');
  await expect(viewer.locator('#viewerMapIdLabel')).toHaveText('testing_library_level');
  await expect(viewer.locator('#viewerGridContainer .cell')).toHaveCount(900);

  await page.goto('/builder/testing-space.html');
  await page.locator(`[data-testing-level-id="${libraryId}"] [data-testing-action="edit"]`).click();
  const reopened = page.frameLocator('#testingBuilderFrame');
  await expect(reopened.locator('#mapNameInput')).toHaveValue('Testing Library Level');
  await expect(reopened.locator('.cell[data-row="2"][data-col="3"]')).toHaveAttribute('data-tile-id', 'floor_grass_a');
  await expect(reopened.locator('.cell[data-row="2"][data-col="3"] .cell-marker')).toHaveAttribute('title', 'player_start');
});

test('testing library supports duplicate and delete without touching game saves', async ({ page }) => {
  await page.addInitScript((key) => {
    localStorage.setItem(key, JSON.stringify({
      version: 1,
      levels: [{
        libraryId: 'testing_original_1',
        name: 'Original Test',
        createdAt: '2026-08-07T22:30:00.000Z',
        updatedAt: '2026-08-07T22:30:00.000Z',
        textures: [],
        map: {
          width: 2,
          height: 2,
          mapType: 'level',
          mapId: 'original_test',
          mapName: 'Original Test',
          tiles: [['floor_grass', 'floor_grass'], ['floor_grass', 'floor_grass']],
          tileLayer: [['floor_grass', 'floor_grass'], ['floor_grass', 'floor_grass']],
          objectLayer: [['player_start', 'none'], ['none', 'none']],
        },
      }],
    }));
  }, LIBRARY_KEY);

  await page.goto('/builder/testing-space.html');
  await page.locator('[data-testing-action="duplicate"]').click();
  await expect(page.locator('.testing-level-card')).toHaveCount(2);
  await expect(page.locator('#testingSummary')).toContainText('2 saved testing levels');

  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('[data-testing-level-id="testing_original_1"] [data-testing-action="delete"]').click();
  await expect(page.locator('.testing-level-card')).toHaveCount(1);

  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys.some((key) => key.startsWith('pixel_engine_save_'))).toBe(false);
});

test('Testing Space reports browser storage failure instead of claiming a save succeeded', async ({ page }) => {
  await page.goto('/builder/testing-editor.html?testing=new');
  const builder = page.frameLocator('#testingBuilderFrame');
  await expect(builder.locator('#gridContainer .cell')).toHaveCount(900);
  await builder.locator('#mapNameInput').fill('Storage Failure Level');

  await page.evaluate((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(storageKey, value) {
      if (this === localStorage && String(storageKey) === key) {
        throw new DOMException('Storage quota reached', 'QuotaExceededError');
      }
      return original.call(this, storageKey, value);
    };
  }, LIBRARY_KEY);

  await page.locator('#testingSaveBtn').click();
  await expect(page.locator('#testingEditorStatus')).toContainText(/was not saved|storage/i);
  expect(await page.evaluate((key) => localStorage.getItem(key), LIBRARY_KEY)).toBeNull();
});

import { expect, test } from '@playwright/test';
import fs from 'node:fs/promises';

async function readDownloadJson(download) {
  const path = await download.path();
  return JSON.parse(await fs.readFile(path, 'utf8'));
}

test('runtime renders package text without executing markup', async ({ page }) => {
  const actorPayload = JSON.parse(await fs.readFile('games/scene-demo/data/actors.json', 'utf8'));
  actorPayload.actors[0].name = '<img id="runtime-actor-xss" src="invalid-actor-image" onerror="window.__actorMarkupExecuted=true">';

  const scenePayload = JSON.parse(await fs.readFile('games/scene-demo/data/scenes/scene_lab.json', 'utf8'));
  const beacon = scenePayload.entities.find((entity) => entity.id === 'welcome_beacon');
  beacon.components.interaction.message = '<img id="runtime-message-xss" src="invalid-message-image" onerror="window.__messageMarkupExecuted=true">';

  await page.route('**/games/scene-demo/data/actors.json', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(actorPayload),
  }));
  await page.route('**/games/scene-demo/data/scenes/scene_lab.json', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(scenePayload),
  }));
  await page.addInitScript(() => {
    window.__actorMarkupExecuted = false;
    window.__messageMarkupExecuted = false;
  });

  await page.goto('/?game=scene-demo');
  await page.locator('#new-game').click();
  await page.locator('#class-opts button').first().click();
  await expect(page.locator('#player-panel')).toContainText('runtime-actor-xss');
  expect(await page.locator('#runtime-actor-xss').count()).toBe(0);

  await page.keyboard.press('e');
  await expect(page.locator('#context-panel')).toContainText('runtime-message-xss');
  expect(await page.locator('#runtime-message-xss').count()).toBe(0);
  expect(await page.evaluate(() => ({
    actor: window.__actorMarkupExecuted,
    message: window.__messageMarkupExecuted,
  }))).toEqual({ actor: false, message: false });
});

test('structurally invalid saves are not offered for loading', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('pixel_engine_save_scene-demo_slot_1', JSON.stringify({
      version: 4,
      gameId: 'scene-demo',
      payload: {
        player: { actorId: 'scene_actor', actorName: 'Incomplete' },
        currentSceneId: 'scene_lab',
      },
    }));
  });

  await page.goto('/?game=scene-demo');
  await expect(page.locator('#new-game')).toBeVisible();
  await expect(page.locator('#load-game')).toBeHidden();
});

test('runtime honors wizard-generated disabled save metadata', async ({ page }) => {
  const manifest = JSON.parse(await fs.readFile('games/scene-demo/game.json', 'utf8'));
  manifest.data.settings = 'data/config/settings.json';
  manifest.data.saveMetadata = 'data/config/save.json';
  await page.route('**/games/scene-demo/game.json', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(manifest),
  }));
  await page.route('**/games/scene-demo/data/config/settings.json', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ features: { save: false } }),
  }));
  await page.route('**/games/scene-demo/data/config/save.json', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ enabled: false, slots: 0 }),
  }));

  await page.addInitScript(() => {
    localStorage.setItem('pixel_engine_save_scene-demo_slot_1', JSON.stringify({
      version: 4,
      checkpointAt: 'audit-existing-checkpoint',
      payload: {
        currentSceneId: 'scene_lab',
        player: {
          speed: 3,
          gold: 0,
          stats: { hp: 10, maxHp: 10 },
          bag: { slots: 12, items: [] },
          equipment: {},
          unlocks: { towns: [], levels: [] },
          completedLevels: [],
          effects: [],
        },
      },
    }));
  });

  await page.goto('/?game=scene-demo');
  await expect(page.locator('#new-game')).toBeVisible();
  await expect(page.locator('#load-game')).toBeHidden();
  await page.locator('#new-game').click();
  await page.locator('#class-opts button').first().click();
  await expect(page.locator('#context-panel')).toContainText('Scene: scene_lab');
  const checkpointAt = await page.evaluate(() => JSON.parse(localStorage.getItem('pixel_engine_save_scene-demo_slot_1')).checkpointAt);
  expect(checkpointAt).toBe('audit-existing-checkpoint');
});

test('runtime reports a failed checkpoint save instead of claiming silent success', async ({ page }) => {
  await page.addInitScript(() => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key, value) {
      if (this === localStorage && String(key) === 'pixel_engine_save_scene-demo_slot_1') {
        throw new DOMException('Storage quota reached', 'QuotaExceededError');
      }
      return originalSetItem.call(this, key, value);
    };
  });

  await page.goto('/?game=scene-demo');
  await page.locator('#new-game').click();
  await page.locator('#class-opts button').first().click();
  await expect(page.locator('#context-panel')).toContainText(/could not be saved in this browser/i);
  expect(await page.evaluate(() => localStorage.getItem('pixel_engine_save_scene-demo_slot_1'))).toBeNull();
});

test('custom texture save reports storage failure and does not claim the texture is ready', async ({ page }) => {
  await page.goto('/builder/');
  await page.locator('#tabTextureBuilderBtn').click();
  await page.locator('#textureFilenameInput').fill('Storage Failure Texture');
  await page.locator('.texture-cell[data-row="0"][data-col="0"]').click();
  await page.evaluate(() => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key, value) {
      if (this === localStorage && String(key) === 'levelBuilderCustomTextureLibrary') {
        throw new DOMException('Storage quota reached', 'QuotaExceededError');
      }
      return originalSetItem.call(this, key, value);
    };
  });

  await page.locator('#textureSaveAndUseBtn').click();
  await expect(page.locator('#textureBuilderTab')).toHaveClass(/active/);
  await expect(page.locator('#textureMessage')).toContainText(/could not be saved|storage/i);
  expect(await page.evaluate(() => localStorage.getItem('levelBuilderCustomTextureLibrary'))).toBeNull();
  await expect(page.locator('.tile-btn[data-tile-id="custom_texture_storage_failure_texture"]')).toHaveCount(0);
});

test('map JSON import enforces the same maximum dimensions as manual resizing', async ({ page }) => {
  await page.goto('/builder/');
  const width = 201;
  await page.locator('#importInput').setInputFiles({
    name: 'oversized-map.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      width,
      height: 1,
      mapId: 'oversized',
      tileLayer: [Array(width).fill('floor_grass_a')],
      objectLayer: [Array(width).fill('none')],
    })),
  });

  await expect(page.locator('#message')).toContainText(/limit is 200|must not exceed 200/i);
  await expect(page.locator('#gridContainer .cell')).toHaveCount(900);
});

test('workspace editing preserves unknown actor, entity, spawn, and object metadata', async ({ page }) => {
  const actorPayload = JSON.parse(await fs.readFile('games/scene-demo/data/actors.json', 'utf8'));
  actorPayload.actors[0].components.movement.acceleration = 0.75;
  actorPayload.actors[0].components.quest = { journal: 'intro' };

  const scenePayload = JSON.parse(await fs.readFile('games/scene-demo/data/scenes/scene_lab.json', 'utf8'));
  scenePayload.spawn.facing = 'left';
  scenePayload.objects.weatherZones = [{ x: 0, y: 0, kind: 'rain' }];
  const beacon = scenePayload.entities.find((entity) => entity.id === 'welcome_beacon');
  beacon.persistence = { once: true };
  beacon.components.interaction.prompt = 'Read';
  beacon.components.quest = { id: 'welcome' };

  await page.route('**/games/scene-demo/data/actors.json', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(actorPayload),
  }));
  await page.route('**/games/scene-demo/data/scenes/scene_lab.json', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(scenePayload),
  }));

  await page.goto('/builder/workspace.html?game=scene-demo');
  await expect(page.locator('#projectSummary')).toContainText('Generic Scene Demo');
  await page.locator('#workspaceActorTabBtn').click();
  await page.locator('#actorList [data-actor-id="scene_actor"]').click();
  await page.locator('#actorNameInput').fill('Metadata Preserving Actor');
  await page.locator('#saveActorBtn').click();
  const actorDownloadPromise = page.waitForEvent('download');
  await page.locator('#exportActorsBtn').click();
  const actors = await readDownloadJson(await actorDownloadPromise);
  expect(actors.actors[0].components.movement.acceleration).toBe(0.75);
  expect(actors.actors[0].components.quest).toEqual({ journal: 'intro' });

  await page.locator('#workspaceSceneTabBtn').click();
  await page.locator('#entityList [data-entity-id="welcome_beacon"]').click();
  await page.locator('#entityMessageInput').fill('Metadata remains intact.');
  await page.locator('#saveEntityBtn').click();
  const sceneDownloadPromise = page.waitForEvent('download');
  await page.locator('#exportSceneBtn').click();
  const scene = await readDownloadJson(await sceneDownloadPromise);
  const exportedBeacon = scene.entities.find((entity) => entity.id === 'welcome_beacon');
  expect(scene.spawn.facing).toBe('left');
  expect(scene.objects.weatherZones).toEqual([{ x: 0, y: 0, kind: 'rain' }]);
  expect(exportedBeacon.persistence).toEqual({ once: true });
  expect(exportedBeacon.components.interaction.prompt).toBe('Read');
  expect(exportedBeacon.components.quest).toEqual({ id: 'welcome' });
});

test('map line tool waits for a distinct endpoint and paints the complete line', async ({ page }) => {
  await page.goto('/builder/');
  await page.locator('#mapLineToolBtn').click();
  await page.locator('.cell[data-row="0"][data-col="0"]').click();
  await expect(page.locator('#message')).toContainText('Line start set');
  await page.locator('.cell[data-row="0"][data-col="3"]').click();
  await expect(page.locator('#message')).toContainText('Line committed');
  for (let col = 0; col <= 3; col += 1) {
    await expect(page.locator(`.cell[data-row="0"][data-col="${col}"]`)).toHaveAttribute('data-tile-id', 'floor_stone_a');
  }
});

test('map fill creates one undo step', async ({ page }) => {
  await page.goto('/builder/');
  await page.locator('#fillToolBtn').click();
  await page.locator('.cell[data-row="5"][data-col="5"]').click();
  await expect(page.locator('.cell[data-row="5"][data-col="5"]')).toHaveAttribute('data-tile-id', 'floor_stone_a');
  await page.locator('#mapUndoBtn').click();
  await expect(page.locator('.cell[data-row="5"][data-col="5"]')).toHaveAttribute('data-tile-id', 'empty');
});

test('texture line tool waits for a distinct endpoint and paints the complete line', async ({ page }) => {
  await page.goto('/builder/');
  await page.locator('#tabTextureBuilderBtn').click();
  await page.locator('#textureLineToolBtn').click();
  await page.locator('.texture-cell[data-row="0"][data-col="0"]').click();
  await expect(page.locator('#textureMessage')).toContainText('Line start set');
  await page.locator('.texture-cell[data-row="0"][data-col="3"]').click();
  await expect(page.locator('#textureMessage')).toContainText('Line committed');
  for (let col = 0; col <= 3; col += 1) {
    await expect(page.locator(`.texture-cell[data-row="0"][data-col="${col}"]`)).not.toHaveClass(/texture-empty/);
  }
});

test('texture fill creates one undo step', async ({ page }) => {
  await page.goto('/builder/');
  await page.locator('#tabTextureBuilderBtn').click();
  await page.locator('#textureFillToolBtn').click();
  await page.locator('.texture-cell[data-row="5"][data-col="5"]').click();
  await expect(page.locator('.texture-cell[data-row="5"][data-col="5"]')).not.toHaveClass(/texture-empty/);
  await page.locator('#textureUndoBtn').click();
  await expect(page.locator('.texture-cell[data-row="5"][data-col="5"]')).toHaveClass(/texture-empty/);
});

test('map and texture grids support keyboard navigation and painting', async ({ page }) => {
  await page.goto('/builder/');
  await expect(page.locator('#gridContainer')).toHaveAttribute('role', 'grid');
  await expect(page.locator('#gridContainer')).toHaveAttribute('aria-rowcount', '30');
  const mapStart = page.locator('.cell[data-row="0"][data-col="0"]');
  await expect(mapStart).toHaveAttribute('role', 'gridcell');
  await mapStart.focus();
  await page.keyboard.press('ArrowRight');
  const mapTarget = page.locator('.cell[data-row="0"][data-col="1"]');
  await expect(mapTarget).toBeFocused();
  await page.keyboard.press('Space');
  await expect(mapTarget).toHaveAttribute('data-tile-id', 'floor_stone_a');
  await expect(mapTarget).toBeFocused();

  await page.locator('#tabTextureBuilderBtn').click();
  await expect(page.locator('#textureGridContainer')).toHaveAttribute('role', 'grid');
  const textureStart = page.locator('.texture-cell[data-row="0"][data-col="0"]');
  await expect(textureStart).toHaveAttribute('role', 'gridcell');
  await textureStart.focus();
  await page.keyboard.press('ArrowDown');
  const textureTarget = page.locator('.texture-cell[data-row="1"][data-col="0"]');
  await expect(textureTarget).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(textureTarget).not.toHaveClass(/texture-empty/);
  await expect(textureTarget).toBeFocused();
});

test('maximum supported map remains editable under stress', async ({ page }, testInfo) => {
  testInfo.setTimeout(30_000);
  await page.goto('/builder/');
  await page.locator('#mapWidthInput').fill('200');
  await page.locator('#mapHeightInput').fill('200');
  const startedAt = Date.now();
  await page.locator('#applySizeBtn').click();
  await expect(page.locator('#gridContainer .cell')).toHaveCount(40_000);
  await page.locator('#fillToolBtn').click();
  await page.locator('.cell[data-row="199"][data-col="199"]').click();
  await expect(page.locator('.cell[data-row="0"][data-col="0"]')).toHaveAttribute('data-tile-id', 'floor_stone_a');
  const elapsedMs = Date.now() - startedAt;
  testInfo.annotations.push({ type: 'performance', description: `200 x 200 resize and fill: ${elapsedMs} ms` });
  expect(elapsedMs).toBeLessThan(15_000);
});

test('item editor preserves extensions, clears stale category fields, and rejects duplicate IDs', async ({ page }) => {
  await page.goto('/builder/');
  await page.locator('#tabItemEditorBtn').click();
  await page.locator('#itemImportInput').setInputFiles({
    name: 'audit-items.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      items: [{
        id: 'audit_blade',
        name: 'Audit Blade',
        category: 'weapon',
        baseValue: 25,
        stackable: false,
        rarity: 'rare',
        equipSlot: 'weapon',
        mods: { attack: 2 },
        power: 3,
        attackRange: 1.5,
        cooldown: 0.8,
        extension: { source: 'plugin' },
      }],
    })),
  });
  await expect(page.locator('#itemEditorMessage')).toContainText('Items imported successfully');
  await page.locator('#itemList .item-list-entry').click();
  await page.locator('#itemCategorySelect').selectOption('consumable');
  await page.locator('#itemStackableInput').selectOption('true');
  await page.locator('#itemEffectTypeInput').fill('heal');
  await page.locator('#itemEffectValueInput').fill('8');
  await page.locator('#itemSaveBtn').click();
  await expect(page.locator('#itemEditorMessage')).toContainText('Item updated');

  await page.locator('#itemNewBtn').click();
  await page.locator('#itemIdInput').fill('audit_blade');
  await page.locator('#itemNameInput').fill('Duplicate Blade');
  await page.locator('#itemSaveBtn').click();
  await expect(page.locator('#itemEditorMessage')).toContainText('unique');
  await expect(page.locator('#itemList .item-list-entry')).toHaveCount(1);

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#itemExportBtn').click();
  const exported = await readDownloadJson(await downloadPromise);
  const item = exported.items[0];
  expect(item.extension).toEqual({ source: 'plugin' });
  expect(item.category).toBe('consumable');
  expect(item.stackable).toBe(true);
  expect(item.effectType).toBe('heal');
  expect(item.effectValue).toBe(8);
  for (const staleField of ['equipSlot', 'mods', 'power', 'attackRange', 'cooldown']) {
    expect(item).not.toHaveProperty(staleField);
  }
});

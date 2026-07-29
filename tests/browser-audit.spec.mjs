import { expect, test } from '@playwright/test';

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
      expect.soft(consoleErrors, `${label}: browser console errors`).toEqual([]);
      expect.soft(pageErrors, `${label}: uncaught page errors`).toEqual([]);
      expect.soft(badResponses, `${label}: HTTP error responses`).toEqual([]);
      expect.soft(failedRequests, `${label}: failed network requests`).toEqual([]);
    },
  };
}

async function startFirstActor(page) {
  await expect(page.locator('#new-game')).toBeVisible();
  await page.locator('#new-game').click();
  const firstActor = page.locator('#class-opts button').first();
  await expect(firstActor).toBeVisible();
  await firstActor.click();
  await expect(page.locator('#player-panel')).toContainText(/Class:|Actor:/);
}

async function readDownloadJson(download) {
  const stream = await download.createReadStream();
  let text = '';
  for await (const chunk of stream) text += chunk.toString();
  return JSON.parse(text);
}

test('sample-rpg loads, starts, renders, and saves', async ({ page }) => {
  const monitor = monitorPage(page);
  await page.goto('/?game=sample-rpg');
  await expect(page.locator('#game-canvas')).toBeVisible();
  await expect(page.locator('#overlay')).toContainText('Pixel Engine');

  await startFirstActor(page);
  await expect(page.locator('#context-panel')).toContainText('State: town');
  await expect(page.locator('#context-panel')).toContainText('Town: town_hub');

  const saveKeys = await page.evaluate(() => Object.keys(localStorage));
  expect(saveKeys).toContain('pixel_engine_save_sample-rpg_slot_1');

  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(250);
  await page.keyboard.up('ArrowRight');
  await expect(page.locator('#context-panel')).toContainText('State: town');

  monitor.assertClean('sample-rpg');
});

test('sandbox-demo loads independently and uses an isolated save key', async ({ page }) => {
  const monitor = monitorPage(page);
  await page.goto('/?game=sandbox-demo');
  await startFirstActor(page);

  await expect(page.locator('#context-panel')).toContainText('State: town');
  await expect(page.locator('#context-panel')).toContainText('Town: sandbox_room');

  const saveKeys = await page.evaluate(() => Object.keys(localStorage));
  expect(saveKeys).toContain('pixel_engine_save_sandbox-demo_slot_1');
  expect(saveKeys).not.toContain('pixel_engine_save_sample-rpg_slot_1');

  monitor.assertClean('sandbox-demo');
});

test('generic scene package uses a direct actor and component interaction', async ({ page }) => {
  const monitor = monitorPage(page);
  await page.goto('/?game=scene-demo');
  await startFirstActor(page);

  await expect(page.locator('#player-panel')).toContainText('Actor: Scene Explorer');
  await expect(page.locator('#context-panel')).toContainText('State: scene');
  await page.keyboard.press('e');
  await expect(page.locator('#context-panel')).toContainText('Component entity interaction is working.');

  const saveKeys = await page.evaluate(() => Object.keys(localStorage));
  expect(saveKeys).toContain('pixel_engine_save_scene-demo_slot_1');

  monitor.assertClean('scene-demo');
});

test('game saves remain isolated in the same browser origin', async ({ page }) => {
  await page.goto('/?game=sample-rpg');
  await startFirstActor(page);
  await page.goto('/?game=sandbox-demo');
  await startFirstActor(page);
  await page.goto('/?game=scene-demo');
  await startFirstActor(page);

  const saveKeys = await page.evaluate(() => Object.keys(localStorage).sort());
  expect(saveKeys).toContain('pixel_engine_save_sample-rpg_slot_1');
  expect(saveKeys).toContain('pixel_engine_save_sandbox-demo_slot_1');
  expect(saveKeys).toContain('pixel_engine_save_scene-demo_slot_1');
});

test('unsafe game IDs fall back to the default package', async ({ page }) => {
  const monitor = monitorPage(page);
  await page.goto('/?game=../../outside');
  await expect(page.locator('#new-game')).toBeVisible();
  await startFirstActor(page);
  await expect(page.locator('#context-panel')).toContainText('Town: town_hub');
  monitor.assertClean('unsafe game id fallback');
});

test('unknown but well-formed game IDs show a readable load failure', async ({ page }) => {
  await page.goto('/?game=package-that-does-not-exist');
  await expect(page.locator('body')).toContainText(/unable to load game|game package.*not found/i);
  await expect(page.locator('#load-default-game')).toBeVisible();
});

test('builder loads without console or network errors and its main tabs open', async ({ page }) => {
  const monitor = monitorPage(page);
  await page.goto('/builder/');
  await expect(page.getByRole('heading', { name: '2D Level Builder (v2)' })).toBeVisible();
  await expect(page.locator('#gridContainer')).toBeVisible();

  await page.locator('#tabItemEditorBtn').click();
  await expect(page.locator('#itemEditorTab')).toHaveClass(/active/);
  await page.locator('#tabTextureBuilderBtn').click();
  await expect(page.locator('#textureBuilderTab')).toHaveClass(/active/);
  await page.locator('#tabMapEditorBtn').click();
  await expect(page.locator('#mapEditorTab')).toHaveClass(/active/);

  monitor.assertClean('builder');
});

test('builder creates an engine-compatible map JSON download', async ({ page }) => {
  const monitor = monitorPage(page);
  await page.goto('/builder/');
  await expect(page.locator('#gridContainer .cell')).toHaveCount(900);

  await page.locator('.tile-btn[data-tile-id="floor_grass_a"]').click();
  await page.locator('.cell[data-row="2"][data-col="3"]').click();

  await page.locator('#layerObjectBtn').click();
  await page.locator('.tile-btn[data-tile-id="player_start"]').click();
  await page.locator('.cell[data-row="2"][data-col="3"]').click();

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportGameBtn').click();
  const payload = await readDownloadJson(await downloadPromise);

  expect(payload.id).toBe('level_001');
  expect(payload.width).toBe(30);
  expect(payload.height).toBe(30);
  expect(payload.tiles[2][3]).toBe('floor_grass_a');
  expect(payload.spawn).toEqual({ x: 3, y: 2 });
  expect(payload.objects).toEqual(expect.objectContaining({
    portals: expect.any(Array),
    shops: expect.any(Array),
    fountains: expect.any(Array),
    enemySpawns: expect.any(Array),
  }));

  monitor.assertClean('builder engine export');
});

test('standalone builder viewer loads', async ({ page }) => {
  const monitor = monitorPage(page);
  await page.goto('/builder/viewer.html');
  await expect(page.locator('body')).toBeVisible();
  monitor.assertClean('builder viewer');
});

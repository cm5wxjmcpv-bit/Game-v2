import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

async function readDownloadJson(download) {
  const path = await download.path();
  return JSON.parse(await fs.readFile(path, 'utf8'));
}

function monitorPage(page) {
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  return () => {
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  };
}

test('workspace visually edits town portals and shops and exports the merged scene draft', async ({ page }) => {
  const assertClean = monitorPage(page);
  await page.goto('/builder/workspace.html?game=sample-rpg');
  await expect(page.locator('#projectSummary')).toContainText('Sample RPG');
  await expect(page.locator('#workspaceObjectsTabBtn')).toBeVisible();

  await page.locator('#workspaceObjectsTabBtn').click();
  await expect(page.locator('#workspaceObjectsTab')).toHaveClass(/active/);
  await expect(page.locator('#objectSceneSelect')).toHaveValue('town_hub');
  await expect(page.locator('#legacyObjectList [data-object-index]')).toHaveCount(2);

  await page.locator('#legacyObjectList [data-object-index="1"]').click();
  await expect(page.locator('#portalTargetTownInput')).toHaveValue('town_harbor');

  await page.locator('#objectTypeSelect').selectOption('shops');
  await expect(page.locator('#legacyObjectList [data-object-index]')).toHaveCount(2);
  await page.locator('#newLegacyObjectBtn').click();
  await page.locator('.workspace-object-cell[data-object-x="8"][data-object-y="6"]').click();
  await page.locator('#objectShopIdInput').fill('shop_workspace_test');
  await page.locator('#objectExtraJsonInput').fill('{"note":"created in object workspace"}');
  await page.locator('#saveLegacyObjectBtn').click();
  await expect(page.locator('#legacyObjectList')).toContainText('shop_workspace_test');
  await expect(page.locator('#objectStatus')).toContainText('Shop saved');

  await page.locator('#workspaceSceneTabBtn').click();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportSceneBtn').click();
  const payload = await readDownloadJson(await downloadPromise);
  const shop = payload.objects.shops.find((entry) => entry.shopId === 'shop_workspace_test');
  expect(shop).toEqual({ x: 8, y: 6, note: 'created in object workspace', shopId: 'shop_workspace_test' });
  expect(payload.objects.portals[1].targetTown).toBe('town_harbor');

  await page.locator('#workspacePublishTabBtn').click();
  await expect(page.locator('#publishFileList')).toContainText('data/towns/town_hub.json');
  assertClean();
});

test('workspace edits enemy spawns and adds a bounded battle trigger with extra metadata', async ({ page }) => {
  const assertClean = monitorPage(page);
  await page.goto('/builder/workspace.html?game=sample-rpg');
  await expect(page.locator('#projectSummary')).toContainText('Sample RPG');
  await page.locator('#workspaceObjectsTabBtn').click();
  await page.locator('#objectSceneSelect').selectOption('level_fields');
  await page.locator('#objectTypeSelect').selectOption('enemySpawns');
  await expect(page.locator('#legacyObjectList')).toContainText('slime_green');

  await page.locator('#legacyObjectList [data-object-index="0"]').click();
  await page.locator('.workspace-object-cell[data-object-x="7"][data-object-y="7"]').click();
  await page.locator('#saveLegacyObjectBtn').click();
  await expect(page.locator('#objectStatus')).toContainText('Enemy Spawn saved');

  await page.locator('#objectTypeSelect').selectOption('battleTriggers');
  await page.locator('#newLegacyObjectBtn').click();
  await page.locator('.workspace-object-cell[data-object-x="4"][data-object-y="4"]').click();
  await page.locator('#objectEncounterIdInput').fill('field_ambush');
  await page.locator('#objectTriggerWidthInput').fill('2');
  await page.locator('#objectTriggerHeightInput').fill('2');
  await page.locator('#objectExtraJsonInput').fill('{"repeatable":false}');
  await page.locator('#saveLegacyObjectBtn').click();
  await expect(page.locator('#legacyObjectList')).toContainText('field_ambush');

  const objects = await page.evaluate(() => {
    const draft = JSON.parse(localStorage.getItem('pixel_engine_builder_workspace_sample-rpg'));
    return draft.scenes.find((scene) => scene.id === 'level_fields').objects;
  });
  expect(objects.enemySpawns[0]).toEqual({ x: 7, y: 7, enemyId: 'slime_green' });
  expect(objects.battleTriggers[0]).toEqual({
    x: 4,
    y: 4,
    repeatable: false,
    width: 2,
    height: 2,
    encounterId: 'field_ambush',
  });
  assertClean();
});

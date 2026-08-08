import { expect, test } from '@playwright/test';

async function readJsonDownload(download) {
  const stream = await download.createReadStream();
  let text = '';
  for await (const chunk of stream) text += chunk.toString();
  return JSON.parse(text);
}

test('Level Builder exposes Building as a Town-like third map type', async ({ page }) => {
  await page.goto('/builder/');

  const mapType = page.locator('#mapTypeSelect');
  await expect(mapType.locator('option[value="building"]')).toHaveText('Building');
  await mapType.selectOption('building');

  await expect(mapType).toHaveValue('building');
  await expect(page.locator('#mapTypeLabel')).toHaveText('building');
  await expect(page.locator('.game-sync-preview-panel')).toBeHidden();
  await expect.poll(async () => page.locator('#palette button').count()).toBeGreaterThan(0);

  await page.locator('#mapWidthInput').fill('31');
  await page.locator('#applySizeBtn').click();
  await expect(mapType).toHaveValue('building');
  await expect(page.locator('#mapTypeLabel')).toHaveText('building');

  await page.locator('#mapUndoBtn').click();
  await expect(mapType).toHaveValue('building');
  await expect(page.locator('#mapTypeLabel')).toHaveText('building');

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportBtn').click();
  const rawMap = await readJsonDownload(await downloadPromise);
  expect(rawMap.mapType).toBe('building');

  await mapType.selectOption('town');
  await expect(mapType).toHaveValue('town');
  await expect(page.locator('#mapTypeLabel')).toHaveText('town');
  await expect(page.locator('.game-sync-preview-panel')).toBeVisible();
});

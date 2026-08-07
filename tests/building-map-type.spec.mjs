import { expect, test } from '@playwright/test';

test('Level Builder exposes Building as a Town-like third map type', async ({ page }) => {
  await page.goto('/builder/');

  const mapType = page.locator('#mapTypeSelect');
  await expect(mapType.locator('option[value="building"]')).toHaveText('Building');
  await mapType.selectOption('building');

  await expect(mapType).toHaveValue('building');
  await expect(page.locator('#mapTypeLabel')).toHaveText('building');
  await expect(page.locator('.game-sync-preview-panel')).toBeHidden();
  await expect.poll(async () => page.locator('#palette button').count()).toBeGreaterThan(0);

  await mapType.selectOption('town');
  await expect(mapType).toHaveValue('town');
  await expect(page.locator('#mapTypeLabel')).toHaveText('town');
  await expect(page.locator('.game-sync-preview-panel')).toBeVisible();
});

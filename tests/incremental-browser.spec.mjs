import { expect, test } from '@playwright/test';

test('miner package selects the incremental runtime, mines deposits, and reloads its isolated save', async ({ page }) => {
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/?game=miner-incremental');
  await expect(page.locator('body')).toHaveAttribute('data-game-type', 'incremental');
  await expect(page.locator('#game-canvas')).toBeHidden();
  await expect(page.locator('#incremental-runtime')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Blackstone Breakaway' })).toBeVisible();
  await expect(page.locator('#incremental-deposit-hp')).toHaveText('20 / 20 HP');

  const target = page.locator('#incremental-mining-target');
  await target.click();
  await expect(page.locator('#incremental-deposit-hp')).toHaveText('18 / 20 HP');
  await target.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#incremental-deposit-hp')).toHaveText('16 / 20 HP');
  for (let index = 0; index < 8; index += 1) await target.click();

  await expect(page.locator('#incremental-last-result')).toContainText(/delivered to Blackstone Mining Co\./);
  await expect(page.locator('#incremental-cash')).not.toHaveText('$0');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pixel_engine_save_miner-incremental_slot_1')));
  expect(saved.gameType).toBe('incremental');
  expect(saved.payload.statistics.totalManualSwings).toBe(10);
  expect(saved.payload.statistics.totalDepositsBroken).toBe(1);
  expect(saved.payload.statistics.totalOreMined).toBeGreaterThan(0);
  expect(saved.payload.character.xp).toBeGreaterThan(0);
  expect(saved.payload.materials.stone).toBe(0);

  const cash = saved.payload.cash;
  await page.reload();
  await expect(page.locator('#incremental-save-status')).toHaveText('Local save loaded');
  const reloaded = await page.evaluate(() => JSON.parse(localStorage.getItem('pixel_engine_save_miner-incremental_slot_1')));
  expect(reloaded.payload.cash).toBe(cash);

  await page.goto('/');
  const continueLink = page.locator('[data-game-id="miner-incremental"] a', { hasText: 'Continue' });
  await expect(continueLink).not.toHaveAttribute('aria-disabled', 'true');
  await expect(continueLink).toHaveAttribute('href', /game=miner-incremental&action=continue$/);
  await continueLink.click();
  await expect(page.locator('body')).toHaveAttribute('data-game-type', 'incremental');
  await expect(page.locator('#incremental-save-status')).toHaveText('Local save loaded');
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test.describe('touch viewport', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('miner target remains touch-sized and contained on a phone viewport', async ({ page }) => {
    await page.goto('/?game=miner-incremental');
    const target = page.locator('#incremental-mining-target');
    await expect(target).toBeVisible();
    const box = await target.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(200);
    expect(box.height).toBeGreaterThanOrEqual(200);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    await target.tap();
    await expect(page.locator('#incremental-deposit-hp')).toHaveText('18 / 20 HP');
  });
});

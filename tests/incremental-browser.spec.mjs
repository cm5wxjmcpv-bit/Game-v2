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
  await expect(page.locator('#incremental-story-title')).toHaveText('First Shift');
  await expect(page.locator('#incremental-story-text')).toContainText('twenty men waiting');
  await page.locator('#incremental-story-continue').click();
  await expect(page.locator('#incremental-buyout')).toBeDisabled();

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
  expect(saved.version).toBe(2);
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

test('leveling, skills, and the contract buyout persist the employee-to-independent transition', async ({ page }) => {
  await page.goto('/?game=miner-incremental');
  await page.locator('#incremental-story-continue').click();

  await page.addInitScript(() => {
    if (sessionStorage.getItem('milestone-two-seeded')) return;
    const key = 'pixel_engine_save_miner-incremental_slot_1';
    const save = JSON.parse(localStorage.getItem(key));
    if (!save) return;
    save.payload.cash = 500;
    save.payload.character.xp = 99;
    save.payload.currentDeposit.hp = 2;
    localStorage.setItem(key, JSON.stringify(save));
    sessionStorage.setItem('milestone-two-seeded', 'true');
  });
  await page.reload();
  await expect(page.locator('#incremental-save-status')).toHaveText('Local save loaded');
  await expect(page.locator('#incremental-story-title')).toHaveText('Freedom Is Affordable');
  await page.locator('#incremental-story-continue').click();

  await page.locator('#incremental-mining-target').click();
  await expect(page.locator('#incremental-level')).toHaveText('2');
  await expect(page.locator('#incremental-skill-points')).toHaveText('1');
  await expect(page.locator('#incremental-story-title')).toHaveText('A Stronger Swing');
  await page.locator('#incremental-story-continue').click();

  await page.locator('#incremental-tab-mine').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('heading', { name: 'Miner Skills' })).toBeVisible();
  const powerSkill = page.locator('.incremental-skill-card', { hasText: 'Mining Power' });
  await powerSkill.getByRole('button', { name: 'Spend 1 Point' }).click();
  await expect(powerSkill).toContainText('Rank 1 / 10');
  await expect(page.locator('#incremental-skill-points')).toHaveText('0');

  await page.locator('#incremental-tab-mine').click();
  await expect(page.locator('#incremental-manual-power')).toHaveText('3');
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#incremental-buyout').click();
  await expect(page.locator('#incremental-story-title')).toHaveText('Independent Miner');
  await page.locator('#incremental-story-continue').click();
  await expect(page.locator('#incremental-role')).toHaveText('Independent Miner');
  await expect(page.locator('#incremental-mine-name')).toHaveText('Freedom Claim');
  await expect(page.locator('#incremental-subtitle')).toContainText('belongs to you');
  await expect(page.locator('#incremental-resource-badge')).toHaveText('Player owned');
  await expect(page.locator('#incremental-contract-title')).toHaveText('You Work for Yourself Now');
  await expect(page.locator('#incremental-buyout')).toBeHidden();

  const afterBuyout = await page.evaluate(() => JSON.parse(localStorage.getItem('pixel_engine_save_miner-incremental_slot_1')));
  const wagesBeforeIndependentMining = afterBuyout.payload.employment.totalWages;
  expect(afterBuyout.payload.storyStage).toBe('independent');
  expect(afterBuyout.payload.employment.active).toBe(false);
  expect(afterBuyout.payload.employment.contractBuyoutPaid).toBe(500);
  expect(afterBuyout.payload.cash).toBe(1);

  const target = page.locator('#incremental-mining-target');
  for (let index = 0; index < 15; index += 1) await target.click();
  await expect.poll(async () => page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('pixel_engine_save_miner-incremental_slot_1'));
    return Object.values(save.payload.materials).reduce((sum, quantity) => sum + quantity, 0);
  })).toBeGreaterThan(0);
  const independentSave = await page.evaluate(() => JSON.parse(localStorage.getItem('pixel_engine_save_miner-incremental_slot_1')));
  expect(independentSave.payload.employment.totalWages).toBe(wagesBeforeIndependentMining);

  await page.reload();
  await expect(page.locator('#incremental-save-status')).toHaveText('Local save loaded');
  await expect(page.locator('#incremental-role')).toHaveText('Independent Miner');
  await expect(page.locator('#incremental-resource-badge')).toHaveText('Player owned');
});

test.describe('touch viewport', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('miner target remains touch-sized and contained on a phone viewport', async ({ page }) => {
    await page.goto('/?game=miner-incremental');
    await page.locator('#incremental-story-continue').click();
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

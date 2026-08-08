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
  expect(saved.version).toBe(7);
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
  await page.keyboard.press('End');
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

test('ore sales, Miller equipment, and scratch tickets persist without bypassing purchase rules', async ({ page }) => {
  await page.goto('/?game=miner-incremental');
  await page.locator('#incremental-story-continue').click();

  await page.addInitScript(() => {
    if (sessionStorage.getItem('milestone-three-seeded')) return;
    const key = 'pixel_engine_save_miner-incremental_slot_1';
    const save = JSON.parse(localStorage.getItem(key));
    if (!save) return;
    save.payload.cash = 100;
    save.payload.storyStage = 'independent';
    save.payload.employment.active = false;
    save.payload.employment.contractBuyoutPaid = 500;
    save.payload.employment.endedAt = Date.now();
    save.payload.materials.stone = 12;
    save.payload.milestones = [
      'blackstone-first-shift',
      'contract-within-reach',
      'contract-bought',
    ];
    localStorage.setItem(key, JSON.stringify(save));
    sessionStorage.setItem('milestone-three-seeded', 'true');
  });
  await page.reload();
  await expect(page.locator('#incremental-save-status')).toHaveText('Local save loaded');
  await expect(page.locator('#incremental-resource-badge')).toHaveText('Player owned');

  const stone = page.locator('.incremental-resource-row', { hasText: 'Stone' });
  await expect(stone.getByRole('button', { name: 'Sell 10' })).toBeEnabled();
  await stone.getByRole('button', { name: 'Sell 10' }).click();
  await expect(page.locator('#incremental-cash')).toHaveText('$130');
  await expect(stone).toContainText('2 owned');

  await page.locator('#incremental-tab-store').click();
  await expect(page.getByRole('heading', { name: "Miller's General Store" })).toBeVisible();
  await expect(page.locator('#incremental-store-cash')).toHaveText('$130');
  const ironPickaxe = page.locator('.incremental-equipment-card', { hasText: 'Iron Pickaxe' });
  await ironPickaxe.getByRole('button', { name: /Buy & Equip/ }).click();
  await expect(ironPickaxe.getByRole('button', { name: 'Equipped' })).toBeDisabled();
  await expect(page.locator('#incremental-store-cash')).toHaveText('$100');

  await page.locator('#incremental-tab-equipment').click();
  await expect(page.getByRole('heading', { name: 'Miner Equipment' })).toBeVisible();
  await expect(page.locator('#incremental-equipment-power')).toHaveText('3');
  await expect(page.locator('.incremental-slot-card', { hasText: 'Main Tool' })).toContainText('Iron Pickaxe');

  await page.locator('#incremental-tab-store').click();
  const ticket = page.locator('.incremental-lottery-card', { hasText: 'Gold Vein Scratch-Off' });
  await expect(ticket).toContainText('Prize chances total 100%');
  await ticket.getByRole('button', { name: /Buy Ticket/ }).click();
  await expect(page.locator('#incremental-store-cash')).toHaveText('$90');
  await ticket.getByRole('button', { name: /Scratch Gold Vein Scratch-Off/ }).click();
  await expect(ticket.locator('.incremental-lottery-reveal')).toBeVisible();

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pixel_engine_save_miner-incremental_slot_1')));
  expect(saved.version).toBe(7);
  expect(saved.payload.materials.stone).toBe(2);
  expect(saved.payload.statistics.totalOreSold).toBe(10);
  expect(saved.payload.ownedEquipment).toContain('iron-pickaxe');
  expect(saved.payload.equipment.tool).toBe('iron-pickaxe');
  expect(saved.payload.statistics.lotteryTicketsPurchased).toBe(1);
  expect(saved.payload.cash).toBeGreaterThanOrEqual(0);
  expect(Object.values(saved.payload.materials).every((quantity) => quantity >= 0)).toBe(true);

  await page.reload();
  await expect(page.locator('#incremental-save-status')).toHaveText('Local save loaded');
  await page.locator('#incremental-tab-equipment').click();
  await expect(page.locator('#incremental-equipment-power')).toHaveText('3');
  await expect(page.locator('.incremental-slot-card', { hasText: 'Main Tool' })).toContainText('Iron Pickaxe');
});

test('company creation, scalable generators, upgrades, and deposit automation persist', async ({ page }) => {
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/?game=miner-incremental');
  await page.locator('#incremental-story-continue').click();
  await page.addInitScript(() => {
    if (sessionStorage.getItem('milestone-four-seeded')) return;
    const key = 'pixel_engine_save_miner-incremental_slot_1';
    const save = JSON.parse(localStorage.getItem(key));
    if (!save) return;
    save.payload.cash = 50000;
    save.payload.character.level = 3;
    save.payload.character.xp = 0;
    save.payload.storyStage = 'independent';
    save.payload.employment.active = false;
    save.payload.employment.contractBuyoutPaid = 500;
    save.payload.employment.endedAt = Date.now();
    save.payload.currentDeposit.hp = 2;
    save.payload.milestones = [
      'blackstone-first-shift',
      'blackstone-level-two',
      'contract-within-reach',
      'contract-bought',
    ];
    localStorage.setItem(key, JSON.stringify(save));
    sessionStorage.setItem('milestone-four-seeded', 'true');
  });
  await page.reload();
  await expect(page.locator('#incremental-save-status')).toHaveText('Local save loaded');

  await page.locator('#incremental-tab-company').click();
  await expect(page.getByRole('heading', { name: 'Start a Mining Company' })).toBeVisible();
  await expect(page.locator('#incremental-create-company')).toBeDisabled();
  await page.locator('#incremental-company-name').fill('Freedom Forge Mining');
  await expect(page.locator('#incremental-create-company')).toBeEnabled();
  await page.locator('#incremental-create-company').click();
  await expect(page.locator('#incremental-story-title')).toHaveText('A Company of Your Own');
  await page.locator('#incremental-story-continue').click();
  await expect(page.locator('#incremental-story-title')).toHaveText('Blackstone Expands');
  await page.locator('#incremental-story-continue').click();
  await expect(page.getByRole('heading', { name: 'Freedom Forge Mining' })).toBeVisible();
  await expect(page.locator('#incremental-company-level-summary')).toContainText('Company level 1');
  await expect(page.locator('#incremental-company-production')).toHaveText('0/sec');

  const hiredMiner = page.locator('.incremental-business-card').filter({
    has: page.getByRole('heading', { name: 'Hired Miner', exact: true }),
  });
  await expect(hiredMiner).toContainText('$1.20K');
  await hiredMiner.getByRole('button', { name: /Buy for/ }).click();
  await expect(hiredMiner).toContainText('Owned 1');
  await expect(hiredMiner).toContainText('$1.38K');
  await hiredMiner.getByRole('button', { name: /Buy for/ }).click();
  await expect(hiredMiner).toContainText('Owned 2');
  await expect(hiredMiner).toContainText('$1.59K');
  await hiredMiner.getByRole('button', { name: /Buy for/ }).click();
  await expect(hiredMiner).toContainText('Owned 3');
  await expect(page.locator('#incremental-story-title')).toHaveText('A Major Ore Contract');
  await page.locator('#incremental-story-continue').click();
  await expect(page.locator('#incremental-company-level-summary')).toContainText('Company level 2');
  await expect(page.locator('#incremental-company-production')).toHaveText('3/sec');

  await expect(page.locator('#incremental-last-result')).toContainText('Your operation broke', { timeout: 5000 });
  const training = page.locator('.incremental-business-card').filter({
    has: page.getByRole('heading', { name: 'Worker Training', exact: true }),
  });
  await training.getByRole('button', { name: /Upgrade for/ }).click();
  await expect(training).toContainText('Rank 1 / 5');
  await expect(page.locator('#incremental-company-production')).toHaveText('3.45/sec');

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pixel_engine_save_miner-incremental_slot_1')));
  expect(saved.version).toBe(7);
  expect(saved.payload.storyStage).toBe('company-owner');
  expect(saved.payload.company.name).toBe('Freedom Forge Mining');
  expect(saved.payload.company.level).toBe(2);
  expect(saved.payload.company.lifetimeInvestment).toBe(7167);
  expect(saved.payload.generators['hired-miner']).toBe(3);
  expect(saved.payload.businessUpgrades['worker-training']).toBe(1);
  expect(saved.payload.statistics.workersHired).toBe(3);
  expect(saved.payload.statistics.totalAutomatedProduction).toBeGreaterThan(0);
  expect(saved.payload.character.xp).toBe(0);
  expect(Object.values(saved.payload.materials).every((quantity) => quantity >= 0)).toBe(true);

  await page.reload();
  await expect(page.locator('#incremental-save-status')).toHaveText('Local save loaded');
  await expect(page.locator('#incremental-role')).toHaveText('Founder & Lead Miner');
  await expect(page.locator('#incremental-employer')).toHaveText('Freedom Forge Mining');
  await page.locator('#incremental-tab-company').click();
  await expect(page.locator('#incremental-company-level-summary')).toContainText('Company level 2');
  await expect(page.locator('#incremental-company-production')).toHaveText('3.45/sec');
  await expect(page.locator('.incremental-business-card').filter({
    has: page.getByRole('heading', { name: 'Hired Miner', exact: true }),
  })).toContainText('Owned 3');
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('mine progression shows combined requirements, pays a one-time unlock cost, and switches deposits', async ({ page }) => {
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/?game=miner-incremental');
  await page.locator('#incremental-story-continue').click();
  await page.addInitScript(() => {
    if (sessionStorage.getItem('milestone-five-seeded')) return;
    const key = 'pixel_engine_save_miner-incremental_slot_1';
    const save = JSON.parse(localStorage.getItem(key));
    if (!save) return;
    save.payload.cash = 10000;
    save.payload.character.level = 4;
    save.payload.character.xp = 0;
    save.payload.storyStage = 'independent';
    save.payload.employment.active = false;
    save.payload.employment.contractBuyoutPaid = 500;
    save.payload.employment.endedAt = Date.now();
    save.payload.mineProgress['blackstone-shaft-7'] = {
      depositsBroken: 35,
      oreMined: 150,
    };
    save.payload.activeMiningEvent = { id: 'rich-seam', remainingSeconds: 20 };
    save.payload.milestones = [
      'blackstone-first-shift',
      'blackstone-level-two',
      'blackstone-level-four',
      'contract-within-reach',
      'contract-bought',
    ];
    localStorage.setItem(key, JSON.stringify(save));
    sessionStorage.setItem('milestone-five-seeded', 'true');
  });
  await page.reload();
  await expect(page.locator('#incremental-save-status')).toHaveText('Local save loaded');
  await expect(page.locator('#incremental-event-banner')).toBeVisible();
  await expect(page.locator('#incremental-event-name')).toHaveText('Rich Seam');

  await page.locator('#incremental-tab-mines').click();
  await expect(page.getByRole('heading', { name: 'Claims & Shafts' })).toBeVisible();
  const oldIronMine = page.locator('.incremental-mine-option').filter({
    has: page.getByRole('heading', { name: 'Old Iron Mine', exact: true }),
  });
  await expect(oldIronMine).toContainText('Contract paid');
  await expect(oldIronMine).toContainText('35 / 35');
  await expect(oldIronMine).toContainText('$10.00K / $2.50K');
  await oldIronMine.getByRole('button', { name: /Unlock/ }).click();
  await expect(page.locator('#incremental-cash')).toHaveText('$7.50K');
  await expect(oldIronMine).toContainText('UNLOCKED');
  await oldIronMine.getByRole('button', { name: 'Enter Mine' }).click();

  await expect(page.locator('#incremental-mine-view')).toBeVisible();
  await expect(page.locator('#incremental-mine-name')).toHaveText('Old Iron Mine');
  await expect(page.locator('#incremental-resources')).toContainText('Iron Ore');
  await expect(page.locator('#incremental-deposit-name')).toHaveText(/Coal Seam|Copper Vein|Iron Vein/);

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pixel_engine_save_miner-incremental_slot_1')));
  expect(saved.version).toBe(7);
  expect(saved.payload.currentMine).toBe('old-iron-mine');
  expect(saved.payload.unlockedMines).toContain('old-iron-mine');
  expect(saved.payload.statistics.minesUnlocked).toBe(2);
  expect(saved.payload.cash).toBe(7500);
  expect(saved.payload.mineProgress['blackstone-shaft-7'].depositsBroken).toBe(35);
  expect(saved.payload.mineProgress['old-iron-mine'].depositsBroken).toBe(0);
  expect(saved.payload.activeMiningEvent.id).toBe('rich-seam');

  await page.reload();
  await expect(page.locator('#incremental-save-status')).toHaveText('Local save loaded');
  await expect(page.locator('#incremental-mine-name')).toHaveText('Old Iron Mine');
  await expect(page.locator('#incremental-event-banner')).toBeVisible();
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('offline company production is capped, summarized, saved once, and excludes expired mining events', async ({ page }) => {
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/?game=miner-incremental');
  await page.locator('#incremental-story-continue').click();
  await page.addInitScript(() => {
    if (sessionStorage.getItem('milestone-six-seeded')) return;
    const key = 'pixel_engine_save_miner-incremental_slot_1';
    const save = JSON.parse(localStorage.getItem(key));
    if (!save) return;
    const now = Date.now();
    save.payload.cash = 5000;
    save.payload.character.level = 3;
    save.payload.storyStage = 'company-owner';
    save.payload.employment.active = false;
    save.payload.employment.contractBuyoutPaid = 500;
    save.payload.employment.endedAt = now - 10_000;
    save.payload.company = {
      created: true,
      name: 'Away Shift Mining',
      level: 1,
      reputation: 0,
      createdAt: now - 10_000,
      lifetimeInvestment: 0,
    };
    save.payload.generators['hired-miner'] = 2;
    save.payload.activeMiningEvent = { id: 'rich-seam', remainingSeconds: 20 };
    save.payload.lastPlayed = now - (2 * 60 * 60 * 1000);
    save.payload.milestones = [
      'blackstone-first-shift',
      'blackstone-level-two',
      'contract-within-reach',
      'contract-bought',
      'company-founded',
    ];
    localStorage.setItem(key, JSON.stringify(save));
    sessionStorage.setItem('milestone-six-seeded', 'true');
  });
  await page.reload();

  await expect(page.locator('#incremental-save-status')).toHaveText('Local save loaded');
  await expect(page.locator('#incremental-offline-overlay')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your Operation Kept Working' })).toBeVisible();
  await expect(page.locator('#incremental-offline-time-away')).toContainText('2h');
  await expect(page.locator('#incremental-offline-time-credited')).toContainText('2h');
  await expect(page.locator('#incremental-offline-production')).toContainText('deposits');
  await expect(page.locator('#incremental-offline-resources > div')).not.toHaveCount(0);
  await expect(page.locator('#incremental-offline-value')).not.toHaveText('$0');
  await expect(page.locator('#incremental-offline-note')).toContainText('expired while you were away');
  await page.locator('#incremental-offline-continue').click();
  await expect(page.locator('#incremental-offline-overlay')).toBeHidden();
  await expect(page.locator('#incremental-event-banner')).toBeHidden();

  const firstReturn = await page.evaluate(() => JSON.parse(localStorage.getItem('pixel_engine_save_miner-incremental_slot_1')));
  expect(firstReturn.version).toBe(7);
  expect(firstReturn.payload.statistics.totalOfflineProduction).toBeGreaterThan(0);
  expect(firstReturn.payload.statistics.totalOfflineTime).toBeGreaterThanOrEqual(7200);
  expect(firstReturn.payload.statistics.offlineSessions).toBe(1);
  expect(firstReturn.payload.activeMiningEvent).toBeNull();
  expect(Object.values(firstReturn.payload.materials).every((quantity) => quantity >= 0)).toBe(true);

  const offlineProduction = firstReturn.payload.statistics.totalOfflineProduction;
  await page.reload();
  await expect(page.locator('#incremental-save-status')).toHaveText('Local save loaded');
  await expect(page.locator('#incremental-offline-overlay')).toBeHidden();
  const secondReturn = await page.evaluate(() => JSON.parse(localStorage.getItem('pixel_engine_save_miner-incremental_slot_1')));
  expect(secondReturn.payload.statistics.totalOfflineProduction).toBe(offlineProduction);
  expect(secondReturn.payload.statistics.offlineSessions).toBe(1);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('Blackstone competition requirements, acquisition, story completion, and production benefit persist', async ({ page }) => {
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/?game=miner-incremental');
  await page.locator('#incremental-story-continue').click();
  await page.addInitScript(() => {
    if (sessionStorage.getItem('milestone-seven-seeded')) return;
    const key = 'pixel_engine_save_miner-incremental_slot_1';
    const save = JSON.parse(localStorage.getItem(key));
    if (!save) return;
    const now = Date.now();
    save.payload.cash = 250_000_000;
    save.payload.character.level = 16;
    save.payload.character.xp = 0;
    save.payload.storyStage = 'company-owner';
    save.payload.employment.active = false;
    save.payload.employment.contractBuyoutPaid = 500;
    save.payload.employment.endedAt = now - 10_000;
    save.payload.company = {
      created: true,
      name: 'Freedom Forge Mining',
      level: 4,
      reputation: 100,
      createdAt: now - 10_000,
      lifetimeInvestment: 100_000,
    };
    save.payload.competition = {
      rivalId: 'blackstone-mining',
      acquired: false,
      acquiredAt: null,
      acquisitionPricePaid: 0,
    };
    save.payload.unlockedMines = [
      'blackstone-shaft-7',
      'old-iron-mine',
      'deep-shaft',
      'crystal-caverns',
      'ancient-depths',
    ];
    save.payload.generators['mechanical-drill'] = 40;
    save.payload.statistics.minesUnlocked = 5;
    save.payload.statistics.totalOreMined = 1_000_000;
    save.payload.statistics.totalAutomatedProduction = 250_000;
    save.payload.statistics.companiesAcquired = 0;
    save.payload.lastPlayed = now;
    save.payload.milestones = [
      'blackstone-first-shift',
      'blackstone-level-two',
      'blackstone-level-four',
      'contract-within-reach',
      'contract-bought',
      'company-founded',
      'blackstone-new-shaft',
      'blackstone-major-contract',
      'blackstone-notices-operation',
      'blackstone-purchase-offer',
      'blackstone-production-surpassed',
    ];
    localStorage.setItem(key, JSON.stringify(save));
    sessionStorage.setItem('milestone-seven-seeded', 'true');
  });
  await page.reload();
  await expect(page.locator('#incremental-save-status')).toHaveText('Local save loaded');
  await page.locator('#incremental-tab-company').click();

  await expect(page.getByRole('heading', { name: 'Blackstone Mining Co.', exact: true })).toBeVisible();
  await expect(page.locator('#incremental-rival-status')).toHaveText('Former Employer & Rival');
  await expect(page.locator('#incremental-company-reputation')).toHaveText('100 / 100');
  await expect(page.locator('#incremental-company-production')).toHaveText('1.00K/sec');
  await expect(page.locator('#incremental-acquisition-requirements .is-met')).toHaveCount(7);
  await expect(page.locator('#incremental-acquire-company')).toBeEnabled();

  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#incremental-acquire-company').click();
  await expect(page.locator('#incremental-story-title')).toHaveText('The Company Is Yours');
  await expect(page.locator('#incremental-story-text')).toContainText('shaft where you started');
  await page.locator('#incremental-story-continue').click();

  await expect(page.locator('#incremental-rival-status')).toHaveText('Acquired');
  await expect(page.locator('#incremental-acquisition-bonus')).toHaveText('2.5x active');
  await expect(page.locator('#incremental-company-production')).toHaveText('2.50K/sec');
  await expect(page.locator('#incremental-acquire-company')).toBeDisabled();
  await expect(page.locator('#incremental-employer')).toContainText('Blackstone Mining Co.');

  const acquired = await page.evaluate(() => JSON.parse(localStorage.getItem('pixel_engine_save_miner-incremental_slot_1')));
  expect(acquired.version).toBe(7);
  expect(acquired.payload.cash).toBe(0);
  expect(acquired.payload.storyStage).toBe('blackstone-owner');
  expect(acquired.payload.competition.acquired).toBe(true);
  expect(acquired.payload.competition.acquisitionPricePaid).toBe(250_000_000);
  expect(acquired.payload.statistics.companiesAcquired).toBe(1);
  expect(acquired.payload.milestones).toContain('blackstone-acquisition');

  await page.reload();
  await expect(page.locator('#incremental-save-status')).toHaveText('Local save loaded');
  await page.locator('#incremental-tab-company').click();
  await expect(page.locator('#incremental-rival-status')).toHaveText('Acquired');
  await expect(page.locator('#incremental-company-production')).toHaveText('2.50K/sec');
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
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

    await page.locator('#incremental-tab-store').tap();
    await expect(page.getByRole('heading', { name: "Miller's General Store" })).toBeVisible();
    const navBox = await page.locator('#incremental-tab-store').boundingBox();
    expect(navBox.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

    await page.addInitScript(() => {
      if (sessionStorage.getItem('mobile-company-seeded')) return;
      const key = 'pixel_engine_save_miner-incremental_slot_1';
      const save = JSON.parse(localStorage.getItem(key));
      if (!save) return;
      save.payload.cash = 5000;
      save.payload.character.level = 3;
      save.payload.storyStage = 'company-owner';
      save.payload.employment.active = false;
      save.payload.employment.contractBuyoutPaid = 500;
      save.payload.employment.endedAt = Date.now();
      save.payload.company = {
        created: true,
        name: 'Pocket Mine Co.',
        level: 1,
        reputation: 10,
        createdAt: Date.now(),
        lifetimeInvestment: 0,
      };
      save.payload.generators['hired-miner'] = 1;
      save.payload.lastPlayed = Date.now() - (60 * 60 * 1000);
      save.payload.milestones = [
        'blackstone-first-shift',
        'blackstone-level-two',
        'contract-within-reach',
        'contract-bought',
        'company-founded',
        'blackstone-new-shaft',
      ];
      localStorage.setItem(key, JSON.stringify(save));
      sessionStorage.setItem('mobile-company-seeded', 'true');
    });
    await page.reload();
    await expect(page.locator('#incremental-offline-overlay')).toBeVisible();
    const offlineDialogBox = await page.locator('.incremental-offline-dialog').boundingBox();
    expect(offlineDialogBox.x).toBeGreaterThanOrEqual(0);
    expect(offlineDialogBox.x + offlineDialogBox.width).toBeLessThanOrEqual(390);
    await page.locator('#incremental-offline-continue').tap();
    await page.locator('#incremental-tab-company').tap();
    await expect(page.getByRole('heading', { name: 'Pocket Mine Co.' })).toBeVisible();
    const companyCard = page.locator('.incremental-business-card').first();
    const companyCardBox = await companyCard.boundingBox();
    expect(companyCardBox.x).toBeGreaterThanOrEqual(0);
    expect(companyCardBox.x + companyCardBox.width).toBeLessThanOrEqual(390);
    const competitionCardBox = await page.locator('#incremental-competition-panel').boundingBox();
    expect(competitionCardBox.x).toBeGreaterThanOrEqual(0);
    expect(competitionCardBox.x + competitionCardBox.width).toBeLessThanOrEqual(390);
    await page.locator('#incremental-tab-mines').tap();
    await expect(page.getByRole('heading', { name: 'Claims & Shafts' })).toBeVisible();
    const mineCard = page.locator('.incremental-mine-option').first();
    const mineCardBox = await mineCard.boundingBox();
    expect(mineCardBox.x).toBeGreaterThanOrEqual(0);
    expect(mineCardBox.x + mineCardBox.width).toBeLessThanOrEqual(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});

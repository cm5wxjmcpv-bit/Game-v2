import { expect, test } from '@playwright/test';

function monitorPage(page) {
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  return { assertClean: () => expect(errors, errors.join('\n')).toEqual([]) };
}

test('Weapon Maker creates, previews, tests, maps, autosaves, and publishes one reusable weapon definition', async ({ page }) => {
  const monitor = monitorPage(page);
  await page.goto('/builder/workspace.html?game=sample-rpg');
  await expect(page.locator('#projectSummary')).toContainText('weapon');
  await page.locator('#workspaceWeaponTabBtn').click();
  await expect(page.locator('#workspaceWeaponTab')).toHaveClass(/active/);
  await expect(page.locator('#weaponMakerRoot')).toContainText('Weapon Maker');

  await page.locator('#wm-preset-family').selectOption('ranged');
  await page.locator('#wm-use-preset').click();
  await expect(page.locator('#wm-family')).toHaveValue('ranged');
  await expect(page.locator('#wm-subtype')).toHaveValue('bow');
  await page.locator('#wm-id').fill('audit_bow');
  await page.locator('#wm-name').fill('Audit Bow');
  await page.locator('#wm-special-enabled').check();
  await page.locator('#wm-special-preset').selectOption('rapid');

  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEAQH/4W2kWQAAAABJRU5ErkJggg==', 'base64');
  await page.locator('#wm-art-file').setInputFiles({ name: 'audit-bow.png', mimeType: 'image/png', buffer: png });
  await expect(page.locator('#wm-preview-image')).toHaveAttribute('src', /^data:image\/png;base64,/);
  await page.locator('#wm-art-scale').fill('1.5');
  await page.locator('#wm-art-rotation').fill('15');

  const catalog = page.locator('#wm-shop-catalog option').nth(1);
  if (await catalog.count()) await page.locator('#wm-shop-catalog').selectOption(await catalog.getAttribute('value'));
  const loot = page.locator('#wm-loot-table option').nth(1);
  if (await loot.count()) await page.locator('#wm-loot-table').selectOption(await loot.getAttribute('value'));
  const actor = page.locator('#wm-starting-actor option').nth(1);
  if (await actor.count()) await page.locator('#wm-starting-actor').selectOption(await actor.getAttribute('value'));

  await page.locator('#wm-save-test').click();
  await expect(page.locator('#wm-save-status')).toContainText('Saved to the project draft');
  await expect(page.locator('#wm-test-log')).toContainText('dealt');
  await expect(page.locator('.weapon-library-list')).toContainText('Audit Bow');

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pixel_engine_builder_workspace_sample-rpg')));
  const weapon = saved.items.find((item) => item.id === 'audit_bow');
  expect(weapon.weapon.family).toBe('ranged');
  expect(weapon.weapon.specialAttack.preset).toBe('rapid');
  expect(weapon.weapon.art.icon.src).toMatch(/^data:image\/png;base64,/);
  expect(saved.shopPayload.catalogs.some((entry) => entry.stock.some((offer) => offer.itemId === 'audit_bow'))).toBeTruthy();
  expect(saved.lootTables.some((entry) => entry.entries.some((pack) => pack.rewards.some((reward) => reward.itemId === 'audit_bow')))).toBeTruthy();

  await page.locator('#workspacePublishTabBtn').click();
  await expect(page.locator('#publishFileList')).toContainText('items');
  monitor.assertClean();
});

test('game inventory shows equipped weapon, mana, and safe equipment controls', async ({ page }) => {
  const monitor = monitorPage(page);
  await page.goto('/?game=sample-rpg');
  await page.locator('#new-game').click();
  await page.locator('#class-opts button').first().click();
  await expect(page.locator('#player-panel')).toContainText('Weapon:');
  await expect(page.locator('#player-panel')).toContainText('Mana:');
  await page.locator('#hud-inventory').click();
  await expect(page.locator('#overlay')).toContainText('Inventory & Equipment');
  await expect(page.locator('#overlay')).toContainText('Equipped Weapon');
  await page.locator('#close-inventory').click();
  await expect(page.locator('#overlay')).toHaveClass(/hidden/);
  monitor.assertClean();
});

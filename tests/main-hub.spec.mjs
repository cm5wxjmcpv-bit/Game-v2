import { expect, test } from '@playwright/test';

function validSavePayload() {
  return {
    version: 5,
    gameId: 'scene-demo',
    slot: 1,
    checkpointAt: '2026-08-07T00:00:00.000Z',
    payload: {
      currentSceneId: 'scene_lab',
      player: {
        actorId: 'scene_actor',
        actorName: 'Scene Explorer',
        x: 1,
        y: 1,
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
  };
}

test('root opens the Main Hub with registered games and builder links', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Game & Builder Hub' })).toBeVisible();
  await expect(page.locator('#app')).toBeHidden();
  await expect(page.locator('.hub-game-card')).toHaveCount(3);
  await expect(page.locator('[data-game-id="sample-rpg"]')).toContainText('Sample RPG');
  await expect(page.locator('[data-game-id="scene-demo"]')).toContainText('Generic Scene Demo');

  await expect(page.locator('[data-game-id="scene-demo"] a', { hasText: 'Play' }))
    .toHaveAttribute('href', /\?game=scene-demo$/);
  await expect(page.locator('[data-game-id="scene-demo"] a', { hasText: 'New Game' }))
    .toHaveAttribute('href', /game=scene-demo&action=new$/);
  await expect(page.locator('[data-game-id="scene-demo"] a', { hasText: 'Open Builder' }))
    .toHaveAttribute('href', /builder\/workspace\.html\?game=scene-demo$/);

  const continueLink = page.locator('[data-game-id="scene-demo"] a', { hasText: 'Continue' });
  await expect(continueLink).toHaveAttribute('aria-disabled', 'true');
  expect(pageErrors).toEqual([]);
});

test('Main Hub enables Continue only for a structurally valid game save', async ({ page }) => {
  await page.addInitScript((save) => {
    localStorage.setItem('pixel_engine_save_scene-demo_slot_1', JSON.stringify(save));
    localStorage.setItem('pixel_engine_save_sandbox-demo_slot_1', '{broken');
  }, validSavePayload());

  await page.goto('/');

  const sceneContinue = page.locator('[data-game-id="scene-demo"] a', { hasText: 'Continue' });
  await expect(sceneContinue).not.toHaveAttribute('aria-disabled', 'true');
  await expect(sceneContinue).toHaveAttribute('href', /game=scene-demo&action=continue$/);

  const sandboxContinue = page.locator('[data-game-id="sandbox-demo"] a', { hasText: 'Continue' });
  await expect(sandboxContinue).toHaveAttribute('aria-disabled', 'true');
});

test('explicit game URLs still launch the existing runtime and expose navigation back to the hub', async ({ page }) => {
  await page.goto('/?game=scene-demo');
  await expect(page.locator('#main-hub')).toBeHidden();
  await expect(page.locator('#game-canvas')).toBeVisible();
  await expect(page.locator('#new-game')).toBeVisible();
  await expect(page.locator('#runtime-main-hub-link')).toHaveAttribute('href', './');
  await expect(page.locator('#runtime-builder-link')).toHaveAttribute('href', /builder\/workspace\.html\?game=scene-demo$/);
});

test('New Game from the hub skips the package menu and opens actor selection', async ({ page }) => {
  await page.goto('/?game=scene-demo&action=new');
  await expect(page.getByRole('heading', { name: 'Choose Actor' })).toBeVisible();
  await expect(page.locator('#class-opts button')).toHaveCount(1);
  await expect(page).toHaveURL(/\?game=scene-demo$/);
});

test('Continue from the hub loads a valid save directly', async ({ page }) => {
  await page.addInitScript((save) => {
    localStorage.setItem('pixel_engine_save_scene-demo_slot_1', JSON.stringify(save));
  }, validSavePayload());

  await page.goto('/?game=scene-demo&action=continue');
  await expect(page.locator('#overlay')).toBeHidden();
  await expect(page.locator('#context-panel')).toContainText('Scene: scene_lab');
  await expect(page).toHaveURL(/\?game=scene-demo$/);
});

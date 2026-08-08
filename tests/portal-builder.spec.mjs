import { expect, test } from '@playwright/test';

const WORKSPACE_DRAFT_KEY = 'pixel_engine_builder_workspace_scene-demo';

test('Portal Builder creates a styled two-way portal with exact arrival and publishes both scenes', async ({ page }) => {
  await page.goto('/builder/workspace.html?game=scene-demo');
  await expect(page.locator('#workspaceMessage')).toContainText('Generic Scene Demo loaded');
  await expect(page.locator('#sceneSelect')).toHaveValue('scene_lab');
  await expect(page.getByRole('button', { name: 'Portal Builder' })).toBeVisible();

  await page.getByRole('button', { name: 'Portal Builder' }).click();
  await page.waitForURL(/\/builder\/portal-builder\.html\?game=scene-demo&scene=scene_lab/);
  await expect(page.locator('#portalProjectLabel')).toContainText('scene-demo');
  await expect(page.locator('#sourceSceneSelect')).toHaveValue('scene_lab');

  await page.getByRole('button', { name: 'New Portal' }).click();
  await expect(page.locator('#portalIdInput')).toHaveValue('portal_2');
  await page.locator('#destinationSceneSelect').selectOption('fallback_room');

  await page.locator('#sourceMapPreview [data-map-x="3"][data-map-y="3"]').click();
  await page.locator('#destinationMapPreview [data-map-x="2"][data-map-y="2"]').click();
  await page.locator('#twoWayInput').check();
  await page.locator('#portalTriggerSelect').selectOption('touch');
  await page.locator('#appearanceModeSelect').selectOption('texture');
  await page.locator('#portalTextureSelect').selectOption('scene_accent');
  await page.locator('#portalRequirementSelect').selectOption('level_completed');
  await page.locator('#portalRequirementIdInput').fill('level_done');
  await page.locator('#portalRequirementMessageInput').fill('Finish the trial first.');

  await page.getByRole('button', { name: 'Validate Link' }).click();
  await expect(page.locator('#portalStatus')).toContainText('Portal link is valid');
  await page.getByRole('button', { name: 'Save Portal to Draft' }).click();
  await expect(page.locator('#portalStatus')).toContainText('automatic return portal');

  const draft = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), WORKSPACE_DRAFT_KEY);
  const source = draft.scenes.find((scene) => scene.id === 'scene_lab');
  const destination = draft.scenes.find((scene) => scene.id === 'fallback_room');
  const forward = source.objects.portals.find((portal) => portal.id === 'portal_2');
  expect(forward).toBeTruthy();
  expect(forward.x).toBe(3);
  expect(forward.y).toBe(3);
  expect(forward.targetScene).toBe('fallback_room');
  expect(forward.arrival).toEqual({ x: 2, y: 2 });
  expect(forward.trigger).toBe('touch');
  expect(forward.appearance.mode).toBe('texture');
  expect(forward.appearance.textureId).toBe('scene_accent');
  expect(forward.requirement).toEqual({
    type: 'level_completed',
    id: 'level_done',
    message: 'Finish the trial first.',
  });
  expect(forward.linkMode).toBe('two-way');
  expect(forward.pairedPortalId).toBeTruthy();

  const back = destination.objects.portals.find((portal) => portal.id === forward.pairedPortalId);
  expect(back).toBeTruthy();
  expect(back.x).toBe(2);
  expect(back.y).toBe(2);
  expect(back.targetScene).toBe('scene_lab');
  expect(back.arrival).toEqual({ x: 3, y: 3 });
  expect(back.pairedPortalId).toBe('portal_2');

  await page.getByRole('link', { name: 'Back to Game Workspace' }).click();
  await page.waitForURL(/\/builder\/workspace\.html\?game=scene-demo/);
  await expect(page.locator('#workspaceMessage')).toContainText('Generic Scene Demo loaded');
  await page.locator('#workspacePublishTabBtn').click();
  await expect(page.locator('#publishFileList')).toContainText('games/scene-demo/data/scenes/scene_lab.json');
  await expect(page.locator('#publishFileList')).toContainText('games/scene-demo/data/towns/fallback_room.json');
});

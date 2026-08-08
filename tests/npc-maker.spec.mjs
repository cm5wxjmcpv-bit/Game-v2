import { expect, test } from '@playwright/test';

const WORKSPACE_DRAFT_KEY = 'pixel_engine_builder_workspace_scene-demo';
const ASSET_DRAFT_KEY = 'pixel_engine_builder_assets_scene-demo';

test('NPC Maker saves a reusable template, places it on a scene and includes both changes in Publish', async ({ page }) => {
  await page.goto('/builder/workspace.html?game=scene-demo');
  await expect(page.locator('#workspaceMessage')).toContainText('Generic Scene Demo loaded');
  await expect(page.locator('#workspaceNpcTabBtn')).toBeVisible();

  await page.locator('#workspaceNpcTabBtn').click();
  await expect(page.locator('#npcMakerStatus')).toContainText('NPC Maker loaded');
  await page.locator('#newNpcBtn').click();
  await page.locator('#npcIdInput').fill('town_guide');
  await page.locator('#npcNameInput').fill('Town Guide');
  await page.locator('#npcFactionSelect').selectOption('friendly');
  await page.locator('#npcBehaviorSelect').selectOption('stationary');
  await page.locator('#npcDialogueInput').fill('Welcome traveler.\nThe builder is working.');
  await page.locator('#npcAppearanceModeSelect').selectOption('texture');
  await page.locator('#npcTextureSelect').selectOption('scene_accent');
  await page.locator('#npcForm button[type="submit"]').click();
  await expect(page.locator('#npcMakerStatus')).toContainText('Town Guide');

  await page.locator('#npcSceneSelect').selectOption('scene_lab');
  await page.locator('#npcMap [data-npc-map-x="3"][data-npc-map-y="3"]').click();
  await page.locator('#npcPlaceBtn').click();
  await expect(page.locator('#npcMakerStatus')).toContainText('Placed');
  await expect(page.locator('#npcPlacementList')).toContainText('Town Guide');

  await page.locator('#saveDraftBtn').click();
  const workspaceDraft = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), WORKSPACE_DRAFT_KEY);
  const scene = workspaceDraft.scenes.find((entry) => entry.id === 'scene_lab');
  const placement = scene.entities.find((entry) => entry.type === 'npc' && entry.npcId === 'town_guide');
  expect(placement).toBeTruthy();
  expect(placement.x).toBe(3);
  expect(placement.y).toBe(3);
  expect(placement.components).toBeUndefined();

  const assetDraft = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), ASSET_DRAFT_KEY);
  const npcFile = assetDraft.files.find((file) => file.path === 'games/scene-demo/data/npcs/npcs.json');
  expect(npcFile).toBeTruthy();
  const template = npcFile.currentPayload.npcs.find((entry) => entry.id === 'town_guide');
  expect(template.name).toBe('Town Guide');
  expect(template.interaction.dialogue).toEqual(['Welcome traveler.', 'The builder is working.']);
  expect(template.render.textureId).toBe('scene_accent');

  await page.locator('#workspacePublishTabBtn').click();
  await expect(page.locator('#publishFileList')).toContainText('games/scene-demo/data/npcs/npcs.json');
  await expect(page.locator('#publishFileList')).toContainText('games/scene-demo/data/scenes/scene_lab.json');
});

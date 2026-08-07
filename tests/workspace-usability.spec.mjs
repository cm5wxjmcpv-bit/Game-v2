import { expect, test } from '@playwright/test';

test('workspace keeps exactly one main workflow tab active', async ({ page }) => {
  await page.goto('/builder/workspace.html?game=scene-demo');
  await expect(page.locator('#projectSummary')).toContainText('Generic Scene Demo');
  await expect(page.locator('#workspaceObjectsTab')).toBeHidden();

  await page.locator('#workspaceObjectsTabBtn').click();
  await expect(page.locator('#workspaceObjectsTab')).toHaveClass(/active/);
  await expect(page.locator('#workspaceObjectsTab')).toBeVisible();
  await expect(page.locator('.workspace-tab.active')).toHaveCount(1);

  await page.locator('#workspacePublishTabBtn').click();
  await expect(page.locator('#workspacePublishTab')).toHaveClass(/active/);
  await expect(page.locator('#workspaceObjectsTab')).not.toHaveClass(/active/);
  await expect(page.locator('#workspaceObjectsTab')).toBeHidden();
  await expect(page.locator('.workspace-tab.active')).toHaveCount(1);
  await expect(page.locator('#publishPlanSummary')).toBeVisible();

  await page.locator('#workspaceNewGameTabBtn').click();
  await expect(page.locator('#workspaceNewGameTab')).toHaveClass(/active/);
  await expect(page.locator('.workspace-tab.active')).toHaveCount(1);

  await page.locator('#workspaceSceneTabBtn').click();
  await expect(page.locator('#workspaceSceneTab')).toHaveClass(/active/);
  await expect(page.locator('.workspace-tab.active')).toHaveCount(1);
});

test('clearing a local draft and its staged textures requires confirmation', async ({ page }) => {
  const draftKey = 'pixel_engine_builder_workspace_scene-demo';
  const assetsKey = 'pixel_engine_builder_assets_scene-demo';

  await page.goto('/builder/workspace.html?game=scene-demo');
  await expect(page.locator('#projectSummary')).toContainText('Generic Scene Demo');
  await page.evaluate(({ draftKey: draft, assetsKey: assets }) => {
    localStorage.setItem(draft, JSON.stringify({ marker: 'keep-draft' }));
    localStorage.setItem(assets, JSON.stringify({ marker: 'keep-assets' }));
  }, { draftKey, assetsKey });

  page.once('dialog', (dialog) => dialog.dismiss());
  await page.locator('#clearDraftBtn').click();
  let stored = await page.evaluate(({ draftKey: draft, assetsKey: assets }) => ({
    draft: localStorage.getItem(draft),
    assets: localStorage.getItem(assets),
  }), { draftKey, assetsKey });
  expect(stored.draft).toContain('keep-draft');
  expect(stored.assets).toContain('keep-assets');

  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#clearDraftBtn').click();
  stored = await page.evaluate(({ draftKey: draft, assetsKey: assets }) => ({
    draft: localStorage.getItem(draft),
    assets: localStorage.getItem(assets),
  }), { draftKey, assetsKey });
  expect(stored).toEqual({ draft: null, assets: null });
});

test('switching projects asks before discarding unsaved workspace edits', async ({ page }) => {
  await page.goto('/builder/workspace.html?game=scene-demo');
  await expect(page.locator('#projectSummary')).toContainText('Generic Scene Demo');
  await page.locator('#workspaceActorTabBtn').click();
  await page.locator('#actorList [data-actor-id="scene_actor"]').click();
  await page.locator('#actorNameInput').fill('Unsaved Actor Change');
  await page.locator('#saveActorBtn').click();
  await expect(page.locator('#workspaceMessage')).toContainText('saved');

  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('confirm');
    expect(dialog.message()).toMatch(/unsaved/i);
    await dialog.dismiss();
  });
  await page.locator('#projectSelect').selectOption('sample-rpg');

  await expect(page.locator('#projectSelect')).toHaveValue('scene-demo');
  await expect(page.locator('#projectSummary')).toContainText('Generic Scene Demo');
  await expect(page.locator('#actorNameInput')).toHaveValue('Unsaved Actor Change');
});

test('workspace warns before browser navigation only while edits are unsaved', async ({ page }) => {
  await page.goto('/builder/workspace.html?game=scene-demo');
  await expect(page.locator('#projectSummary')).toContainText('Generic Scene Demo');
  await page.locator('#workspaceActorTabBtn').click();
  await page.locator('#actorList [data-actor-id="scene_actor"]').click();
  await page.locator('#actorNameInput').fill('Navigation Guard Actor');
  await page.locator('#saveActorBtn').click();

  const unsavedAllowsUnload = await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    return window.dispatchEvent(event);
  });
  expect(unsavedAllowsUnload).toBe(false);

  await page.locator('#saveDraftBtn').click();
  const savedAllowsUnload = await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    return window.dispatchEvent(event);
  });
  expect(savedAllowsUnload).toBe(true);
});

test('workspace refuses actor and entity ID collisions instead of overwriting entries', async ({ page }) => {
  await page.goto('/builder/workspace.html?game=scene-demo');
  await expect(page.locator('#projectSummary')).toContainText('Generic Scene Demo');

  await page.locator('#workspaceActorTabBtn').click();
  await page.locator('#newActorBtn').click();
  await page.locator('#actorIdInput').fill('scene_actor');
  await page.locator('#actorNameInput').fill('Duplicate Actor');
  await page.locator('#saveActorBtn').click();
  await expect(page.locator('#workspaceMessage')).toContainText(/already exists/i);
  await expect(page.locator('#actorList [data-actor-id="scene_actor"]')).toHaveCount(1);
  await expect(page.locator('#actorList')).toContainText('Scene Explorer');
  await expect(page.locator('#actorList')).not.toContainText('Duplicate Actor');

  await page.locator('#workspaceSceneTabBtn').click();
  await page.locator('#newEntityBtn').click();
  await page.locator('#entityIdInput').fill('welcome_beacon');
  await page.locator('#entityTypeInput').fill('duplicate');
  await page.locator('#saveEntityBtn').click();
  await expect(page.locator('#workspaceMessage')).toContainText(/already exists/i);
  await expect(page.locator('#entityList [data-entity-id="welcome_beacon"]')).toHaveCount(1);
  await expect(page.locator('#entityList')).toContainText('beacon');
  await expect(page.locator('#entityList')).not.toContainText('duplicate');
  await page.locator('#entityList [data-entity-id="welcome_beacon"]').click();
  await expect(page.locator('#entityTypeInput')).toHaveValue('beacon');
  await expect(page.locator('#entityActionSelect')).toHaveValue('message');
});

test('tile permission storage failure is reported and the unsaved toggle rolls back', async ({ page }) => {
  await page.goto('/builder/workspace.html?game=scene-demo');
  await expect(page.locator('#projectSummary')).toContainText('Generic Scene Demo');
  const accent = page.locator('[data-package-tile-id="scene_accent"]');
  await expect(accent).not.toBeChecked();

  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    let draftWrites = 0;
    Storage.prototype.setItem = function failFollowUpDraftWrite(key, value) {
      if (String(key) === 'pixel_engine_builder_workspace_scene-demo') {
        draftWrites += 1;
        if (draftWrites === 2) throw new DOMException('Audit quota reached', 'QuotaExceededError');
      }
      return original.call(this, key, value);
    };
  });

  await accent.click();
  await expect(page.locator('#workspaceMessage')).toContainText(/tile permissions were not saved/i);
  await expect(page.locator('#workspaceMessage')).toHaveClass(/error/);
  await expect(accent).not.toBeChecked();
  const savedSelection = await page.evaluate(() => {
    const draft = JSON.parse(localStorage.getItem('pixel_engine_builder_workspace_scene-demo'));
    return draft.scenes.find((scene) => scene.id === 'scene_lab')._workspaceEditorTileIds || [];
  });
  expect(savedSelection).not.toContain('scene_accent');
});

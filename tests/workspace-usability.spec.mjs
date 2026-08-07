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

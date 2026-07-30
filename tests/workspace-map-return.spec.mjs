import { expect, test } from '@playwright/test';

function scene(name = 'Original Scene') {
  return {
    id: 'scene_lab',
    name,
    width: 2,
    height: 2,
    tiles: [['scene_floor', 'scene_floor'], ['scene_floor', 'scene_floor']],
    spawn: { x: 0, y: 0 },
    objects: { portals: [], shops: [], fountains: [], enemySpawns: [], battleTriggers: [] },
    entities: [],
  };
}

function texture() {
  return {
    id: 'custom_texture_quota_floor',
    name: 'Quota Floor',
    size: 16,
    pixels: Array.from({ length: 16 }, () => Array.from({ length: 16 }, () => ({ color: '#336699', alpha: 1 }))),
    previewColor: '#336699',
    image: 'data:image/png;base64,AA==',
    walkable: true,
  };
}

test('workspace rolls back a returned level and keeps it recoverable when texture storage fails', async ({ page }) => {
  const projectId = 'scene-demo';
  const draftKey = `pixel_engine_builder_workspace_${projectId}`;
  const assetsKey = `pixel_engine_builder_assets_${projectId}`;
  const resultKey = 'pixel_engine_builder_map_bridge_result_v1';
  const handoffKey = 'pixel_engine_builder_map_bridge_handoff_v1';
  const draft = { version: 1, projectId, actors: [], scenes: [scene()], savedAt: 'before' };
  const assetDraft = { schemaVersion: 1, projectId, textures: [], updatedAt: 'before' };
  const returnedScene = scene('Returned Scene');
  returnedScene.tiles[1][1] = 'custom_texture_quota_floor';
  const result = {
    schemaVersion: 2,
    projectId,
    sceneId: 'scene_lab',
    scene: returnedScene,
    customTextures: [texture()],
  };

  await page.addInitScript((fixture) => {
    const nativeSetItem = Storage.prototype.setItem;
    localStorage.setItem(fixture.draftKey, fixture.previousDraft);
    localStorage.setItem(fixture.assetsKey, fixture.previousAssets);
    localStorage.setItem(fixture.resultKey, fixture.resultJson);
    localStorage.setItem(fixture.handoffKey, JSON.stringify({ retainedForRetry: true }));
    let failed = false;
    Storage.prototype.setItem = function setItem(key, value) {
      if (this === localStorage && key === fixture.assetsKey && !failed) {
        failed = true;
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      }
      return nativeSetItem.call(this, key, value);
    };
  }, {
    draftKey,
    assetsKey,
    resultKey,
    handoffKey,
    previousDraft: JSON.stringify(draft),
    previousAssets: JSON.stringify(assetDraft),
    resultJson: JSON.stringify(result),
  });

  await page.goto('/builder/workspace.html?game=scene-demo');
  await expect(page.locator('#projectSummary')).toContainText('Generic Scene Demo');
  await expect(page.locator('#workspaceMessage')).toContainText('Level return was not saved');
  await expect(page.locator('#workspaceMessage')).toContainText('returned data was kept');

  const stored = await page.evaluate(({ draftKey: d, assetsKey: a, resultKey: r, handoffKey: h }) => ({
    draft: localStorage.getItem(d),
    assets: localStorage.getItem(a),
    result: localStorage.getItem(r),
    handoff: localStorage.getItem(h),
  }), { draftKey, assetsKey, resultKey, handoffKey });

  expect(stored.draft).toBe(JSON.stringify(draft));
  expect(stored.assets).toBe(JSON.stringify(assetDraft));
  expect(stored.result).toBe(JSON.stringify(result));
  expect(JSON.parse(stored.handoff)).toEqual({ retainedForRetry: true });
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { buildWorkspaceAssetFileChanges } from '../../builder/workspace-asset-model.js';
import { buildWorkspacePublishPlan, validateWorkspacePublishPlan } from '../../builder/workspace-publish-model.js';

function textureAsset() {
  return {
    id: 'custom_texture_crimson_floor',
    name: 'Crimson Floor',
    size: 16,
    pixels: Array.from({ length: 16 }, () => Array.from({ length: 16 }, () => ({ color: '#aa1122', alpha: 1 }))),
    previewColor: '#aa1122',
    image: 'data:image/png;base64,AAAA',
    walkable: true,
    updatedAt: '2026-07-30T12:00:00.000Z',
  };
}

test('publish plan includes the changed level and merged package tile texture file', () => {
  const baselineScene = {
    id: 'scene_lab',
    name: 'Scene Lab',
    width: 2,
    height: 2,
    tiles: [['scene_floor', 'scene_floor'], ['scene_floor', 'scene_floor']],
    spawn: { x: 0, y: 0 },
    objects: { portals: [], shops: [], fountains: [], enemySpawns: [], battleTriggers: [] },
    entities: [],
    _workspaceKind: 'scene',
    _workspacePath: 'data/scenes/scene_lab.json',
  };
  const currentScene = {
    ...baselineScene,
    tiles: [['scene_floor', 'custom_texture_crimson_floor'], ['scene_floor', 'scene_floor']],
  };
  const core = {
    tiles: [{ id: 'scene_floor', texture: 'scene_floor', walkable: true }],
    textures: [{ id: 'scene_floor', color: '#64748b' }],
    effects: [],
  };
  const assetFiles = buildWorkspaceAssetFileChanges({
    assetDraft: { projectId: 'scene-demo', textures: [textureAsset()] },
    tilesSource: { path: 'games/scene-demo/data/core.json', payload: core },
    texturesSource: { path: 'games/scene-demo/data/core.json', payload: core },
  });
  const plan = buildWorkspacePublishPlan({
    projectId: 'scene-demo',
    manifest: { data: { actors: 'data/actors.json' } },
    contentRootUrl: new URL('https://example.test/Game-v2/games/scene-demo/'),
    repositoryRootUrl: new URL('https://example.test/Game-v2/'),
    actors: [],
    baselineActors: [],
    scenes: [currentScene],
    baselineScenes: [baselineScene],
    assetFiles,
  });

  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.files.map((file) => file.path).sort(), [
    'games/scene-demo/data/core.json',
    'games/scene-demo/data/scenes/scene_lab.json',
  ]);
  assert.equal(plan.files.find((file) => file.path.endsWith('/core.json')).kind, 'tiles/textures');
  assert.equal(validateWorkspacePublishPlan(plan), plan);
});

test('custom texture publish files cannot escape the selected game package', () => {
  const plan = buildWorkspacePublishPlan({
    projectId: 'scene-demo',
    manifest: { data: {} },
    contentRootUrl: new URL('https://example.test/Game-v2/games/scene-demo/'),
    repositoryRootUrl: new URL('https://example.test/Game-v2/'),
    actors: [],
    baselineActors: [],
    scenes: [],
    baselineScenes: [],
    assetFiles: [{
      path: 'games/other-game/data/core.json',
      baselinePayload: { tiles: [], textures: [] },
      currentPayload: { tiles: [{ id: 'bad' }], textures: [] },
    }],
  });
  assert.match(plan.errors.join(' '), /must stay inside games\/scene-demo\//i);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { MAP_BRIDGE_SCHEMA_VERSION } from '../../builder/map-bridge-model.js';
import { assetDraftKey } from '../../builder/workspace-asset-model.js';
import {
  buildReturnedMapStorageUpdates,
  commitStorageUpdates,
} from '../../builder/workspace-return-model.js';

class FakeStorage {
  constructor(entries = {}, failKey = '') {
    this.values = new Map(Object.entries(entries));
    this.failKey = failKey;
    this.failed = false;
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    if (key === this.failKey && !this.failed) {
      this.failed = true;
      throw new Error('Quota exceeded');
    }
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

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
    id: 'custom_texture_rollback_floor',
    name: 'Rollback Floor',
    size: 16,
    pixels: Array.from({ length: 16 }, () => Array.from({ length: 16 }, () => ({ color: '#336699', alpha: 1 }))),
    previewColor: '#336699',
    image: 'data:image/png;base64,AA==',
    walkable: true,
  };
}

function fixtures() {
  const projectId = 'scene-demo';
  const draft = { version: 1, projectId, actors: [], scenes: [scene()], savedAt: 'before' };
  const assetDraft = { schemaVersion: 1, projectId, textures: [], updatedAt: 'before' };
  const returnedScene = scene('Returned Scene');
  returnedScene.tiles[1][1] = 'custom_texture_rollback_floor';
  const result = {
    schemaVersion: MAP_BRIDGE_SCHEMA_VERSION,
    projectId,
    sceneId: 'scene_lab',
    scene: returnedScene,
    customTextures: [texture()],
  };
  return { projectId, draft, assetDraft, result };
}

test('returned level and textures commit together when browser storage succeeds', () => {
  const { projectId, draft, assetDraft, result } = fixtures();
  const transaction = buildReturnedMapStorageUpdates({ result, draft, assetDraft });
  const storage = new FakeStorage();

  commitStorageUpdates(storage, transaction.updates);

  const savedDraft = JSON.parse(storage.getItem(`pixel_engine_builder_workspace_${projectId}`));
  const savedAssets = JSON.parse(storage.getItem(assetDraftKey(projectId)));
  assert.equal(savedDraft.scenes[0].name, 'Returned Scene');
  assert.equal(savedDraft.scenes[0].tiles[1][1], 'custom_texture_rollback_floor');
  assert.deepEqual(savedAssets.textures.map((entry) => entry.id), ['custom_texture_rollback_floor']);
});

test('failed texture storage rolls the level draft back to its exact previous value', () => {
  const { projectId, draft, assetDraft, result } = fixtures();
  const draftKey = `pixel_engine_builder_workspace_${projectId}`;
  const assetsKey = assetDraftKey(projectId);
  const previousDraft = JSON.stringify(draft);
  const previousAssets = JSON.stringify(assetDraft);
  const transaction = buildReturnedMapStorageUpdates({ result, draft, assetDraft });
  const storage = new FakeStorage({ [draftKey]: previousDraft, [assetsKey]: previousAssets }, assetsKey);

  assert.throws(
    () => commitStorageUpdates(storage, transaction.updates),
    /Quota exceeded.*rolled back/i,
  );
  assert.equal(storage.getItem(draftKey), previousDraft);
  assert.equal(storage.getItem(assetsKey), previousAssets);
});

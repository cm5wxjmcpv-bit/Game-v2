import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createLocalPublishSnapshot,
  localPublishFileMap,
  localPublishKey,
  readLocalPublishSnapshot,
  writeLocalPublishSnapshot,
} from '../../builder/local-publish-model.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
}

test('browser Publish & Play snapshot keeps validated changed JSON without a token', () => {
  const storage = memoryStorage();
  const snapshot = createLocalPublishSnapshot({
    plan: {
      projectId: 'scene-demo',
      errors: [],
      files: [{
        path: 'games/scene-demo/data/scenes/scene_lab.json',
        content: '{"id":"scene_lab","name":"Local Build"}\n',
      }],
    },
    sceneId: 'scene_lab',
    now: new Date('2026-08-08T12:00:00.000Z'),
    snapshotId: 'snapshot_1',
  });

  writeLocalPublishSnapshot(snapshot, storage);
  const restored = readLocalPublishSnapshot('scene-demo', storage);
  assert.equal(localPublishKey('scene-demo'), 'pixel_engine_local_publish_scene-demo');
  assert.equal(restored.snapshotId, 'snapshot_1');
  assert.equal(restored.sceneId, 'scene_lab');
  assert.equal(localPublishFileMap(restored).get('games/scene-demo/data/scenes/scene_lab.json'), '{"id":"scene_lab","name":"Local Build"}\n');
  assert.doesNotMatch(storage.getItem(localPublishKey('scene-demo')), /token|github_pat/i);
});

test('browser Publish & Play accepts an unchanged game and rejects unsafe files', () => {
  const unchanged = createLocalPublishSnapshot({
    plan: { projectId: 'scene-demo', errors: [], files: [] },
    sceneId: 'scene_lab',
    snapshotId: 'snapshot_2',
  });
  assert.deepEqual(unchanged.files, []);

  assert.throws(() => createLocalPublishSnapshot({
    plan: {
      projectId: 'scene-demo',
      errors: [],
      files: [{ path: '../secret.json', content: '{}' }],
    },
    snapshotId: 'snapshot_3',
  }), /invalid game file/i);
});


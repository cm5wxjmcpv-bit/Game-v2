import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CloudDataRepository,
  compareLocalAndCloud,
  normalizeCloudProject,
  payloadHash,
  stableStringify,
} from '../../builder/cloud-data-model.js';

test('stable cloud payload hashing ignores object key order', () => {
  assert.equal(stableStringify({ b: 2, a: 1 }), stableStringify({ a: 1, b: 2 }));
  assert.equal(payloadHash({ b: 2, a: 1 }), payloadHash({ a: 1, b: 2 }));
  assert.notEqual(payloadHash({ a: 1 }), payloadHash({ a: 2 }));
});

test('local/cloud comparison detects upload, download, equality, and conflict', () => {
  const original = { value: 1 };
  const local = { value: 2 };
  const cloud = { value: 3 };
  assert.equal(compareLocalAndCloud({ localPayload: local, cloudPayload: null }).action, 'upload');
  assert.equal(compareLocalAndCloud({ localPayload: null, cloudPayload: cloud }).action, 'download');
  assert.equal(compareLocalAndCloud({ localPayload: original, cloudPayload: { value: 1 } }).action, 'same');
  assert.equal(compareLocalAndCloud({ localPayload: local, cloudPayload: cloud }).action, 'conflict');
  assert.equal(compareLocalAndCloud({ localPayload: local, cloudPayload: original, lastSyncedHash: payloadHash(original) }).action, 'upload');
  assert.equal(compareLocalAndCloud({ localPayload: original, cloudPayload: cloud, lastSyncedHash: payloadHash(original) }).action, 'download');
});

test('cloud project normalization keeps the game package identity', () => {
  assert.deepEqual(normalizeCloudProject({
    id: 'project-1', owner_id: 'user-1', game_package_id: 'scene-demo', stable_engine_id: 'scene-demo', name: 'Scene Demo', metadata: {},
  }), {
    id: 'project-1', ownerId: 'user-1', gamePackageId: 'scene-demo', name: 'Scene Demo', metadata: {}, createdAt: '', updatedAt: '',
  });
});

test('cloud repository creates a project and saves a revisioned workspace draft', async () => {
  const calls = [];
  const client = {
    getSession: () => ({ user: { id: 'user-1' } }),
    async rest(path, options = {}) {
      calls.push({ path, options });
      if (path.startsWith('projects?select=*&game_package_id')) return [];
      if (path === 'projects?select=*') return [{ id: 'project-1', owner_id: 'user-1', game_package_id: 'scene-demo', stable_engine_id: 'scene-demo', name: 'Scene Demo' }];
      if (path === 'rpc/save_workspace_draft') return [{ id: 'draft-1', project_id: 'project-1', stable_engine_id: 'workspace', payload: { version: 2 }, revision: 1 }];
      throw new Error(`Unexpected ${path}`);
    },
  };
  const repository = new CloudDataRepository(client);
  const project = await repository.ensureProject({ gamePackageId: 'scene-demo', name: 'Scene Demo' });
  const draft = await repository.saveWorkspaceDraft({ projectId: project.id, stableEngineId: 'workspace', payload: { version: 2 }, expectedRevision: 0 });
  assert.equal(project.gamePackageId, 'scene-demo');
  assert.equal(draft.revision, 1);
  assert.equal(calls.at(-1).options.body.p_expected_revision, 0);
});


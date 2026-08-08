import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkspaceSyncController } from '../../builder/local-first-sync.js';

function storage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    get length() { return data.size; },
    key(index) { return [...data.keys()][index] ?? null; },
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(String(key), String(value)); },
    removeItem(key) { data.delete(String(key)); },
  };
}

function controllerOptions(repository, local, statuses, online = () => true) {
  return {
    repository,
    storage: local,
    online,
    onStatus: (status) => statuses.push(status),
    eventTarget: null,
    setRepeating: () => null,
    clearRepeating: () => {},
    setTimer: () => null,
    clearTimer: () => {},
  };
}

test('workspace cloud sync uploads a local draft and records a cloud revision', async () => {
  const local = storage({ pixel_engine_builder_workspace_scene_demo: JSON.stringify({ version: 2, projectId: 'scene_demo', value: 1 }) });
  const statuses = [];
  const saved = [];
  const repository = {
    currentUser: () => ({ id: 'user-1' }),
    ensureProject: async () => ({ id: 'project-1' }),
    getWorkspaceDraft: async () => null,
    saveWorkspaceDraft: async (request) => { saved.push(request); return { revision: 1, payload: request.payload }; },
  };
  const sync = new WorkspaceSyncController(controllerOptions(repository, local, statuses));
  await sync.start({ packageId: 'scene_demo', name: 'Scene Demo' });
  assert.equal(saved.length, 1);
  assert.equal(saved[0].stableEngineId, 'workspace');
  assert.equal(statuses.some((entry) => entry.state === 'saved-cloud'), true);
  sync.stop();
});

test('offline workspace sync keeps local data and never reports a cloud save', async () => {
  const local = storage({ pixel_engine_builder_workspace_scene_demo: JSON.stringify({ version: 2, projectId: 'scene_demo' }) });
  const statuses = [];
  const repository = {
    currentUser: () => ({ id: 'user-1' }),
    ensureProject: async () => ({ id: 'project-1' }),
    getWorkspaceDraft: async () => { throw new Error('should not call'); },
  };
  const sync = new WorkspaceSyncController(controllerOptions(repository, local, statuses, () => false));
  await sync.start({ packageId: 'scene_demo', name: 'Scene Demo' });
  assert.ok(local.getItem('pixel_engine_builder_workspace_scene_demo'));
  assert.equal(statuses.at(-1).state, 'offline');
  assert.equal(statuses.some((entry) => entry.state === 'saved-cloud'), false);
  sync.stop();
});

test('a divergent first cloud copy produces a conflict without overwriting either copy', async () => {
  const localPayload = { version: 2, projectId: 'scene_demo', value: 'local' };
  const cloudPayload = { version: 2, projectId: 'scene_demo', value: 'cloud' };
  const local = storage({ pixel_engine_builder_workspace_scene_demo: JSON.stringify(localPayload) });
  const statuses = [];
  let saves = 0;
  const repository = {
    currentUser: () => ({ id: 'user-1' }),
    ensureProject: async () => ({ id: 'project-1' }),
    getWorkspaceDraft: async (_project, slot) => slot === 'workspace' ? { revision: 2, payload: cloudPayload, updatedAt: '2026-08-08T00:00:00Z' } : null,
    saveWorkspaceDraft: async () => { saves += 1; },
  };
  const sync = new WorkspaceSyncController(controllerOptions(repository, local, statuses));
  await sync.start({ packageId: 'scene_demo', name: 'Scene Demo' });
  assert.equal(saves, 0);
  assert.deepEqual(JSON.parse(local.getItem('pixel_engine_builder_workspace_scene_demo')), localPayload);
  assert.equal(statuses.some((entry) => entry.state === 'conflict'), true);
  sync.stop();
});


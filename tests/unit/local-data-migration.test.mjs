import test from 'node:test';
import assert from 'node:assert/strict';
import {
  importLocalBuilderData,
  scanLocalBuilderData,
  shouldOfferLocalMigration,
} from '../../builder/local-data-migration.js';

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

test('local migration finds cloud-worthy builder data but excludes player saves and handoffs', () => {
  const local = storage({
    pixel_engine_builder_workspace_scene_demo: JSON.stringify({ version: 2 }),
    pixel_engine_builder_assets_scene_demo: JSON.stringify({ schemaVersion: 1 }),
    pixel_engine_weapon_maker_draft_scene_demo: JSON.stringify({ projectId: 'scene_demo', weapon: { id: 'sword' } }),
    pixel_engine_save_scene_demo_slot_1: JSON.stringify({ player: {} }),
    pixel_engine_builder_map_bridge_handoff_v1: JSON.stringify({ temporary: true }),
    levelBuilderCustomTextureLibrary: JSON.stringify({ textures: [] }),
    pixel_engine_testing_level_library_v1: JSON.stringify({ version: 1, levels: [] }),
  });
  const scan = scanLocalBuilderData(local);
  assert.equal(scan.drafts.length, 3);
  assert.equal(scan.retainedKeys.includes('levelBuilderCustomTextureLibrary'), true);
  assert.equal(scan.drafts.some((entry) => entry.key.includes('save_scene_demo')), false);
  assert.equal(scan.drafts.some((entry) => entry.key.includes('handoff')), false);
});

test('migration imports drafts, prevents duplicates, and never deletes originals', async () => {
  const original = JSON.stringify({ version: 2, projectId: 'scene_demo', value: 1 });
  const local = storage({ pixel_engine_builder_workspace_scene_demo: original });
  const saved = [];
  const repository = {
    currentUser: () => ({ id: 'user-1' }),
    ensureProject: async () => ({ id: 'project-1' }),
    getWorkspaceDraft: async () => null,
    saveWorkspaceDraft: async (request) => { saved.push(request); return { revision: 1 }; },
    getTestingLevel: async () => null,
    saveTestingLevel: async () => ({}),
  };
  const report = await importLocalBuilderData({ storage: local, repository, userId: 'user-1' });
  assert.equal(report.imported, 1);
  assert.equal(report.failed, 0);
  assert.equal(local.getItem('pixel_engine_builder_workspace_scene_demo'), original);
  assert.equal(saved[0].stableEngineId, 'workspace');
  assert.equal(shouldOfferLocalMigration({ storage: local, userId: 'user-1' }).offer, false);
});

test('migration recognizes matching cloud drafts as duplicates without writing again', async () => {
  const original = JSON.stringify({ version: 2, projectId: 'scene_demo', value: 1 });
  const local = storage({ pixel_engine_builder_workspace_scene_demo: original });
  let writes = 0;
  const repository = {
    currentUser: () => ({ id: 'user-1' }),
    ensureProject: async () => ({ id: 'project-1' }),
    getWorkspaceDraft: async () => ({
      id: 'draft-1',
      stable_engine_id: 'workspace',
      payload: JSON.parse(original),
      revision: 1,
    }),
    saveWorkspaceDraft: async () => { writes += 1; },
    getTestingLevel: async () => null,
    saveTestingLevel: async () => ({}),
  };
  const report = await importLocalBuilderData({ storage: local, repository, userId: 'user-1' });
  assert.equal(report.duplicates, 1);
  assert.equal(report.imported, 0);
  assert.equal(writes, 0);
  assert.equal(local.getItem('pixel_engine_builder_workspace_scene_demo'), original);
});

test('failed migration keeps originals and remains eligible for retry', async () => {
  const original = JSON.stringify({ version: 2, projectId: 'scene_demo' });
  const local = storage({ pixel_engine_builder_workspace_scene_demo: original });
  const repository = {
    currentUser: () => ({ id: 'user-1' }),
    ensureProject: async () => { throw new Error('cloud unavailable'); },
  };
  const report = await importLocalBuilderData({ storage: local, repository, userId: 'user-1' });
  assert.equal(report.failed, 1);
  assert.equal(report.completed, false);
  assert.equal(local.getItem('pixel_engine_builder_workspace_scene_demo'), original);
  assert.equal(shouldOfferLocalMigration({ storage: local, userId: 'user-1' }).offer, true);
});

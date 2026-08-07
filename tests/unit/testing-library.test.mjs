import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectUsedCustomTextures,
  createTestingLevelEntry,
  deleteTestingLevel,
  findTestingLevel,
  normalizeTestingLibrary,
  normalizeTestingMap,
  upsertTestingLevel,
} from '../../builder/testing-library-model.js';

function map(overrides = {}) {
  return {
    width: 2,
    height: 2,
    mapType: 'level',
    mapId: 'test_room',
    mapName: 'Test Room',
    tileLayer: [
      ['floor_grass', 'custom_texture_brick'],
      ['wall_stone', 'floor_wood'],
    ],
    objectLayer: [
      ['player_start', 'none'],
      ['none', 'chest_common'],
    ],
    ...overrides,
  };
}

test('testing map normalization preserves builder layers', () => {
  const normalized = normalizeTestingMap(map());
  assert.equal(normalized.mapId, 'test_room');
  assert.equal(normalized.mapName, 'Test Room');
  assert.deepEqual(normalized.tileLayer[0], ['floor_grass', 'custom_texture_brick']);
  assert.deepEqual(normalized.objectLayer[1], ['none', 'chest_common']);
  assert.deepEqual(normalized.tiles, normalized.tileLayer);
});

test('testing map normalization rejects oversized or malformed maps', () => {
  assert.throws(() => normalizeTestingMap(map({ width: 201 })), /cannot exceed 200/i);
  assert.throws(() => normalizeTestingMap(map({ tileLayer: [['floor_grass']] })), /row count|column count/i);
});

test('testing library creates, updates, finds, and deletes a saved level', () => {
  const created = createTestingLevelEntry({
    map: map(),
    now: '2026-08-07T22:30:00.000Z',
  });
  let library = upsertTestingLevel(null, created);
  assert.equal(library.levels.length, 1);
  assert.equal(findTestingLevel(library, created.libraryId)?.name, 'Test Room');

  const updated = createTestingLevelEntry({
    map: map({ mapName: 'Updated Room' }),
    existing: created,
    now: '2026-08-07T22:31:00.000Z',
  });
  library = upsertTestingLevel(library, updated);
  assert.equal(library.levels.length, 1);
  assert.equal(library.levels[0].name, 'Updated Room');
  assert.equal(library.levels[0].createdAt, created.createdAt);

  library = deleteTestingLevel(library, created.libraryId);
  assert.equal(library.levels.length, 0);
});

test('corrupt saved levels are ignored without discarding valid entries', () => {
  const valid = createTestingLevelEntry({ map: map(), now: '2026-08-07T22:30:00.000Z' });
  const normalized = normalizeTestingLibrary({
    version: 1,
    levels: [
      valid,
      { libraryId: 'broken', map: { width: 2, height: 2, tileLayer: [] } },
    ],
  });
  assert.equal(normalized.levels.length, 1);
  assert.equal(normalized.levels[0].libraryId, valid.libraryId);
});

test('only custom textures actually used by a testing level are bundled', () => {
  const textures = collectUsedCustomTextures(map(), {
    textures: [
      { id: 'custom_texture_brick', name: 'Brick' },
      { id: 'custom_texture_unused', name: 'Unused' },
    ],
  });
  assert.deepEqual(textures.map((texture) => texture.id), ['custom_texture_brick']);
});

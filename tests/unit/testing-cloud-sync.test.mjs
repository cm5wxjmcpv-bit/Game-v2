import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeCloudTestingLevels } from '../../builder/testing-cloud-sync.js';

function entry(id, name, tile = 'floor') {
  return {
    libraryId: id,
    name,
    map: { width: 1, height: 1, mapType: 'level', mapId: id, mapName: name, tiles: [[tile]], tileLayer: [[tile]], objectLayer: [['none']] },
    textures: [],
    createdAt: '2026-08-08T00:00:00Z',
    updatedAt: '2026-08-08T00:00:00Z',
  };
}

test('cloud Testing Space adds missing maps without removing local maps', () => {
  const local = { version: 1, levels: [entry('local-map', 'Local Map')] };
  const result = mergeCloudTestingLevels(local, [{ id: 'row-1', payload: entry('cloud-map', 'Cloud Map'), revision: 1 }]);
  assert.deepEqual(result.library.levels.map((level) => level.libraryId).sort(), ['cloud-map', 'local-map']);
  assert.equal(result.added, 1);
  assert.equal(result.conflicts.length, 0);
});

test('cloud Testing Space reports divergent copies and preserves the local original', () => {
  const localEntry = entry('shared-map', 'Local Version', 'local-tile');
  const cloudEntry = entry('shared-map', 'Cloud Version', 'cloud-tile');
  const result = mergeCloudTestingLevels({ version: 1, levels: [localEntry] }, [{ id: 'row-1', payload: cloudEntry, revision: 2 }]);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.library.levels[0].name, 'Local Version');
  assert.equal(result.conflicts[0].cloud.name, 'Cloud Version');
});


import assert from 'node:assert/strict';
import test from 'node:test';

import {
  editorTileSelection,
  normalizePackageTiles,
  packageTileRows,
  setEditorTileSelection,
  usedSceneTileIds,
} from '../../builder/package-tile-model.js';

const packageTiles = [
  { id: 'scene_floor', name: 'Floor', walkable: true, color: '#64748b' },
  { id: 'scene_wall', name: 'Wall', walkable: false, color: '#1e293b' },
  { id: 'scene_accent', name: 'Accent', walkable: true, color: '#c084fc' },
];

function scene() {
  return {
    id: 'scene_lab',
    width: 3,
    height: 2,
    tiles: [
      ['scene_wall', 'scene_wall', 'scene_wall'],
      ['scene_wall', 'scene_floor', 'scene_wall'],
    ],
  };
}

test('tile payloads resolve texture colors and fall back safely', () => {
  const tiles = normalizePackageTiles({
    tiles: [
      { id: 'floor', name: 'Floor', texture: 'floor_texture', walkable: true },
      { id: 'wall', texture: 'missing_texture', walkable: false, minimapColor: '#112233' },
      { id: 'floor', texture: 'duplicate' },
    ],
  }, {
    textures: [{ id: 'floor_texture', color: '#ABCDEF' }],
  });
  assert.deepEqual(tiles.map((tile) => tile.id), ['floor', 'wall']);
  assert.equal(tiles[0].color, '#abcdef');
  assert.equal(tiles[1].color, '#112233');
  assert.equal(tiles[1].walkable, false);
});

test('used scene tiles are always enabled and unknown selections are discarded', () => {
  const value = scene();
  value._workspaceEditorTileIds = ['scene_accent', 'not_registered'];
  assert.deepEqual(usedSceneTileIds(value).sort(), ['scene_floor', 'scene_wall']);
  assert.deepEqual(editorTileSelection(value, packageTiles).sort(), ['scene_accent', 'scene_floor', 'scene_wall']);
});

test('editor tile permissions are workspace-only and do not mutate the source scene', () => {
  const source = scene();
  const next = setEditorTileSelection(source, ['scene_accent'], packageTiles);
  assert.equal(source._workspaceEditorTileIds, undefined);
  assert.deepEqual(next._workspaceEditorTileIds.sort(), ['scene_accent', 'scene_floor', 'scene_wall']);
  const rows = packageTileRows(next, packageTiles);
  assert.equal(rows.find((tile) => tile.id === 'scene_accent').enabled, true);
  assert.equal(rows.find((tile) => tile.id === 'scene_accent').used, false);
  assert.equal(rows.find((tile) => tile.id === 'scene_wall').used, true);
});

test('resetting to used tiles removes unused editor permissions', () => {
  const source = setEditorTileSelection(scene(), ['scene_accent'], packageTiles);
  const reset = setEditorTileSelection(source, usedSceneTileIds(source), packageTiles);
  assert.deepEqual(reset._workspaceEditorTileIds.sort(), ['scene_floor', 'scene_wall']);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildWorkspaceAssetFileChanges,
  mergeWorkspaceAssetDraft,
  normalizeWorkspaceTextureAsset,
  packageTextureEntryFromAsset,
  packageTileEntryFromAsset,
} from '../../builder/workspace-asset-model.js';

function textureAsset(overrides = {}) {
  return {
    id: 'custom_texture_crimson_floor',
    name: 'Crimson Floor',
    size: 16,
    pixels: Array.from({ length: 16 }, () => Array.from({ length: 16 }, () => ({ color: '#aa1122', alpha: 1 }))),
    previewColor: '#aa1122',
    image: 'data:image/png;base64,AAAA',
    walkable: true,
    updatedAt: '2026-07-30T12:00:00.000Z',
    ...overrides,
  };
}

test('workspace texture assets normalize and register matching tile and texture IDs', () => {
  const asset = normalizeWorkspaceTextureAsset(textureAsset());
  assert.equal(asset.id, 'custom_texture_crimson_floor');
  assert.equal(asset.pixels.length, 16);

  const texture = packageTextureEntryFromAsset(asset);
  const tile = packageTileEntryFromAsset(asset);
  assert.equal(texture.id, asset.id);
  assert.equal(texture.image, 'data:image/png;base64,AAAA');
  assert.deepEqual(texture.builderPixels, asset.pixels);
  assert.equal(tile.id, asset.id);
  assert.equal(tile.texture, asset.id);
  assert.equal(tile.walkable, true);
});

test('asset drafts replace matching texture IDs without duplicating them', () => {
  const first = textureAsset({ name: 'First' });
  const replacement = textureAsset({ name: 'Replacement', previewColor: '#bb2233' });
  const merged = mergeWorkspaceAssetDraft('scene-demo', { projectId: 'scene-demo', textures: [first] }, [replacement]);
  assert.equal(merged.textures.length, 1);
  assert.equal(merged.textures[0].name, 'Replacement');
  assert.equal(merged.textures[0].previewColor, '#bb2233');
});

test('tiles and textures sharing one package file produce one merged update', () => {
  const core = {
    tiles: [{ id: 'scene_floor', texture: 'scene_floor', walkable: true }],
    textures: [{ id: 'scene_floor', color: '#64748b' }],
    effects: [],
  };
  const changes = buildWorkspaceAssetFileChanges({
    assetDraft: { projectId: 'scene-demo', textures: [textureAsset()] },
    tilesSource: { path: 'games/scene-demo/data/core.json', payload: core },
    texturesSource: { path: 'games/scene-demo/data/core.json', payload: core },
  });

  assert.equal(changes.length, 1);
  assert.equal(changes[0].path, 'games/scene-demo/data/core.json');
  assert.equal(changes[0].currentPayload.tiles.at(-1).id, 'custom_texture_crimson_floor');
  assert.equal(changes[0].currentPayload.textures.at(-1).id, 'custom_texture_crimson_floor');
  assert.equal(changes[0].baselinePayload.tiles.length, 1);
  assert.equal(changes[0].baselinePayload.textures.length, 1);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAP_BRIDGE_SCHEMA_VERSION,
  applyMapBridgeResultToDraft,
  buildBridgeTextureEntries,
  createMapBridgeHandoff,
  mergeMapBridgeResult,
  validateMapBridgeHandoff,
} from '../../builder/map-bridge-model.js';

function demoScene() {
  return {
    id: 'scene_lab',
    name: 'Generic Scene Lab',
    scene: { mode: 'neutral', systems: { combat: false } },
    width: 4,
    height: 3,
    tiles: [
      ['scene_wall', 'scene_wall', 'scene_wall', 'scene_wall'],
      ['scene_wall', 'scene_floor', 'scene_floor', 'scene_wall'],
      ['scene_wall', 'scene_wall', 'scene_wall', 'scene_wall'],
    ],
    objects: {
      portals: [{ x: 2, y: 1, targetScene: 'next_room' }],
      shops: [], fountains: [], enemySpawns: [], battleTriggers: [],
    },
    entities: [{ id: 'beacon', type: 'prop', x: 1, y: 1, components: { interaction: { action: 'message', message: 'Hello' } } }],
    spawn: { x: 1, y: 1 },
    customMetadata: { preserve: true },
  };
}

function rawResult(handoff, overrides = {}) {
  return {
    width: handoff.editorMap.width,
    height: handoff.editorMap.height,
    mapType: handoff.editorMap.mapType,
    mapId: handoff.sceneId,
    mapName: 'Edited Scene Lab',
    tileLayer: handoff.editorMap.tileLayer.map((row) => [...row]),
    objectLayer: handoff.editorMap.objectLayer.map((row) => [...row]),
    ...overrides,
  };
}

test('package-specific tile IDs use reversible custom-texture aliases', () => {
  const handoff = createMapBridgeHandoff({ projectId: 'scene-demo', scene: demoScene(), sceneKind: 'scene', returnUrl: '/builder/workspace.html' });
  assert.equal(handoff.schemaVersion, MAP_BRIDGE_SCHEMA_VERSION);
  assert.equal(handoff.editorMap.tileLayer[0][0], 'custom_texture_bridge_1');
  assert.equal(handoff.tileAliases.custom_texture_bridge_1, 'scene_wall');
  assert.equal(handoff.tileAliases.custom_texture_bridge_2, 'scene_floor');
  assert.deepEqual(handoff.editorMap.objectLayer[1][1], 'player_start');
  const entries = buildBridgeTextureEntries(handoff);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].pixels.length, 16);
  assert.equal(entries[0].pixels[0].length, 16);
});

test('map result updates layout fields while preserving scene systems, objects, entities, and unknown metadata', () => {
  const original = demoScene();
  const handoff = createMapBridgeHandoff({ projectId: 'scene-demo', scene: original, sceneKind: 'scene', returnUrl: '/builder/workspace.html' });
  const result = rawResult(handoff);
  result.tileLayer[1][2] = handoff.editorMap.tileLayer[0][0];
  result.objectLayer[1][1] = 'none';
  result.objectLayer[1][2] = 'player_start';
  const merged = mergeMapBridgeResult(handoff, result);
  assert.equal(merged.name, 'Edited Scene Lab');
  assert.equal(merged.tiles[1][2], 'scene_wall');
  assert.deepEqual(merged.spawn, { x: 2, y: 1 });
  assert.deepEqual(merged.objects, original.objects);
  assert.deepEqual(merged.entities, original.entities);
  assert.deepEqual(merged.scene, original.scene);
  assert.deepEqual(merged.customMetadata, { preserve: true });
});

test('map result requires exactly one player spawn', () => {
  const handoff = createMapBridgeHandoff({ projectId: 'scene-demo', scene: demoScene(), sceneKind: 'scene', returnUrl: '/builder/workspace.html' });
  const missing = rawResult(handoff);
  missing.objectLayer = missing.objectLayer.map((row) => row.map(() => 'none'));
  assert.throws(() => mergeMapBridgeResult(handoff, missing), /Place one Player Start/i);

  const duplicate = rawResult(handoff);
  duplicate.objectLayer[1][2] = 'player_start';
  assert.throws(() => mergeMapBridgeResult(handoff, duplicate), /more than one player spawn/i);
});

test('destructive resize is rejected when preserved content would be outside the new map', () => {
  const handoff = createMapBridgeHandoff({ projectId: 'scene-demo', scene: demoScene(), sceneKind: 'scene', returnUrl: '/builder/workspace.html' });
  const result = rawResult(handoff, {
    width: 2,
    height: 2,
    tileLayer: [
      [handoff.editorMap.tileLayer[0][0], handoff.editorMap.tileLayer[0][1]],
      [handoff.editorMap.tileLayer[1][0], handoff.editorMap.tileLayer[1][1]],
    ],
    objectLayer: [['none', 'none'], ['none', 'player_start']],
  });
  assert.throws(() => mergeMapBridgeResult(handoff, result), /outside its bounds/i);
});

test('handoff and draft result enforce project and scene identity', () => {
  const handoff = createMapBridgeHandoff({ projectId: 'scene-demo', scene: demoScene(), sceneKind: 'scene', returnUrl: '/builder/workspace.html' });
  assert.equal(validateMapBridgeHandoff(handoff).sceneId, 'scene_lab');
  assert.throws(() => validateMapBridgeHandoff({ ...handoff, sceneId: 'wrong_scene' }), /identity/i);

  const merged = mergeMapBridgeResult(handoff, rawResult(handoff));
  const result = { schemaVersion: MAP_BRIDGE_SCHEMA_VERSION, projectId: 'scene-demo', sceneId: 'scene_lab', scene: merged };
  const draft = { version: 1, projectId: 'scene-demo', actors: [], scenes: [demoScene()] };
  const next = applyMapBridgeResultToDraft(draft, result);
  assert.equal(next.scenes[0].name, 'Edited Scene Lab');
  assert.notEqual(next, draft);
  assert.throws(() => applyMapBridgeResultToDraft({ ...draft, projectId: 'other-game' }, result), /different project/i);
});

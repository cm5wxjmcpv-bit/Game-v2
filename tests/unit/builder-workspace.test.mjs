import assert from 'node:assert/strict';
import test from 'node:test';

import {
  legacyClassToActor,
  mergeActors,
  normalizeActor,
  normalizeEntity,
  normalizeScene,
  removeById,
  upsertById,
  validateActor,
  validateEntity,
} from '../../builder/workspace-model.js';

test('legacy classes become editable package actors', () => {
  const actor = legacyClassToActor({
    id: 'warrior',
    name: 'Warrior',
    stats: { maxHp: 24, attack: 5, defense: 3, agility: 2 },
    movement: { base: 4 },
    bagSlots: 12,
    growth: { maxHp: 2 },
    startingGear: { weapon: 'sword', armor: null },
  });
  assert.equal(actor.id, 'warrior');
  assert.equal(actor.components.movement.speed, 4);
  assert.equal(actor.components.health.max, 24);
  assert.equal(actor.components.inventory.slots, 12);
  assert.equal(actor.components.equipment.starting.weapon, 'sword');
});

test('direct actors replace matching converted legacy actors', () => {
  const actors = mergeActors([
    { id: 'explorer', name: 'Legacy', stats: { maxHp: 10 }, movement: { base: 2 }, bagSlots: 1 },
  ], [
    { id: 'explorer', name: 'Direct', components: { movement: { speed: 5 }, health: { max: 15 } } },
  ]);
  assert.equal(actors.length, 1);
  assert.equal(actors[0].name, 'Direct');
  assert.equal(actors[0].components.movement.speed, 5);
});

test('actor normalization supplies safe visual and inventory defaults', () => {
  const actor = normalizeActor({ id: 'pilot', name: 'Pilot', components: { health: { max: 8 } } });
  assert.equal(actor.components.inventory.slots, 0);
  assert.equal(actor.components.inventory.maxStack, 99);
  assert.equal(actor.components.render.fallback.shape, 'square');
  assert.deepEqual(validateActor(actor), []);
});

test('scene and entity normalization preserve engine map compatibility', () => {
  const scene = normalizeScene({
    id: 'lab',
    width: 3,
    height: 2,
    tiles: [['floor', 'floor', 'wall'], ['floor']],
    spawn: { x: 1, y: 1 },
    objects: { portals: [{ x: 2, y: 1, targetScene: 'exit' }] },
    entities: [{ id: 'beacon', type: 'sign', x: 1, y: 0, components: { interaction: { action: 'message', message: 'Hello' } } }],
  });
  assert.equal(scene.tiles[1].length, 3);
  assert.equal(scene.objects.portals.length, 1);
  assert.equal(scene.entities[0].components.interaction.message, 'Hello');
  assert.deepEqual(validateEntity(scene.entities[0], scene), []);
});

test('workspace normalization preserves forward-compatible metadata', () => {
  const actor = normalizeActor({
    id: 'pilot',
    name: 'Pilot',
    components: {
      movement: { speed: 4, acceleration: 0.5 },
      health: { max: 12, regeneration: 1 },
      render: { fallback: { shape: 'circle', color: '#123456', size: 18, outline: '#ffffff' } },
      dialogue: { voice: 'calm' },
    },
  });
  assert.equal(actor.components.movement.acceleration, 0.5);
  assert.equal(actor.components.health.regeneration, 1);
  assert.equal(actor.components.render.fallback.outline, '#ffffff');
  assert.deepEqual(actor.components.dialogue, { voice: 'calm' });

  const entity = normalizeEntity({
    id: 'beacon',
    type: 'sign',
    x: 1,
    y: 1,
    persistence: { once: true },
    components: {
      render: { shape: 'diamond', color: '#abcdef', size: 14, zIndex: 3 },
      interaction: { action: 'message', message: 'Hello', range: 1, prompt: 'Read' },
      collision: { solid: false, radius: 0.4, layer: 'props' },
      quest: { id: 'welcome' },
    },
  });
  assert.deepEqual(entity.persistence, { once: true });
  assert.equal(entity.components.render.zIndex, 3);
  assert.equal(entity.components.interaction.prompt, 'Read');
  assert.equal(entity.components.collision.layer, 'props');
  assert.deepEqual(entity.components.quest, { id: 'welcome' });

  const scene = normalizeScene({
    id: 'lab',
    width: 2,
    height: 2,
    tiles: [['floor', 'floor'], ['floor', 'floor']],
    spawn: { x: 1, y: 1, facing: 'left' },
    objects: {
      portals: [],
      weatherZones: [{ x: 0, y: 0, kind: 'rain' }],
      packageMetadata: { author: 'test' },
    },
  });
  assert.equal(scene.spawn.facing, 'left');
  assert.deepEqual(scene.objects.weatherZones, [{ x: 0, y: 0, kind: 'rain' }]);
  assert.deepEqual(scene.objects.packageMetadata, { author: 'test' });
});

test('entity validation rejects invalid placement and incomplete actions', () => {
  const scene = normalizeScene({ id: 'small', width: 2, height: 2, tiles: [['a', 'a'], ['a', 'a']] });
  const entity = normalizeEntity({ id: 'door', type: 'door', x: 3, y: 0, components: { interaction: { action: 'scene' } } });
  const errors = validateEntity(entity, scene);
  assert.ok(errors.some((message) => message.includes('inside')));
  assert.ok(errors.some((message) => message.includes('target scene')));
});

test('workspace list helpers upsert and remove by stable ID', () => {
  const first = upsertById([], { id: 'one', name: 'First' });
  const replaced = upsertById(first, { id: 'one', name: 'Updated' });
  assert.deepEqual(replaced, [{ id: 'one', name: 'Updated' }]);
  assert.deepEqual(removeById(replaced, 'one'), []);
});

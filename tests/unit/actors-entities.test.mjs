import assert from 'node:assert/strict';
import test from 'node:test';

import {
  actorFromLegacyClass,
  buildActorRegistry,
  normalizeActorDefinition,
} from '../../src/actorRuntime.js';
import { createPlayer } from '../../src/entityFactory.js';
import {
  findNearbyInteractiveEntity,
  isBlockedBySceneEntity,
  normalizeSceneEntities,
} from '../../src/sceneEntityRuntime.js';

test('legacy classes normalize into package actors', () => {
  const actor = actorFromLegacyClass({
    id: 'warrior',
    name: 'Warrior',
    stats: { maxHp: 20, attack: 4, defense: 3, agility: 2 },
    growth: { maxHp: 2 },
    startingGear: { weapon: 'sword', armor: 'mail' },
    movement: { base: 3.5 },
    bagSlots: 8,
  });

  assert.equal(actor.id, 'warrior');
  assert.equal(actor.legacyClassId, 'warrior');
  assert.equal(actor.components.health.max, 20);
  assert.equal(actor.components.movement.speed, 3.5);
  assert.equal(actor.components.equipment.starting.weapon, 'sword');
  assert.equal(actor.components.render.sprite.imagePath, 'assets/characters/Warrior_Blue.png');
});

test('direct actors override matching legacy actor ids', () => {
  const registry = buildActorRegistry([
    {
      id: 'actor',
      name: 'Legacy Actor',
      stats: { maxHp: 10, attack: 1, defense: 1, agility: 1 },
      movement: { base: 3 },
      startingGear: {},
      growth: {},
      bagSlots: 1,
    },
  ], [
    {
      id: 'actor',
      name: 'Direct Actor',
      components: {
        movement: { speed: 4 },
        health: { max: 14 },
        render: { fallback: { shape: 'circle', color: '#123456', size: 16 } },
      },
    },
  ]);

  assert.equal(Object.keys(registry).length, 1);
  assert.equal(registry.actor.name, 'Direct Actor');
  assert.equal(registry.actor.legacyClassId, null);
  assert.equal(registry.actor.components.health.max, 14);
});

test('direct actor creates a playable compatibility player without a class', () => {
  const actor = normalizeActorDefinition({
    id: 'explorer',
    name: 'Explorer',
    components: {
      movement: { speed: 2.5 },
      health: { max: 12 },
      wallet: { starting: 7 },
      inventory: { slots: 0 },
      render: { fallback: { shape: 'circle', color: '#38bdf8', size: 20 } },
    },
  });
  const player = createPlayer(actor, {}, { gold: 100 });

  assert.equal(player.actorId, 'explorer');
  assert.equal(player.classId, null);
  assert.equal(player.stats.hp, 12);
  assert.equal(player.gold, 7);
  assert.equal(player.bag.slots, 0);
  assert.equal(player.animation.sprite, null);
  assert.equal(player.visual.shape, 'circle');
});

test('component entities normalize, interact, and block when solid', () => {
  const entities = normalizeSceneEntities([
    {
      id: 'sign',
      x: 1,
      y: 2,
      components: {
        interaction: { message: 'Hello', range: 1.1 },
      },
    },
    {
      id: 'crate',
      x: 3,
      y: 2,
      components: {
        collision: { solid: true, radius: 0.5 },
      },
    },
  ]);

  assert.equal(entities.length, 2);
  assert.equal(findNearbyInteractiveEntity({ x: 1, y: 1 }, entities).id, 'sign');
  assert.equal(isBlockedBySceneEntity(3.1, 2, entities), true);
  assert.equal(isBlockedBySceneEntity(2, 2, entities), false);
});

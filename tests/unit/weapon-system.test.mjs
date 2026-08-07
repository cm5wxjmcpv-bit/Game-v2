import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateWeaponDamage,
  canEquipWeapon,
  canPayAttackCost,
  normalizeWeaponDefinition,
  payAttackCost,
  updateWeaponTimers,
} from '../../src/weaponSystem.js';
import { addItemToBagDetailed } from '../../src/inventory.js';

const bow = normalizeWeaponDefinition({
  id: 'test_bow', name: 'Test Bow', category: 'weapons', equipSlot: 'weapon', rarity: 'rare',
  weapon: {
    family: 'ranged', subtype: 'bow', damageType: 'physical',
    restrictions: { mode: 'tags', tags: ['archer'] },
    normalAttack: { power: 6, range: 5, cooldown: 1, requiresReload: true, reloadTime: 2, resource: { type: 'ammo', itemId: 'arrows', cost: 1 } },
    specialAttack: { enabled: true, preset: 'rapid', power: 4, cooldown: 3, resource: { type: 'mana', cost: 2 } },
  },
});

function player() {
  return {
    actorId: 'hero', components: { tags: ['archer'] }, stats: { attack: 5 },
    bag: { slots: 6, maxStack: 99, items: [{ itemId: 'arrows', count: 2 }] },
    resources: { mana: { max: 10, current: 4, regenPerSecond: 1 } },
    cooldowns: { autoAttack: 1, specialAttack: 2, reload: 1 },
  };
}

test('weapon normalization preserves distinct family attacks, reload, resources, and future schema', () => {
  assert.equal(bow.weapon.family, 'ranged');
  assert.equal(bow.weapon.subtype, 'bow');
  assert.equal(bow.weapon.animationTemplate, 'bow-shot');
  assert.equal(bow.weapon.normalAttack.requiresReload, true);
  assert.deepEqual(bow.weapon.normalAttack.resource, { type: 'ammo', itemId: 'arrows', cost: 1 });
  assert.equal(bow.weapon.specialAttack.hitCount, 3);
  assert.equal(bow.weapon.futureProgression.enabled, false);
});

test('weapon restrictions support actor tags and attack costs consume ammo or mana', () => {
  const actor = player();
  assert.deepEqual(canEquipWeapon(actor, bow), { ok: true });
  assert.deepEqual(canEquipWeapon({ ...actor, components: { tags: ['mage'] } }, bow), { ok: false, reason: 'This character does not have a required weapon tag.' });
  assert.deepEqual(canPayAttackCost(actor, bow.weapon.normalAttack), { ok: true });
  assert.deepEqual(payAttackCost(actor, bow.weapon.normalAttack), { ok: true });
  assert.equal(actor.bag.items[0].count, 1);
  payAttackCost(actor, bow.weapon.specialAttack);
  assert.equal(actor.resources.mana.current, 2);
});

test('the game-wide formula combines character and weapon power with resistances', () => {
  const damage = calculateWeaponDamage({
    player: player(), item: bow, attack: bow.weapon.normalAttack,
    target: { template: { stats: { defense: 2 }, resistances: { physical: 0.25 } } },
    settings: { weapons: { damageFormula: { characterAttackWeight: 1, weaponPowerWeight: 1, defenseWeight: 1 } } },
  });
  assert.equal(damage, 6);
});

test('mana regenerates faster in safe scenes and cooldowns tick independently', () => {
  const actor = player();
  updateWeaponTimers(actor, 1, { weapons: { mana: { safeAreaMultiplier: 5 } } }, { safeScene: true });
  assert.equal(actor.resources.mana.current, 9);
  assert.deepEqual(actor.cooldowns, { autoAttack: 0, specialAttack: 1, reload: 0 });
});

test('matching non-weapons stack while duplicate weapons remain separate instances', () => {
  const actor = { bag: { slots: 4, maxStack: 99, items: [] } };
  const items = { arrows: { id: 'arrows', category: 'ammo' }, test_bow: bow };
  assert.equal(addItemToBagDetailed(actor, 'arrows', 20, items).ok, true);
  assert.equal(addItemToBagDetailed(actor, 'test_bow', 2, items).ok, true);
  assert.equal(actor.bag.items.length, 3);
  assert.equal(actor.bag.items[0].count, 20);
  assert.notEqual(actor.bag.items[1].instanceId, actor.bag.items[2].instanceId);
});

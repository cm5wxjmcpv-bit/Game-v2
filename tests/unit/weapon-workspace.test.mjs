import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyWeaponAvailability,
  cloneWeaponDefinition,
  createWeaponDefinition,
  exportWeaponPack,
  importWeaponPack,
  scanWeaponReferences,
  validateWeaponDefinition,
} from '../../builder/weapon-workspace-model.js';

test('family presets create usable distinct weapons and cloning assigns a safe ID', () => {
  const bow = createWeaponDefinition({ family: 'ranged', subtype: 'bow', id: 'hunter_bow', name: 'Hunter Bow' });
  assert.equal(bow.weapon.family, 'ranged');
  assert.equal(bow.weapon.normalAttack.resource.type, 'ammo');
  assert.equal(validateWeaponDefinition(bow).errors.length, 0);
  const clone = cloneWeaponDefinition(bow, ['hunter_bow', 'hunter_bow_copy']);
  assert.equal(clone.id, 'hunter_bow_copy_2');
});

test('availability choices automatically map a weapon to starting equipment, shops, loot, and a reward tier', () => {
  const workspace = {
    actors: [{ id: 'hero', name: 'Hero', components: { equipment: { starting: {} } } }],
    shopPayload: { catalogs: [{ id: 'weapons', stock: [] }], shops: [] },
    lootTables: [{ id: 'hard_enemies', entries: [{ id: 'none', rewards: [] }] }],
    completionRewards: [{ id: 'level_one_rewards', tiers: [{ rewards: [] }, { rewards: [] }, { rewards: [] }] }],
    rewardPackages: [],
  };
  applyWeaponAvailability(workspace, 'hunter_bow', { actorId: 'hero', catalogId: 'weapons', lootTableId: 'hard_enemies', completionRewardId: 'level_one_rewards', completionTier: 2 });
  assert.equal(workspace.actors[0].components.equipment.starting.weapon, 'hunter_bow');
  assert.equal(workspace.shopPayload.catalogs[0].stock[0].itemId, 'hunter_bow');
  assert.equal(workspace.lootTables[0].entries[1].rewards[0].itemId, 'hunter_bow');
  assert.equal(workspace.completionRewards[0].tiers[1].rewards[0].itemId, 'hunter_bow');
  assert.equal(scanWeaponReferences('hunter_bow', workspace).length, 4);
});

test('complete weapon packs preserve settings, artwork, and linked content', () => {
  const weapon = createWeaponDefinition({ family: 'magic', subtype: 'staff', id: 'sun_staff', name: 'Sun Staff' });
  weapon.weapon.art.icon.src = 'data:image/png;base64,AAAA';
  const workspace = { actors: [], shopPayload: { catalogs: [], shops: [] }, lootTables: [], rewardPackages: [], completionRewards: [] };
  const pack = exportWeaponPack(weapon, workspace);
  const imported = importWeaponPack(pack);
  assert.equal(imported.weapon.id, 'sun_staff');
  assert.equal(imported.weapon.weapon.art.icon.src, 'data:image/png;base64,AAAA');
  assert.equal(imported.weapon.weapon.futureProgression.enabled, false);
});

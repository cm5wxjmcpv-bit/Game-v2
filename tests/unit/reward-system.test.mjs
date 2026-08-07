import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canFitRewardPackage,
  grantRewardPackage,
  rollEnemyReward,
  rollLootTable,
  selectCompletionReward,
} from '../../src/rewardSystem.js';
import { normalizeWeaponDefinition } from '../../src/weaponSystem.js';

const sword = normalizeWeaponDefinition({ id: 'sword', name: 'Sword', category: 'weapons', equipSlot: 'weapon' });
const items = { sword, potion: { id: 'potion', name: 'Potion', category: 'consumables' } };

test('equal-chance loot tables select exactly one complete package including No Reward', () => {
  const table = { id: 'enemy_loot', entries: [
    { id: 'none', name: 'No Reward', rewards: [] },
    { id: 'mixed', rewards: [{ type: 'currency', amount: 10 }, { type: 'item', itemId: 'sword', count: 1 }] },
  ] };
  assert.equal(rollLootTable(table, () => 0).id, 'none');
  const selected = rollEnemyReward({ lootTableId: 'enemy_loot' }, { enemy_loot: table }, () => 0.99);
  assert.equal(selected.id, 'mixed');
  assert.equal(selected.rewards.length, 2);
});

test('reward grants are inventory-aware and preserve overflow for replacement UI', () => {
  const player = { gold: 0, bag: { slots: 1, maxStack: 99, items: [{ itemId: 'potion', count: 2 }] } };
  const reward = { id: 'win', rewards: [{ type: 'currency', amount: 25 }, { type: 'item', itemId: 'sword', count: 1 }] };
  assert.equal(canFitRewardPackage(player, reward, items), false);
  const result = grantRewardPackage(player, reward, items);
  assert.equal(player.gold, 25);
  assert.equal(result.ok, false);
  assert.deepEqual(result.overflow, [{ type: 'item', itemId: 'sword', count: 1 }]);
});

test('completion schedules use first, second, then third-and-later rewards', () => {
  const schedule = { id: 'level:one', source: { type: 'level', id: 'one' }, tiers: [
    { id: 'first', rewards: [{ type: 'currency', amount: 100 }] },
    { id: 'second', rewards: [{ type: 'currency', amount: 50 }] },
    { id: 'later', rewards: [{ type: 'currency', amount: 10 }] },
  ] };
  assert.equal(selectCompletionReward(schedule, 0).package.id, 'first');
  assert.equal(selectCompletionReward(schedule, 1).package.id, 'second');
  assert.equal(selectCompletionReward(schedule, 2).package.id, 'later');
  assert.equal(selectCompletionReward(schedule, 99).package.id, 'later');
});

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getNearbyPortal,
  getPortalArrival,
  getPortalLockReason,
  getPortalTarget,
  getPortalTrigger,
  getUnlockedPortalLevels,
} from '../../src/portalSystem.js';

const player = {
  x: 1,
  y: 1,
  unlocks: { levels: ['level_open'], towns: ['town_open'] },
  completedLevels: ['level_done'],
};

test('legacy portals remain interact portals at the legacy range', () => {
  const map = { objects: { portals: [{ x: 2, y: 1, targetTown: 'town_open' }] } };
  assert.equal(getPortalTrigger(map.objects.portals[0]), 'interact');
  assert.equal(getNearbyPortal(player, map)?.targetTown, 'town_open');
  assert.equal(getNearbyPortal(player, map, { trigger: 'touch' }), null);
});

test('touch portals are filtered independently and honor configured range', () => {
  const map = { objects: { portals: [
    { id: 'touch_gate', x: 1.4, y: 1, trigger: 'touch', range: 0.5, targetScene: 'scene_b' },
    { id: 'interact_gate', x: 1, y: 1, targetScene: 'scene_c' },
  ] } };
  assert.equal(getNearbyPortal(player, map, { trigger: 'touch' })?.id, 'touch_gate');
  assert.equal(getNearbyPortal(player, map, { trigger: 'interact' })?.id, 'interact_gate');
});

test('portal lock rules use existing progression state', () => {
  assert.equal(getPortalLockReason(player, { requirement: { type: 'level_unlocked', id: 'level_open' } }), null);
  assert.equal(getPortalLockReason(player, { requirement: { type: 'town_unlocked', id: 'town_open' } }), null);
  assert.equal(getPortalLockReason(player, { requirement: { type: 'level_completed', id: 'level_done' } }), null);
  assert.equal(
    getPortalLockReason(player, { requirement: { type: 'level_completed', id: 'level_missing', message: 'Beat the ruins first.' } }),
    'Beat the ruins first.',
  );
});

test('new and legacy destination fields resolve without breaking old maps', () => {
  assert.deepEqual(getPortalTarget({ targetScene: 'scene_a' }), { type: 'scene', id: 'scene_a' });
  assert.deepEqual(getPortalTarget({ targetTown: 'town_a' }), { type: 'town', id: 'town_a' });
  assert.deepEqual(getPortalTarget({ targetLevel: 'level_a' }), { type: 'level', id: 'level_a' });
  assert.equal(getPortalTarget({ levels: ['level_a'] }), null);
});

test('exact arrival and legacy level selector helpers remain safe', () => {
  assert.deepEqual(getPortalArrival({ arrival: { x: 3, y: 4 } }), { x: 3, y: 4 });
  assert.equal(getPortalArrival({}), null);
  assert.deepEqual(getUnlockedPortalLevels(player, { levels: ['level_open', 'level_closed'] }), ['level_open']);
  assert.deepEqual(getUnlockedPortalLevels(player, {}), []);
});

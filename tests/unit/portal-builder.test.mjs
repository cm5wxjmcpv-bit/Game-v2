import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyPortalLink,
  deletePortalLink,
  normalizePortal,
  validatePortal,
} from '../../builder/portal-builder-model.js';

function scene(id, kind = 'town', width = 5, height = 5) {
  return {
    id,
    name: id,
    mapType: kind,
    width,
    height,
    tiles: Array.from({ length: height }, () => Array.from({ length: width }, () => 'floor_grass_a')),
    objects: { portals: [], shops: [], fountains: [], enemySpawns: [], battleTriggers: [] },
    spawn: { x: 1, y: 1 },
  };
}

test('legacy portals normalize without losing their destination behavior', () => {
  const portal = normalizePortal({ x: 2, y: 3, targetTown: 'harbor_town' }, 0);
  assert.equal(portal.id, 'portal_1');
  assert.equal(portal.targetScene, 'harbor_town');
  assert.equal(portal.trigger, 'interact');
  assert.equal(portal.appearance.mode, 'style');
  assert.equal(portal.appearance.shape, 'square');
  assert.equal(portal.appearance.color, '#8d7bff');
  assert.equal(portal.appearance.size, 24);
});

test('portal validation checks destination and exact arrival bounds', () => {
  const scenes = [scene('town_a'), scene('level_b', 'level', 3, 3)];
  const valid = normalizePortal({ id: 'gate', x: 2, y: 2, targetScene: 'level_b', arrival: { x: 1, y: 2 } });
  assert.deepEqual(validatePortal(valid, scenes[0], scenes), []);

  const invalid = normalizePortal({ id: 'gate', x: 2, y: 2, targetScene: 'level_b', arrival: { x: 9, y: 2 } });
  assert.match(validatePortal(invalid, scenes[0], scenes).join(' '), /arrival position/i);
});

test('appearance can use a custom texture or direct image path', () => {
  const texturePortal = normalizePortal({
    id: 'blue_gate', x: 1, y: 1, targetScene: 'town_b', arrival: { x: 1, y: 1 },
    appearance: { mode: 'texture', textureId: 'custom_texture_blue_gate', size: 32 },
  });
  assert.equal(texturePortal.appearance.mode, 'texture');
  assert.equal(texturePortal.appearance.textureId, 'custom_texture_blue_gate');
  assert.equal(texturePortal.appearance.size, 32);

  const imagePortal = normalizePortal({
    id: 'door', x: 1, y: 1, targetScene: 'town_b', arrival: { x: 1, y: 1 },
    appearance: { mode: 'image', imagePath: 'assets/portals/door.png', shape: 'ring' },
  });
  assert.equal(imagePortal.appearance.mode, 'image');
  assert.equal(imagePortal.appearance.imagePath, 'assets/portals/door.png');
  assert.equal(imagePortal.appearance.shape, 'ring');
});

test('two-way link creates a paired return portal with matching arrival', () => {
  const scenes = [scene('town_a'), scene('building_b', 'building')];
  const result = applyPortalLink({
    scenes,
    sourceSceneId: 'town_a',
    twoWay: true,
    portal: {
      id: 'shop_door',
      x: 3,
      y: 2,
      targetScene: 'building_b',
      arrival: { x: 2, y: 3 },
      trigger: 'touch',
      appearance: { mode: 'style', shape: 'ring', color: '#11aaff', size: 20 },
    },
  });

  const source = result.scenes.find((entry) => entry.id === 'town_a');
  const destination = result.scenes.find((entry) => entry.id === 'building_b');
  assert.equal(source.objects.portals.length, 1);
  assert.equal(destination.objects.portals.length, 1);

  const forward = source.objects.portals[0];
  const back = destination.objects.portals[0];
  assert.equal(forward.linkMode, 'two-way');
  assert.equal(forward.pairedPortalId, back.id);
  assert.deepEqual(forward.arrival, { x: 2, y: 3 });
  assert.equal(back.targetScene, 'town_a');
  assert.deepEqual(back.arrival, { x: 3, y: 2 });
  assert.equal(back.x, 2);
  assert.equal(back.y, 3);
  assert.equal(back.trigger, 'touch');
  assert.equal(back.appearance.shape, 'ring');
});

test('changing a two-way link to one-way removes the generated return portal', () => {
  const initial = applyPortalLink({
    scenes: [scene('town_a'), scene('town_b')],
    sourceSceneId: 'town_a',
    twoWay: true,
    portal: { id: 'gate', x: 2, y: 2, targetScene: 'town_b', arrival: { x: 1, y: 1 } },
  });
  const changed = applyPortalLink({
    scenes: initial.scenes,
    sourceSceneId: 'town_a',
    previousPortalId: 'gate',
    twoWay: false,
    portal: { ...initial.portal, linkMode: 'one-way', pairedPortalId: '' },
  });

  assert.equal(changed.scenes.find((entry) => entry.id === 'town_a').objects.portals.length, 1);
  assert.equal(changed.scenes.find((entry) => entry.id === 'town_b').objects.portals.length, 0);
  assert.equal(changed.portal.linkMode, 'one-way');
  assert.equal(changed.portal.pairedPortalId, undefined);
});

test('deleting a two-way source portal also deletes its paired return portal', () => {
  const linked = applyPortalLink({
    scenes: [scene('town_a'), scene('town_b')],
    sourceSceneId: 'town_a',
    twoWay: true,
    portal: { id: 'gate', x: 2, y: 2, targetScene: 'town_b', arrival: { x: 1, y: 1 } },
  });
  const deleted = deletePortalLink({ scenes: linked.scenes, sourceSceneId: 'town_a', portalId: 'gate' });
  assert.equal(deleted.find((entry) => entry.id === 'town_a').objects.portals.length, 0);
  assert.equal(deleted.find((entry) => entry.id === 'town_b').objects.portals.length, 0);
});

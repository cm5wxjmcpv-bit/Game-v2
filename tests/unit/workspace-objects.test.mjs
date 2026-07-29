import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LEGACY_OBJECT_TYPES,
  applyLegacyObject,
  ensureLegacyObjectCollections,
  legacyObjectExtras,
  legacyObjectLabel,
  normalizeLegacyObject,
  removeLegacyObject,
  validateLegacyObject,
} from '../../builder/workspace-object-model.js';

const scene = {
  id: 'test_scene',
  width: 10,
  height: 8,
  objects: {
    portals: [{ x: 1, y: 2, targetTown: 'town_two', transition: 'fade' }],
  },
};

test('legacy object collections include all supported arrays without dropping unknown object groups', () => {
  const normalized = ensureLegacyObjectCollections({ ...scene, objects: { ...scene.objects, signs: [{ x: 3, y: 4 }] } });
  assert.deepEqual(LEGACY_OBJECT_TYPES, ['portals', 'shops', 'fountains', 'enemySpawns', 'battleTriggers']);
  for (const type of LEGACY_OBJECT_TYPES) assert.ok(Array.isArray(normalized.objects[type]));
  assert.deepEqual(normalized.objects.signs, [{ x: 3, y: 4 }]);
});

test('portal normalization preserves extra fields and omits blank optional destinations', () => {
  const portal = normalizeLegacyObject('portals', {
    x: '2',
    y: '3',
    targetTown: ' town_two ',
    targetScene: '',
    targetLevel: '',
    levels: [],
    transition: 'fade',
  });
  assert.deepEqual(portal, { x: 2, y: 3, targetTown: 'town_two', transition: 'fade' });
  assert.deepEqual(legacyObjectExtras('portals', portal), { transition: 'fade' });
});

test('legacy object validation enforces coordinates and type-specific requirements', () => {
  assert.deepEqual(validateLegacyObject('shops', { x: 2, y: 2, shopId: '' }, scene), ['A shop requires a shop ID.']);
  assert.deepEqual(validateLegacyObject('enemySpawns', { x: 20, y: 2, enemyId: 'slime' }, scene), ['Object coordinates must be inside the selected scene.']);
  assert.deepEqual(validateLegacyObject('portals', { x: 1, y: 1 }, scene), ['A portal requires a target town, scene, level, or level list.']);
  assert.deepEqual(validateLegacyObject('battleTriggers', { x: 8, y: 6, width: 3, height: 3, encounterId: 'ambush' }, scene), ['The battle trigger area must remain inside the selected scene.']);
  assert.deepEqual(validateLegacyObject('battleTriggers', { x: 2, y: 2, width: 2, height: 2, enemies: ['slime'] }, scene), []);
});

test('legacy objects can be added, edited, and removed without mutating the source scene', () => {
  const added = applyLegacyObject(scene, 'shops', -1, { x: 4, y: 5, shopId: 'shop_one', stockMode: 'fixed' });
  assert.equal(scene.objects.shops, undefined);
  assert.deepEqual(added.objects.shops, [{ x: 4, y: 5, shopId: 'shop_one', stockMode: 'fixed' }]);

  const edited = applyLegacyObject(added, 'shops', 0, { x: 6, y: 5, shopId: 'shop_two', stockMode: 'rotating' });
  assert.deepEqual(edited.objects.shops[0], { x: 6, y: 5, shopId: 'shop_two', stockMode: 'rotating' });

  const removed = removeLegacyObject(edited, 'shops', 0);
  assert.deepEqual(removed.objects.shops, []);
  assert.equal(legacyObjectLabel('shops', edited.objects.shops[0], 0), 'Shop 1: shop_two');
});

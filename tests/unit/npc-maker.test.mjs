import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatPatrolPoints,
  npcPlacements,
  parsePatrolPoints,
  placeNpc,
  removeNpcPlacement,
  removeNpcPlacementsFromScenes,
  renameNpcPlacements,
  upsertNpcTemplate,
  validateNpcTemplate,
} from '../../builder/npc-maker-model.js';

test('NPC Maker parses and formats patrol points', () => {
  const points = parsePatrolPoints('1, 2\n3,4; 5, 6');
  assert.deepEqual(points, [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }]);
  assert.equal(formatPatrolPoints(points), '1, 2\n3, 4\n5, 6');
});

test('NPC Maker validates shopkeepers and referenced content', () => {
  const errors = validateNpcTemplate({
    id: 'merchant',
    name: 'Merchant',
    role: 'shopkeeper',
    interaction: { shopId: 'missing_shop' },
    combat: { weaponId: 'missing_weapon' },
  }, { shopIds: ['general_store'], weaponIds: ['iron_sword'] });
  assert.match(errors.join(' '), /not available/i);
});

test('templates upsert independently from lightweight scene placements', () => {
  const templates = upsertNpcTemplate([], {
    id: 'guide',
    name: 'Guide',
    interaction: { dialogue: ['Hello'] },
    render: { fallback: { color: '#abcdef' } },
  });
  assert.equal(templates.length, 1);
  const scene = { id: 'town', width: 8, height: 6, entities: [] };
  const placed = placeNpc(scene, 'guide', 4, 3);
  const placement = npcPlacements(placed)[0];
  assert.equal(placement.npcId, 'guide');
  assert.equal(placement.x, 4);
  assert.equal(placement.y, 3);
  assert.equal(Object.hasOwn(placement, 'interaction'), false);
  assert.equal(Object.hasOwn(placement, 'render'), false);
});

test('placement updates preserve non-NPC scene entities', () => {
  const scene = {
    id: 'building', width: 5, height: 5,
    entities: [{ id: 'crate', type: 'prop', x: 1, y: 1 }],
  };
  const placed = placeNpc(scene, 'clerk', 2, 2, 'clerk_1');
  const moved = placeNpc(placed, 'clerk', 3, 2, 'clerk_1');
  assert.equal(moved.entities.length, 2);
  assert.equal(moved.entities.find((entry) => entry.id === 'crate').type, 'prop');
  assert.equal(npcPlacements(moved)[0].x, 3);
  const removed = removeNpcPlacement(moved, 'clerk_1');
  assert.deepEqual(removed.entities.map((entry) => entry.id), ['crate']);
});

test('renaming and deleting templates updates references across Town, Level and Building scenes', () => {
  const scenes = [
    { id: 'town', entities: [{ id: 'guide_1', type: 'npc', npcId: 'guide', x: 1, y: 1 }] },
    { id: 'level', entities: [{ id: 'guide_2', type: 'npc', npcId: 'guide', x: 2, y: 2 }] },
    { id: 'building', entities: [{ id: 'guide_3', type: 'npc', npcId: 'guide', x: 3, y: 3 }, { id: 'crate', type: 'prop' }] },
  ];
  const renamed = renameNpcPlacements(scenes, 'guide', 'elder_guide');
  assert.equal(renamed.every((scene) => npcPlacements(scene).every((entry) => entry.npcId === 'elder_guide')), true);
  const cleaned = removeNpcPlacementsFromScenes(renamed, 'elder_guide');
  assert.equal(cleaned.reduce((sum, scene) => sum + npcPlacements(scene).length, 0), 0);
  assert.equal(cleaned[2].entities.some((entry) => entry.id === 'crate'), true);
});

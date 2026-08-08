import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildNpcRegistry,
  instantiateNpcEntity,
  instantiateSceneNpcs,
  nextNpcDialogue,
  normalizeNpcTemplate,
  updateNpcEntities,
} from '../../src/npcRuntime.js';

test('NPC templates normalize roles, dialogue, combat and appearance', () => {
  const npc = normalizeNpcTemplate({
    id: 'Blacksmith Erin',
    name: 'Erin',
    role: 'shopkeeper',
    faction: 'friendly',
    behavior: { mode: 'wander', speed: 1.5, radius: 4 },
    interaction: { dialogue: ['Need a blade?', 'Come back anytime.'], shopId: 'smith_shop', range: 1.4 },
    stats: { maxHp: 24, attack: 3, defense: 5, agility: 2 },
    combat: { enabled: true, weaponId: 'iron_sword' },
    render: { mode: 'texture', textureId: 'erin_texture', fallback: { shape: 'circle', color: '#123456', size: 22 } },
  });
  assert.equal(npc.id, 'blacksmith_erin');
  assert.equal(npc.role, 'shopkeeper');
  assert.equal(npc.faction, 'friendly');
  assert.deepEqual(npc.interaction.dialogue, ['Need a blade?', 'Come back anytime.']);
  assert.equal(npc.interaction.shopId, 'smith_shop');
  assert.equal(npc.combat.weaponId, 'iron_sword');
  assert.equal(npc.render.textureId, 'erin_texture');
});

test('NPC placements resolve into existing component entities without duplicating template data in the map', () => {
  const registry = buildNpcRegistry([{
    id: 'greeter',
    name: 'Greeter',
    faction: 'friendly',
    interaction: { dialogue: ['Welcome!', 'Safe travels.'], range: 1.2 },
    render: { mode: 'texture', textureId: 'greeter_tex', fallback: { shape: 'circle', color: '#60a5fa', size: 20 } },
    collision: { solid: true, radius: 0.4 },
  }]);
  const entity = instantiateNpcEntity({ id: 'greeter_1', type: 'npc', npcId: 'greeter', x: 3, y: 4 }, registry, {
    contentRootUrl: new URL('https://example.test/games/demo/'),
    texturesById: { greeter_tex: { image: 'assets/greeter.png', color: '#abcdef' } },
  });
  assert.equal(entity.id, 'greeter_1');
  assert.equal(entity.npcId, 'greeter');
  assert.equal(entity.components.interaction.action, 'npc');
  assert.equal(entity.components.interaction.npcId, 'greeter');
  assert.equal(entity.components.render.imagePath, 'https://example.test/games/demo/assets/greeter.png');
  assert.equal(entity.components.collision.solid, true);
  assert.equal(entity.components.npc.name, 'Greeter');
});

test('generic entities are preserved while NPC placements are instantiated', () => {
  const source = [
    { id: 'crate', type: 'prop', x: 1, y: 1, components: { render: { color: '#fff' } } },
    { id: 'guide_1', type: 'npc', npcId: 'guide', x: 2, y: 2 },
  ];
  const resolved = instantiateSceneNpcs(source, buildNpcRegistry([{ id: 'guide', name: 'Guide', interaction: { dialogue: ['This way.'] } }]));
  assert.equal(resolved[0], source[0]);
  assert.equal(resolved[1].components.interaction.action, 'npc');
});

test('NPC dialogue cycles across repeated interactions', () => {
  const entity = instantiateNpcEntity(
    { id: 'guide_1', type: 'npc', npcId: 'guide', x: 0, y: 0 },
    buildNpcRegistry([{ id: 'guide', interaction: { dialogue: ['First', 'Second'] } }]),
  );
  assert.equal(nextNpcDialogue(entity), 'First');
  assert.equal(nextNpcDialogue(entity), 'Second');
  assert.equal(nextNpcDialogue(entity), 'First');
});

test('patrol NPCs move through configured points without leaving rejected tiles', () => {
  const entity = instantiateNpcEntity(
    { id: 'guard_1', type: 'npc', npcId: 'guard', x: 1, y: 1 },
    buildNpcRegistry([{ id: 'guard', behavior: { mode: 'patrol', speed: 2, pauseSeconds: 0, patrol: [{ x: 3, y: 1 }] } }]),
  );
  updateNpcEntities([entity], 0.5, { canMoveTo: () => true });
  assert.ok(entity.x > 1);
  const x = entity.x;
  updateNpcEntities([entity], 0.5, { canMoveTo: () => false });
  assert.equal(entity.x, x);
});

test('missing NPC templates degrade into visible diagnostic entities instead of crashing', () => {
  const entity = instantiateNpcEntity({ id: 'missing_1', type: 'npc', npcId: 'missing', x: 1, y: 2 }, {});
  assert.equal(entity.components.npc.missing, true);
  assert.match(entity.components.interaction.message, /Missing NPC template/);
  assert.equal(entity.components.collision.solid, false);
});

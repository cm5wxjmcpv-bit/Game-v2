import assert from 'node:assert/strict';
import test from 'node:test';

import { buildNewGamePlan } from '../../builder/new-game-wizard-model.js';

test('New Game Wizard creates a package-level NPC library and manifest reference', () => {
  const plan = buildNewGamePlan({
    catalog: { games: [] },
    gameName: 'NPC Test',
    internalId: 'npc-test',
    genre: 'Adventure',
    tileSize: 32,
    resolutionWidth: 1280,
    resolutionHeight: 720,
    mapWidth: 10,
    mapHeight: 8,
    startingPlayer: 'Hero',
    physicsPreset: 'top_down',
    enableSave: true,
    enableInventory: true,
    enableDialogue: true,
    enableCombat: false,
    enableAudio: true,
  });
  assert.deepEqual(plan.errors, []);
  const manifestFile = plan.files.find((file) => file.path === 'games/npc-test/game.json');
  const npcFile = plan.files.find((file) => file.path === 'games/npc-test/data/npcs/npcs.json');
  assert.ok(manifestFile);
  assert.ok(npcFile);
  const manifest = JSON.parse(manifestFile.content);
  assert.equal(manifest.data.npcs, 'data/npcs/npcs.json');
  assert.deepEqual(JSON.parse(npcFile.content), { npcs: [] });
});

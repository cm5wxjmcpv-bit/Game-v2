import assert from 'node:assert/strict';
import test from 'node:test';

import { buildNewGamePlan, gameIdFromName } from '../../builder/new-game-wizard-model.js';
import { validateWorkspacePublishPlan } from '../../builder/workspace-publish-model.js';
import { publishWorkspacePlan } from '../../builder/workspace-publisher.js';

const catalog = {
  games: [
    { id: 'sample-rpg', name: 'Sample RPG', description: 'Existing package' },
    { id: 'scene-demo', name: 'Generic Scene Demo', description: 'Existing package' },
  ],
};
const catalogText = `${JSON.stringify(catalog, null, 2)}\n`;

function wizardPlan(overrides = {}) {
  return buildNewGamePlan({
    catalog,
    catalogBaselineContent: catalogText,
    gameName: 'Rescue Quest',
    internalId: 'rescue-quest',
    genre: 'Adventure',
    tileSize: 32,
    resolutionWidth: 1280,
    resolutionHeight: 720,
    mapWidth: 12,
    mapHeight: 9,
    startingPlayer: 'Responder',
    physicsPreset: 'top_down',
    enableSave: true,
    enableInventory: true,
    enableDialogue: true,
    enableCombat: false,
    enableAudio: true,
    ...overrides,
  });
}

test('game names normalize into safe package IDs', () => {
  assert.equal(gameIdFromName('  Rescue Quest: Alpha!  '), 'rescue-quest-alpha');
});

test('wizard generates a complete isolated package and catalog update', () => {
  const plan = wizardPlan();
  assert.deepEqual(plan.errors, []);
  assert.equal(validateWorkspacePublishPlan(plan), plan);
  assert.equal(plan.files[0].path, 'games/catalog.json');
  assert.equal(plan.files[0].operation, 'update');
  assert.ok(plan.files.length >= 20);

  const paths = new Set(plan.files.map((file) => file.path));
  for (const required of [
    'games/rescue-quest/game.json',
    'games/rescue-quest/data/config/settings.json',
    'games/rescue-quest/data/config/save.json',
    'games/rescue-quest/data/world/world.json',
    'games/rescue-quest/data/towns/home.json',
    'games/rescue-quest/data/scenes/start.json',
    'games/rescue-quest/data/actors/actors.json',
    'games/rescue-quest/data/tiles/tiles.json',
    'games/rescue-quest/data/texturepacks/default-pack.json',
  ]) assert.equal(paths.has(required), true, required);

  const manifest = JSON.parse(plan.files.find((file) => file.path.endsWith('/game.json')).content);
  assert.equal(manifest.id, 'rescue-quest');
  assert.equal(manifest.startScene.id, 'start');
  assert.equal(manifest.systems.inventory, true);
  assert.equal(manifest.systems.combat, false);

  const settings = JSON.parse(plan.files.find((file) => file.path.endsWith('/settings.json')).content);
  assert.deepEqual(settings.defaultResolution, { width: 1280, height: 720 });
  assert.equal(settings.features.audio, true);
  assert.equal(settings.features.dialogue, true);

  const save = JSON.parse(plan.files.find((file) => file.path.endsWith('/save.json')).content);
  assert.equal(save.enabled, true);
  assert.equal(save.storageKeyPattern, 'pixel_engine_save_rescue-quest_slot_{slot}');

  const scene = JSON.parse(plan.files.find((file) => file.path.endsWith('/scenes/start.json')).content);
  assert.equal(scene.width, 12);
  assert.equal(scene.height, 9);
  assert.equal(scene.tiles[0].every((tile) => tile === 'wall'), true);
  assert.equal(scene.tiles[1][1], 'floor');
  assert.equal(scene.spawn.x, 1);
  assert.equal(scene.entities[0].components.interaction.message, 'Welcome to Rescue Quest.');
});

test('wizard rejects duplicate package IDs and invalid dimensions', () => {
  const plan = wizardPlan({ internalId: 'scene-demo', mapWidth: 3 });
  assert.match(plan.errors.join(' '), /already uses/i);
  assert.match(plan.errors.join(' '), /between 5 and 100/i);
  assert.equal(plan.files.length, 0);
});

test('publisher verifies updates and absent create paths before opening a draft PR', async () => {
  const plan = wizardPlan();
  const calls = [];
  let blobIndex = 0;
  const jsonResponse = (payload, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  });
  const fetchImpl = async (url, options = {}) => {
    const path = new URL(url).pathname;
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ path, method, body });
    if (path === '/repos/cm5wxjmcpv-bit/L-C-Forge') return jsonResponse({ full_name: plan.repository });
    if (path.endsWith('/git/ref/heads/main')) return jsonResponse({ object: { sha: 'base-sha' } });
    if (path.includes('/contents/games/catalog.json')) {
      return jsonResponse({ type: 'file', encoding: 'base64', content: Buffer.from(catalogText).toString('base64') });
    }
    if (path.includes('/contents/games/rescue-quest/')) return jsonResponse({ message: 'Not Found' }, 404);
    if (path.endsWith('/git/commits/base-sha')) return jsonResponse({ tree: { sha: 'base-tree' } });
    if (path.endsWith('/git/blobs')) return jsonResponse({ sha: `blob-${blobIndex += 1}` }, 201);
    if (path.endsWith('/git/trees')) return jsonResponse({ sha: 'tree-sha' }, 201);
    if (path.endsWith('/git/commits')) return jsonResponse({ sha: 'commit-sha' }, 201);
    if (path.endsWith('/git/refs')) return jsonResponse({ ref: body.ref }, 201);
    if (path.endsWith('/pulls')) return jsonResponse({ number: 26, html_url: 'https://github.com/cm5wxjmcpv-bit/L-C-Forge/pull/26' }, 201);
    return jsonResponse({ message: `Unexpected ${method} ${path}` }, 404);
  };

  const result = await publishWorkspacePlan({ token: 'github_pat_test', plan, fetchImpl });
  assert.equal(result.pullRequestNumber, 26);
  assert.equal(result.commitSha, 'commit-sha');
  assert.match(result.branch, /^workspace\/rescue-quest-/);
  assert.equal(calls.filter((call) => call.path.includes('/contents/games/rescue-quest/')).length, plan.files.length - 1);
  assert.equal(calls.find((call) => call.path.endsWith('/pulls')).body.draft, true);
  assert.equal(calls.find((call) => call.path.endsWith('/git/trees')).body.tree.length, plan.files.length);
});

test('publisher stops if a requested package path already exists', async () => {
  const plan = wizardPlan();
  const fetchImpl = async (url) => {
    const path = new URL(url).pathname;
    if (path === '/repos/cm5wxjmcpv-bit/L-C-Forge') return { ok: true, status: 200, json: async () => ({ full_name: plan.repository }) };
    if (path.endsWith('/git/ref/heads/main')) return { ok: true, status: 200, json: async () => ({ object: { sha: 'base-sha' } }) };
    if (path.includes('/contents/games/catalog.json')) {
      return { ok: true, status: 200, json: async () => ({ type: 'file', encoding: 'base64', content: Buffer.from(catalogText).toString('base64') }) };
    }
    if (path.includes('/contents/games/rescue-quest/game.json')) {
      return { ok: true, status: 200, json: async () => ({ type: 'file', encoding: 'base64', content: Buffer.from('{}').toString('base64') }) };
    }
    return { ok: false, status: 404, json: async () => ({ message: 'Not Found' }) };
  };
  await assert.rejects(
    publishWorkspacePlan({ token: 'github_pat_test', plan, fetchImpl }),
    /already exists on main/i,
  );
});

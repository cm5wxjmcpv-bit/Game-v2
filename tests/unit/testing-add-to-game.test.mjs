import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTestingScene,
  createTestingAddToGameRequest,
  prepareTestingLevelForWorkspace,
  registerTestingSceneInWorld,
} from '../../builder/testing-add-to-game-model.js';
import {
  buildWorkspaceAssetFileChanges,
  mergeWorkspaceAssetDraft,
} from '../../builder/workspace-asset-model.js';
import {
  buildWorkspacePublishPlan,
  validateWorkspacePublishPlan,
} from '../../builder/workspace-publish-model.js';

function texture(id = 'custom_texture_blue') {
  return {
    id,
    name: 'Blue Tile',
    size: 16,
    pixels: Array.from({ length: 16 }, () => Array.from({ length: 16 }, () => ({ color: '#2244aa', alpha: 1 }))),
    previewColor: '#2244aa',
  };
}

function testingEntry(overrides = {}) {
  return {
    libraryId: 'testing_library_level_1',
    name: 'Library Level',
    updatedAt: '2026-08-07T22:00:00.000Z',
    textures: [texture()],
    map: {
      width: 2,
      height: 2,
      mapType: 'level',
      mapId: 'library_level',
      mapName: 'Library Level',
      tileLayer: [['floor_grass', 'custom_texture_blue'], ['wall_stone', 'floor_sand']],
      objectLayer: [['player_start', 'portal_level'], ['none', 'enemy_spawn_basic']],
    },
    ...overrides,
  };
}

test('Testing Space map becomes an engine scene without changing the source map', () => {
  const entry = testingEntry();
  const original = structuredClone(entry.map);
  const built = buildTestingScene(entry.map);

  assert.deepEqual(entry.map, original);
  assert.equal(built.scene.id, 'library_level');
  assert.equal(built.scene.mapType, 'level');
  assert.deepEqual(built.scene.spawn, { x: 0, y: 0 });
  assert.deepEqual(built.scene.tiles, [
    ['floor_grass_a', 'custom_texture_blue'],
    ['wall_rock_a', 'floor_sand_a'],
  ]);
  assert.deepEqual(built.requiredCustomTextureIds, ['custom_texture_blue']);
  assert.equal(built.scene.objects.portals.length, 1);
  assert.equal(built.scene.objects.enemySpawns[0].enemyId, 'slime_green');
});

test('Add to Game requires exactly one Player Start and blocks scene ID collisions', () => {
  const noSpawn = testingEntry({
    map: { ...testingEntry().map, objectLayer: [['none', 'none'], ['none', 'none']] },
  });
  assert.throws(() => buildTestingScene(noSpawn.map), /exactly one Player Start/i);

  const request = createTestingAddToGameRequest({ entry: testingEntry(), projectId: 'scene-demo' });
  const workspaceState = {
    projectId: 'scene-demo',
    manifest: { data: { levelsDirectory: 'data/levels', townsDirectory: 'data/towns' } },
    scenes: [{ id: 'library_level' }],
  };
  assert.throws(
    () => prepareTestingLevelForWorkspace({ request, workspaceState }),
    /already exists.*never overwritten/i,
  );
});

test('prepared game copy uses the target manifest directory and keeps Testing Space textures separate', () => {
  const entry = testingEntry();
  const request = createTestingAddToGameRequest({ entry, projectId: 'scene-demo' });
  const prepared = prepareTestingLevelForWorkspace({
    request,
    workspaceState: {
      projectId: 'scene-demo',
      manifest: { data: { levelsDirectory: 'data/levels', townsDirectory: 'data/towns' } },
      scenes: [{ id: 'scene_lab' }],
    },
  });

  assert.equal(prepared.scenePath, 'data/levels/library_level.json');
  assert.equal(prepared.scene._workspaceKind, 'level');
  assert.equal(prepared.scene.mapType, 'level');
  assert.deepEqual(prepared.requiredCustomTextureIds, ['custom_texture_blue']);
  assert.equal(prepared.textures.length, 1);
  prepared.scene.name = 'Changed Game Copy';
  assert.equal(entry.map.mapName, 'Library Level');
});

test('world registration appends the new scene without auto-unlocking it', () => {
  const world = {
    towns: ['fallback_room'],
    levels: [],
    start: { townId: 'fallback_room', unlockedTowns: ['fallback_room'], unlockedLevels: [], gold: 0 },
  };
  const next = registerTestingSceneInWorld(world, { id: 'library_level', mapType: 'level' });
  assert.deepEqual(world.levels, []);
  assert.deepEqual(next.levels, ['library_level']);
  assert.deepEqual(next.start.unlockedLevels, []);
});

test('staged world registration is publishable even when the level has no custom textures', () => {
  const baseline = { towns: ['fallback_room'], levels: [] };
  const current = { towns: ['fallback_room'], levels: ['library_level'] };
  const draft = mergeWorkspaceAssetDraft('scene-demo', null, [], [{
    path: 'games/scene-demo/data/world.json',
    kind: 'world registration',
    baselinePayload: baseline,
    currentPayload: current,
  }]);
  const files = buildWorkspaceAssetFileChanges({ assetDraft: draft });
  assert.equal(draft.textures.length, 0);
  assert.equal(files.length, 1);
  assert.equal(files[0].path, 'games/scene-demo/data/world.json');
  assert.deepEqual(files[0].currentPayload.levels, ['library_level']);
});

test('workspace publish plan creates a new scene file and updates the staged world index', () => {
  const scene = {
    id: 'library_level',
    name: 'Library Level',
    mapType: 'level',
    width: 2,
    height: 2,
    tiles: [['floor_grass_a', 'floor_grass_a'], ['floor_grass_a', 'floor_grass_a']],
    objects: { portals: [], shops: [], fountains: [], enemySpawns: [], battleTriggers: [] },
    entities: [],
    spawn: { x: 0, y: 0 },
    _workspaceKind: 'level',
    _workspacePath: 'data/levels/library_level.json',
  };
  const plan = buildWorkspacePublishPlan({
    projectId: 'scene-demo',
    manifest: { data: { levelsDirectory: 'data/levels' } },
    contentRootUrl: new URL('https://example.test/L-C-Forge/games/scene-demo/'),
    repositoryRootUrl: new URL('https://example.test/L-C-Forge/'),
    actors: [],
    baselineActors: [],
    scenes: [scene],
    baselineScenes: [],
    contentFiles: [{
      path: 'games/scene-demo/data/world.json',
      kind: 'world registration',
      id: 'project-content',
      baselinePayload: { towns: [], levels: [] },
      currentPayload: { towns: [], levels: ['library_level'] },
    }],
  });

  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.files.map((file) => [file.path, file.operation]), [
    ['games/scene-demo/data/levels/library_level.json', 'create'],
    ['games/scene-demo/data/world.json', 'update'],
  ]);
  assert.equal(JSON.parse(plan.files[0].content).name, 'Library Level');
  assert.equal(validateWorkspacePublishPlan(plan), plan);
});

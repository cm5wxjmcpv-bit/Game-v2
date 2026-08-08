import test from 'node:test';
import assert from 'node:assert/strict';
import { isSafeScene, normalizeSceneMap } from '../../src/sceneRuntime.js';
import { normalizeTestingMap } from '../../builder/testing-library-model.js';
import {
  createTestingAddToGameRequest,
  prepareTestingLevelForWorkspace,
  registerTestingSceneInWorld,
} from '../../builder/testing-add-to-game-model.js';
import { createMapBridgeHandoff } from '../../builder/map-bridge-model.js';
import { buildWorkspacePublishPlan } from '../../builder/workspace-publish-model.js';
import { buildNewGamePlan } from '../../builder/new-game-wizard-model.js';

function buildingMap() {
  return {
    width: 2,
    height: 2,
    mapType: 'building',
    mapId: 'blacksmith_shop',
    mapName: 'Blacksmith Shop',
    tileLayer: [
      ['floor_wood', 'floor_wood'],
      ['wall_stone', 'floor_wood'],
    ],
    objectLayer: [
      ['player_start', 'none'],
      ['none', 'blacksmith'],
    ],
  };
}

test('Building scenes use the same safe runtime mode as Towns', () => {
  const scene = normalizeSceneMap({ id: 'shop' }, 'building');
  assert.equal(scene.scene.type, 'building');
  assert.equal(scene.scene.mode, 'safe');
  assert.equal(isSafeScene(scene), true);
});

test('Testing Space preserves Building as a third map type', () => {
  const map = normalizeTestingMap(buildingMap());
  assert.equal(map.mapType, 'building');
  assert.equal(map.mapId, 'blacksmith_shop');
});

test('Add to Game stages Building maps in buildingsDirectory and world.buildings', () => {
  const entry = {
    libraryId: 'testing_blacksmith_shop',
    name: 'Blacksmith Shop',
    updatedAt: '2026-08-07T23:00:00.000Z',
    textures: [],
    map: buildingMap(),
  };
  const request = createTestingAddToGameRequest({ entry, projectId: 'scene-demo' });
  const prepared = prepareTestingLevelForWorkspace({
    request,
    workspaceState: {
      projectId: 'scene-demo',
      manifest: {
        data: {
          townsDirectory: 'data/towns',
          levelsDirectory: 'data/levels',
          buildingsDirectory: 'data/buildings',
          scenesDirectory: 'data/scenes',
        },
      },
      scenes: [{ id: 'scene_lab' }],
    },
  });

  assert.equal(prepared.sceneKind, 'building');
  assert.equal(prepared.scene.mapType, 'building');
  assert.equal(prepared.scene._workspaceKind, 'building');
  assert.equal(prepared.scenePath, 'data/buildings/blacksmith_shop.json');
  assert.deepEqual(prepared.scene.spawn, { x: 0, y: 0 });

  const world = {
    towns: ['sandbox_room'],
    levels: ['outside_level'],
    start: {
      townId: 'sandbox_room',
      unlockedTowns: ['sandbox_room'],
      unlockedLevels: ['outside_level'],
      gold: 0,
    },
  };
  const next = registerTestingSceneInWorld(world, prepared.scene);
  assert.equal(world.buildings, undefined);
  assert.deepEqual(next.buildings, ['blacksmith_shop']);
  assert.deepEqual(next.towns, ['sandbox_room']);
  assert.deepEqual(next.levels, ['outside_level']);
  assert.deepEqual(next.start, world.start);
});

test('workspace map bridge keeps Building identity while using normal editor data', () => {
  const handoff = createMapBridgeHandoff({
    projectId: 'scene-demo',
    sceneKind: 'building',
    returnUrl: 'https://example.test/L-C-Forge/builder/workspace.html?game=scene-demo',
    scene: {
      id: 'blacksmith_shop',
      name: 'Blacksmith Shop',
      width: 2,
      height: 2,
      tiles: [
        ['floor_wood_a', 'floor_wood_a'],
        ['wall_rock_a', 'floor_wood_a'],
      ],
      spawn: { x: 0, y: 0 },
      entities: [],
      objects: {},
      _workspacePath: 'data/buildings/blacksmith_shop.json',
    },
    packageTiles: [],
    stagedTextures: [],
  });

  assert.equal(handoff.sceneKind, 'building');
  assert.equal(handoff.editorMap.mapType, 'building');
  assert.equal(handoff.editorMap.mapId, 'blacksmith_shop');
});

test('workspace publishing creates new Building files only in buildingsDirectory', () => {
  const building = {
    id: 'blacksmith_shop',
    name: 'Blacksmith Shop',
    mapType: 'building',
    width: 2,
    height: 2,
    tiles: [
      ['floor_wood_a', 'floor_wood_a'],
      ['wall_rock_a', 'floor_wood_a'],
    ],
    objects: { portals: [], shops: [], fountains: [], enemySpawns: [], battleTriggers: [] },
    entities: [],
    spawn: { x: 0, y: 0 },
    _workspaceKind: 'building',
    _workspacePath: 'data/buildings/blacksmith_shop.json',
  };
  const plan = buildWorkspacePublishPlan({
    projectId: 'scene-demo',
    manifest: { data: { buildingsDirectory: 'data/buildings' } },
    contentRootUrl: new URL('https://example.test/L-C-Forge/games/scene-demo/'),
    repositoryRootUrl: new URL('https://example.test/L-C-Forge/'),
    actors: [],
    baselineActors: [],
    scenes: [building],
    baselineScenes: [],
    contentFiles: [{
      path: 'games/scene-demo/data/world.json',
      kind: 'world registration',
      id: 'project-content',
      baselinePayload: { towns: [], levels: [] },
      currentPayload: { towns: [], levels: [], buildings: ['blacksmith_shop'] },
    }],
  });

  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.files.map((file) => [file.path, file.operation]), [
    ['games/scene-demo/data/buildings/blacksmith_shop.json', 'create'],
    ['games/scene-demo/data/world.json', 'update'],
  ]);
});

test('New Game Wizard scaffolds Building storage without creating a placeholder Building', () => {
  const plan = buildNewGamePlan({
    catalog: { games: [] },
    gameName: 'Building Test',
    internalId: 'building-test',
    genre: 'Adventure',
    tileSize: 32,
    resolutionWidth: 1280,
    resolutionHeight: 720,
    mapWidth: 20,
    mapHeight: 15,
    startingPlayer: 'Player',
    physicsPreset: 'top_down',
    enableSave: true,
    enableInventory: true,
    enableDialogue: true,
    enableCombat: false,
    enableAudio: true,
  });

  assert.deepEqual(plan.errors, []);
  const manifestFile = plan.files.find((file) => file.path === 'games/building-test/game.json');
  const worldFile = plan.files.find((file) => file.path === 'games/building-test/data/world/world.json');
  assert.ok(manifestFile);
  assert.ok(worldFile);
  const manifest = JSON.parse(manifestFile.content);
  const world = JSON.parse(worldFile.content);
  assert.equal(manifest.data.buildingsDirectory, 'data/buildings');
  assert.deepEqual(world.buildings, []);
  assert.equal(plan.files.some((file) => file.path.includes('/data/buildings/')), false);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { isInsideMapBounds } from '../../src/collision.js';
import {
  buildSceneRegistry,
  getSceneSystems,
  isAdventureScene,
  isSafeScene,
  normalizeSceneMap,
  SCENE_MODES,
} from '../../src/sceneRuntime.js';
import { isSystemEnabled, mergeSystemConfig, normalizeSystemConfig } from '../../src/systemConfig.js';
import { GAME_STATES } from '../../src/stateManager.js';

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    get length() {
      return values.size;
    },
  };
}

function baseMap(id, scene = null) {
  return {
    id,
    name: id,
    width: 4,
    height: 4,
    tiles: Array.from({ length: 4 }, () => Array(4).fill('wall')),
    objects: { portals: [], shops: [], fountains: [], enemySpawns: [], battleTriggers: [] },
    spawn: { x: 1, y: 1 },
    ...(scene ? { scene } : {}),
  };
}

test('legacy towns and levels normalize into safe and adventure scenes', () => {
  const town = normalizeSceneMap(baseMap('town'), 'town');
  const level = normalizeSceneMap(baseMap('level'), 'level');
  const neutral = normalizeSceneMap(baseMap('neutral', { type: 'map', mode: 'neutral' }), 'map');

  assert.equal(town.scene.mode, SCENE_MODES.SAFE);
  assert.equal(level.scene.mode, SCENE_MODES.ADVENTURE);
  assert.equal(neutral.scene.mode, SCENE_MODES.NEUTRAL);
  assert.equal(isSafeScene(town), true);
  assert.equal(isAdventureScene(level), true);
});

test('scene registry and system overrides preserve named combat modes', () => {
  const town = normalizeSceneMap(baseMap('town'), 'town');
  const scene = normalizeSceneMap(baseMap('scene', {
    type: 'map',
    mode: 'neutral',
    systems: { collision: false, combat: false },
  }), 'map');
  const registry = buildSceneRegistry([town], [scene]);

  assert.deepEqual(Object.keys(registry).sort(), ['scene', 'town']);
  const baseSystems = normalizeSystemConfig({ combat: 'turn_based', collision: true });
  const active = getSceneSystems(baseSystems, scene);
  assert.equal(active.combat, false);
  assert.equal(active.collision, false);
  assert.equal(isSystemEnabled(active, 'combat'), false);

  const restored = mergeSystemConfig(active, { combat: 'tactical' });
  assert.equal(restored.combat, 'tactical');
  assert.equal(isSystemEnabled(restored, 'combat'), true);
});

test('bounds-only movement never allows leaving a map', () => {
  const map = baseMap('bounds');
  assert.equal(isInsideMapBounds(map, 0, 0), true);
  assert.equal(isInsideMapBounds(map, 3.99, 3.99), true);
  assert.equal(isInsideMapBounds(map, -0.01, 1), false);
  assert.equal(isInsideMapBounds(map, 4, 1), false);
});

test('game starts in a generic neutral scene and enforces scene systems', async () => {
  globalThis.window = { location: { href: 'http://localhost/?game=scene-unit' } };
  globalThis.localStorage = createStorage();

  const { Game } = await import('../../src/game.js');
  const renderer = { canvas: { width: 960, height: 640 }, render() {} };
  const heldActions = new Set();
  const input = {
    justPressed: new Set(),
    wasActionPressed() { return false; },
    isActionDown(action) { return heldActions.has(action); },
    clearFrameState() {},
  };
  const ui = {
    hideOverlay() {},
    showMainMenu() {},
    flash() {},
    isOverlayOpen() { return false; },
    renderHud() {},
    showGameOver() {},
  };
  const game = new Game({
    renderer,
    input,
    debug: { enabled: false, toggle() {} },
    audio: { play() {} },
    ui,
  });

  const neutralScene = normalizeSceneMap(baseMap('scene_lab', {
    type: 'map',
    mode: 'neutral',
    systems: { collision: false, combat: false },
  }), 'map');
  const adventureScene = normalizeSceneMap({
    ...baseMap('arena', { type: 'arena', mode: 'adventure', systems: { combat: false } }),
    objects: {
      portals: [],
      shops: [],
      fountains: [],
      battleTriggers: [],
      enemySpawns: [{ x: 2, y: 2, enemyId: 'enemy' }],
    },
  }, 'map');

  game.db = {
    game: {
      startScene: { type: 'map', id: 'scene_lab' },
      systems: normalizeSystemConfig({ collision: true, combat: 'turn_based' }),
    },
    world: {
      start: { townId: 'fallback', unlockedTowns: ['fallback'], unlockedLevels: [], gold: 0 },
    },
    classesById: {
      actor: {
        id: 'actor',
        stats: { maxHp: 10, attack: 1, defense: 1, agility: 1 },
        growth: { maxHp: 0, attack: 0, defense: 0, agility: 0 },
        startingGear: { weapon: 'tool', armor: null },
        movement: { base: 3 },
        bagSlots: 1,
      },
    },
    itemsById: { tool: { id: 'tool', attackRange: 1, cooldown: 1 } },
    enemiesById: {
      enemy: {
        id: 'enemy',
        stats: { maxHp: 5, defense: 0 },
        ai: { behavior: 'guard', speed: 1, aggroRange: 2, leashRange: 3 },
        combat: { attack: 1, attackRange: 1, cooldown: 1 },
      },
    },
    scenesById: { scene_lab: neutralScene, arena: adventureScene },
    townsById: {},
    levelsById: {},
    tileDefs: { wall: { id: 'wall', walkable: false } },
    progression: { unlocks: {} },
  };
  game.currentTownId = 'fallback';
  game.lastSafeSceneId = 'fallback';

  game.startNew('actor');
  assert.equal(game.state.current, GAME_STATES.SCENE);
  assert.equal(game.currentSceneId, 'scene_lab');
  assert.ok(localStorage.getItem('pixel_engine_save_scene-unit_slot_1'));

  heldActions.add('right');
  game.updateMovement(0.4);
  heldActions.clear();
  assert.ok(game.player.x > 2, 'collision-disabled scene should allow movement through a wall tile');

  game.player.x = 3.8;
  heldActions.add('right');
  game.updateMovement(1);
  heldActions.clear();
  assert.equal(game.player.x, 3.8, 'bounds-only movement should still block leaving the map');

  game.loadScene('arena');
  assert.equal(game.state.current, GAME_STATES.LEVEL);
  assert.equal(game.currentEnemies.length, 0, 'combat-disabled adventure scenes must not spawn enemies');
});

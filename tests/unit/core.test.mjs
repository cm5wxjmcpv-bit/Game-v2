import assert from 'node:assert/strict';
import test from 'node:test';

import { canWalkTo } from '../../src/collision.js';
import { addItemToBag, removeItemFromBag } from '../../src/inventory.js';
import { StateManager, GAME_STATES } from '../../src/stateManager.js';
import { applyTileEffect } from '../../src/tileEffects.js';

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
    clear() {
      values.clear();
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    get length() {
      return values.size;
    },
    keys() {
      return [...values.keys()];
    },
  };
}

test('collision rejects boundaries, missing rows, and unknown tiles', () => {
  const map = {
    width: 2,
    height: 2,
    tiles: [
      ['floor', 'wall'],
      ['unknown', 'floor'],
    ],
  };
  const tileDefs = {
    floor: { walkable: true },
    wall: { walkable: false },
  };

  assert.equal(canWalkTo(map, 0, 0, tileDefs), true);
  assert.equal(canWalkTo(map, 1, 0, tileDefs), false);
  assert.equal(canWalkTo(map, 0, 1, tileDefs), false);
  assert.equal(canWalkTo(map, -1, 0, tileDefs), false);
  assert.equal(canWalkTo(map, 5, 5, tileDefs), false);
});

test('pause and resume restore the exact prior engine state', () => {
  const state = new StateManager(GAME_STATES.LEVEL);
  state.pause();
  assert.equal(state.current, GAME_STATES.PAUSE);
  state.resume();
  assert.equal(state.current, GAME_STATES.LEVEL);

  state.set(GAME_STATES.BATTLE);
  state.pause();
  state.resume();
  assert.equal(state.current, GAME_STATES.BATTLE);
});

test('lethal damage-over-time tile effects trigger defeat and clamp HP', () => {
  let defeatCount = 0;
  const game = {
    dt: 1,
    _dotTimer: 0,
    player: { stats: { hp: 2 }, speedModifier: 1 },
    db: {
      tileEffects: {
        poison: { id: 'poison', type: 'damageOverTime', amount: 3, interval: 1 },
      },
    },
    onPlayerDefeated() {
      defeatCount += 1;
    },
  };

  applyTileEffect(game, { effect: 'poison' });
  assert.equal(game.player.stats.hp, 0);
  assert.equal(defeatCount, 1);
});

test('leaving a damage-over-time tile resets the pending tick timer', () => {
  const game = {
    dt: 0.5,
    _dotTimer: 0.5,
    player: { stats: { hp: 10 }, speedModifier: 1 },
    db: { tileEffects: {} },
    onPlayerDefeated() {},
  };

  applyTileEffect(game, {});
  assert.equal(game._dotTimer, 0);
  assert.equal(game.player.speedModifier, 1);
});

test('inventory refuses unknown items and preserves slot limits', () => {
  const player = {
    bag: { slots: 1, maxStack: 99, items: [] },
  };
  const items = {
    potion: { id: 'potion', stackable: true },
    sword: { id: 'sword', stackable: false },
  };

  assert.equal(addItemToBag(player, 'missing', 1, items), false);
  assert.equal(addItemToBag(player, 'potion', 1, items), true);
  assert.equal(addItemToBag(player, 'potion', 2, items), true);
  assert.deepEqual(player.bag.items, [{ itemId: 'potion', count: 3 }]);
  assert.equal(addItemToBag(player, 'sword', 1, items), false);
  assert.equal(removeItemFromBag(player, 'potion', 2), true);
  assert.deepEqual(player.bag.items, [{ itemId: 'potion', count: 1 }]);
});

test('starting a game loads its town and writes a package-specific checkpoint', async () => {
  globalThis.window = { location: { href: 'http://localhost/?game=unit-package' } };
  globalThis.localStorage = createStorage();

  const { Game } = await import('../../src/game.js');
  const renderer = { canvas: { width: 960, height: 640 }, render() {} };
  const input = {
    justPressed: new Set(),
    wasActionPressed() { return false; },
    isActionDown() { return false; },
    clearFrameState() {},
  };
  const ui = {
    hideOverlay() {},
    showMainMenu() {},
    flash() {},
    isOverlayOpen() { return false; },
    renderHud() {},
  };
  const game = new Game({ renderer, input, debug: { enabled: false, toggle() {} }, audio: {}, ui });
  game.db = {
    world: {
      start: {
        townId: 'unit_town',
        unlockedTowns: ['unit_town'],
        unlockedLevels: [],
        gold: 5,
      },
    },
    classesById: {
      actor: {
        id: 'actor',
        stats: { maxHp: 10, attack: 1, defense: 1, agility: 1 },
        growth: { maxHp: 0, attack: 0, defense: 0, agility: 0 },
        startingGear: { weapon: 'tool', armor: null },
        movement: { base: 3 },
        bagSlots: 2,
      },
    },
    itemsById: { tool: { id: 'tool', attackRange: 1, cooldown: 1 } },
    townsById: {
      unit_town: {
        id: 'unit_town',
        width: 3,
        height: 3,
        tiles: Array.from({ length: 3 }, () => Array(3).fill('floor')),
        objects: { portals: [], shops: [], fountains: [], enemySpawns: [], battleTriggers: [] },
        spawn: { x: 1, y: 1 },
      },
    },
  };
  game.currentTownId = 'unit_town';

  game.startNew('actor');

  assert.equal(game.state.current, GAME_STATES.TOWN);
  assert.equal(game.currentMap.id, 'unit_town');
  assert.equal(game.player.gold, 5);
  assert.ok(localStorage.getItem('pixel_engine_save_unit-package_slot_1'));
});

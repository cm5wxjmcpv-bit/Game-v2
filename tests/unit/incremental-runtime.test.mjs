import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeGameManifest,
} from '../../src/gameManifest.js';
import {
  normalizeIncrementalConfig,
} from '../../src/incrementalContent.js';
import { IncrementalGame } from '../../src/incrementalGame.js';
import {
  createInitialIncrementalSnapshot,
  loadIncrementalGame,
  migrateIncrementalSnapshot,
  saveIncrementalGame,
  validateIncrementalSnapshot,
} from '../../src/incrementalSaveSystem.js';
import { formatCurrency, formatNumber } from '../../src/numberFormat.js';
import { runtimeModuleForGameType } from '../../src/runtimeTypes.js';

function rawConfig(overrides = {}) {
  return {
    schemaVersion: 1,
    id: 'miner-incremental',
    balance: {
      manualPower: 2,
      autosaveSeconds: 2,
      employeeWageShare: 0.1,
      minimumWage: 1,
    },
    progression: { xpBase: 100, xpGrowth: 1.25 },
    start: {
      cash: 0,
      level: 1,
      xp: 0,
      mineId: 'test-mine',
      depositId: 'stone-face',
      storyStage: 'employee',
    },
    employment: {
      companyId: 'blackstone',
      companyName: 'Blackstone Mining Co.',
      role: 'Mine Worker',
    },
    resources: [
      { id: 'stone', name: 'Stone', value: 10, color: '#777777', icon: '●' },
    ],
    deposits: [
      {
        id: 'stone-face',
        name: 'Stone Face',
        maxHp: 4,
        resourceId: 'stone',
        reward: { min: 2, max: 2 },
        xp: 5,
        weight: 1,
      },
    ],
    mines: [
      { id: 'test-mine', name: 'Test Mine', depositIds: ['stone-face'] },
    ],
    ...overrides,
  };
}

function config(overrides = {}) {
  return normalizeIncrementalConfig(rawConfig(overrides), { gameId: 'miner-incremental' });
}

function storage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    values,
  };
}

test('legacy manifests default to adventure while incremental manifests select the separate runtime', () => {
  const legacy = normalizeGameManifest({ id: 'legacy-game' }, 'legacy-game');
  const incremental = normalizeGameManifest({ id: 'miner-incremental', gameType: 'incremental' }, 'miner-incremental');
  assert.equal(legacy.gameType, 'adventure');
  assert.equal(runtimeModuleForGameType(legacy.gameType), './adventureMain.js');
  assert.equal(incremental.gameType, 'incremental');
  assert.equal(runtimeModuleForGameType(incremental.gameType), './incrementalMain.js');
  assert.throws(
    () => normalizeGameManifest({ id: 'bad-game', gameType: 'unknown' }, 'bad-game'),
    /Unsupported game type/,
  );
});

test('incremental config validates IDs, references, finite values, and reward bounds', () => {
  const normalized = config();
  assert.equal(normalized.depositsById['stone-face'].resourceId, 'stone');
  assert.equal(normalized.minesById['test-mine'].depositIds[0], 'stone-face');

  const broken = rawConfig();
  broken.deposits[0].resourceId = 'missing';
  broken.deposits[0].reward.max = -1;
  assert.throws(
    () => normalizeIncrementalConfig(broken, { gameId: 'miner-incremental' }),
    /missing resource|reward\.max/,
  );
});

test('manual mining damages and replaces deposits while awarding resource totals, XP, and wages', () => {
  const saves = [];
  let now = 1_000;
  const game = new IncrementalGame({
    config: config(),
    gameVersion: '0.1.0',
    random: () => 0,
    clock: () => now,
    saveAdapter: {
      load: () => null,
      save: (snapshot) => {
        saves.push(JSON.parse(JSON.stringify(snapshot)));
        return true;
      },
    },
  });

  game.start();
  const hit = game.mine();
  assert.deepEqual(hit, { type: 'hit', damage: 2, depositId: 'stone-face' });
  assert.equal(game.state.currentDeposit.hp, 2);

  now = 2_000;
  const broken = game.mine();
  assert.equal(broken.type, 'break');
  assert.equal(broken.quantity, 2);
  assert.equal(broken.wage, 2);
  assert.equal(broken.xp, 5);
  assert.equal(broken.destination, 'employer');
  assert.equal(game.state.cash, 2);
  assert.equal(game.state.character.xp, 5);
  assert.equal(game.state.materials.stone, 0);
  assert.equal(game.state.employment.companyResources.stone, 2);
  assert.equal(game.state.employment.companyValue, 18);
  assert.equal(game.state.statistics.totalManualSwings, 2);
  assert.equal(game.state.statistics.totalDepositsBroken, 1);
  assert.equal(game.state.statistics.resourceTotals.stone, 2);
  assert.deepEqual(game.state.currentDeposit, { id: 'stone-face', hp: 4, maxHp: 4 });
  assert.ok(saves.length >= 2);
});

test('incremental tick support tracks time and autosaves at the configured interval', () => {
  let saveCount = 0;
  const game = new IncrementalGame({
    config: config(),
    gameVersion: '0.1.0',
    saveAdapter: {
      load: () => null,
      save: () => { saveCount += 1; return true; },
    },
  });
  game.start();
  assert.equal(saveCount, 1);
  game.update(1.25);
  assert.equal(saveCount, 1);
  game.update(0.75);
  assert.equal(saveCount, 2);
  assert.equal(game.state.statistics.timePlayed, 2);
});

test('incremental saves round trip in the package namespace and malformed saves fail safely', () => {
  const originalWindow = globalThis.window;
  globalThis.window = { location: { href: 'http://localhost/?game=miner-incremental' } };
  const local = storage();
  const snapshot = createInitialIncrementalSnapshot(config(), { now: 1234, gameVersion: '0.1.0' });

  assert.equal(saveIncrementalGame(snapshot, 1, { storage: local, now: 1234 }), true);
  assert.ok(local.values.has('pixel_engine_save_miner-incremental_slot_1'));
  assert.deepEqual(loadIncrementalGame(1, { storage: local }), snapshot);

  const negative = JSON.parse(JSON.stringify(snapshot));
  negative.materials.stone = -1;
  assert.equal(validateIncrementalSnapshot(negative), false);
  local.setItem('pixel_engine_save_miner-incremental_slot_1', JSON.stringify({
    version: 1,
    gameType: 'incremental',
    gameId: 'miner-incremental',
    slot: 1,
    payload: negative,
  }));
  assert.equal(loadIncrementalGame(1, { storage: local }), null);

  const cyclic = { ...snapshot };
  cyclic.self = cyclic;
  assert.equal(saveIncrementalGame(cyclic, 1, { storage: local }), false);

  local.setItem('pixel_engine_save_miner-incremental_slot_1', JSON.stringify({
    version: 99,
    gameType: 'incremental',
    gameId: 'miner-incremental',
    slot: 1,
    payload: snapshot,
  }));
  assert.equal(loadIncrementalGame(1, { storage: local }), null);

  const versionZero = JSON.parse(JSON.stringify(snapshot));
  delete versionZero.saveVersion;
  assert.equal(migrateIncrementalSnapshot(versionZero).saveVersion, 1);
  globalThis.window = originalWindow;
});

test('large values use compact readable formatting', () => {
  assert.equal(formatNumber(999), '999');
  assert.equal(formatNumber(1_250), '1.25K');
  assert.equal(formatNumber(4_800_000), '4.80M');
  assert.equal(formatNumber(2_310_000_000), '2.31B');
  assert.equal(formatCurrency(1_040_000_000_000), '$1.04T');
});

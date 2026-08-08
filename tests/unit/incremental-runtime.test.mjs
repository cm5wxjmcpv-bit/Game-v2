import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeGameManifest } from '../../src/gameManifest.js';
import { normalizeIncrementalConfig } from '../../src/incrementalContent.js';
import { IncrementalGame } from '../../src/incrementalGame.js';
import {
  INCREMENTAL_SAVE_VERSION,
  createInitialIncrementalSnapshot,
  loadIncrementalGame,
  migrateIncrementalSnapshot,
  normalizeIncrementalSaveEnvelope,
  saveIncrementalGame,
  validateIncrementalSnapshot,
} from '../../src/incrementalSaveSystem.js';
import { formatCurrency, formatNumber } from '../../src/numberFormat.js';
import { runtimeModuleForGameType } from '../../src/runtimeTypes.js';

function rawConfig() {
  return {
    schemaVersion: 1,
    id: 'miner-incremental',
    balance: {
      manualPower: 2,
      autosaveSeconds: 2,
      employeeWageShare: 0.1,
      minimumWage: 1,
      baseCriticalChance: 0,
      baseCriticalDamage: 2,
      baseOreYieldChance: 0,
    },
    progression: {
      xpBase: 100,
      xpGrowth: 1.25,
      skillPointsPerLevel: 1,
      skillResetCostPerPoint: 25,
    },
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
      foremanName: 'Foreman Test',
      contractBuyoutCost: 50,
    },
    independence: {
      role: 'Independent Miner',
      operationName: 'Test Claim',
      instruction: 'Keep your ore.',
    },
    skills: [
      {
        id: 'mining-power',
        name: 'Mining Power',
        maxRank: 2,
        effect: { type: 'manual-power-flat', amount: 1, label: '+1 power' },
      },
      {
        id: 'critical-chance',
        name: 'Critical Chance',
        maxRank: 2,
        effect: { type: 'critical-chance', amount: 1, label: '+100% chance' },
      },
      {
        id: 'critical-damage',
        name: 'Critical Damage',
        maxRank: 2,
        effect: { type: 'critical-damage', amount: 1, label: '+1x damage' },
      },
      {
        id: 'ore-yield',
        name: 'Ore Yield',
        maxRank: 2,
        effect: { type: 'ore-yield-chance', amount: 1, label: '+100% chance' },
      },
      {
        id: 'automation-bonus',
        name: 'Automation Bonus',
        maxRank: 2,
        enabled: false,
        unlockNote: 'Reserved for automation.',
        effect: { type: 'automation-bonus', amount: 0.1, label: '+10% automation' },
      },
    ],
    story: {
      milestones: [
        {
          id: 'first-shift',
          title: 'First Shift',
          speaker: 'Foreman Test',
          text: 'Start mining.',
          trigger: { type: 'start' },
        },
        {
          id: 'level-two',
          title: 'Level Two',
          speaker: 'Foreman Test',
          text: 'You improved.',
          trigger: { type: 'level', value: 2 },
        },
        {
          id: 'contract-ready',
          title: 'Contract Ready',
          speaker: 'Contract Office',
          text: 'You can afford freedom.',
          trigger: { type: 'contract-affordable' },
        },
        {
          id: 'contract-bought',
          title: 'Independent',
          speaker: 'Foreman Test',
          text: 'You left.',
          trigger: { type: 'stage', value: 'independent' },
        },
      ],
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
  };
}

function config(mutator = null) {
  const raw = rawConfig();
  if (mutator) mutator(raw);
  return normalizeIncrementalConfig(raw, { gameId: 'miner-incremental' });
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

function createGame(gameConfig = config(), options = {}) {
  const saves = [];
  const game = new IncrementalGame({
    config: gameConfig,
    gameVersion: '0.2.0',
    random: options.random || (() => 0),
    clock: options.clock || (() => 1_000),
    saveAdapter: options.saveAdapter || {
      load: () => null,
      save: (snapshot) => {
        saves.push(JSON.parse(JSON.stringify(snapshot)));
        return true;
      },
    },
  });
  return { game, saves };
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

test('incremental config validates IDs, references, skill effects, milestone triggers, and finite values', () => {
  const normalized = config();
  assert.equal(normalized.depositsById['stone-face'].resourceId, 'stone');
  assert.equal(normalized.skillsById['mining-power'].effect.type, 'manual-power-flat');
  assert.equal(normalized.story.milestones.at(-1).trigger.value, 'independent');

  const broken = rawConfig();
  broken.deposits[0].resourceId = 'missing';
  broken.deposits[0].reward.max = -1;
  broken.skills[0].effect.amount = Number.POSITIVE_INFINITY;
  broken.story.milestones[0].trigger.type = 'javascript';
  assert.throws(
    () => normalizeIncrementalConfig(broken, { gameId: 'miner-incremental' }),
    /missing resource|reward\.max|effect\.amount|trigger\.type/,
  );
});

test('manual mining damages and replaces deposits while awarding resource totals, XP, and wages', () => {
  let now = 1_000;
  const { game, saves } = createGame(config(), { clock: () => now });

  game.start();
  const hit = game.mine();
  assert.deepEqual(hit, {
    type: 'hit', damage: 2, depositId: 'stone-face', critical: false,
  });
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

test('deposit XP levels the character, carries excess XP, and awards skill points', () => {
  const fastConfig = config((raw) => {
    raw.progression.xpBase = 5;
    raw.progression.xpGrowth = 2;
    raw.deposits[0].xp = 9;
  });
  const { game } = createGame(fastConfig);
  game.start();
  game.mine();
  const result = game.mine();

  assert.equal(result.levelsGained, 1);
  assert.equal(result.skillPointsGained, 1);
  assert.equal(game.state.character.level, 2);
  assert.equal(game.state.character.xp, 4);
  assert.equal(game.state.character.skillPoints, 1);
  assert.ok(game.state.milestones.includes('level-two'));
});

test('loaded Milestone 1 XP is converted through the level curve without being lost', () => {
  const fastConfig = config((raw) => {
    raw.progression.xpBase = 5;
    raw.progression.xpGrowth = 2;
  });
  const snapshot = createInitialIncrementalSnapshot(fastConfig, { now: 10, gameVersion: '0.1.0' });
  snapshot.character.xp = 15;
  let saved = null;
  const { game } = createGame(fastConfig, {
    saveAdapter: {
      load: () => snapshot,
      save: (state) => { saved = JSON.parse(JSON.stringify(state)); return true; },
    },
  });

  const started = game.start();
  assert.equal(started.source, 'save');
  assert.equal(game.state.character.level, 3);
  assert.equal(game.state.character.xp, 0);
  assert.equal(game.state.character.skillPoints, 2);
  assert.equal(saved.character.level, 3);
});

test('skill allocation validates points and rank limits while deterministic skills affect mining', () => {
  const { game } = createGame();
  game.start();
  assert.equal(game.allocateSkill('missing').reason, 'unknown-skill');
  assert.equal(game.allocateSkill('mining-power').reason, 'no-skill-points');
  game.state.character.skillPoints = 4;
  assert.equal(game.allocateSkill('automation-bonus').reason, 'skill-locked');
  assert.equal(game.allocateSkill('mining-power').ok, true);
  assert.equal(game.allocateSkill('critical-chance').ok, true);
  assert.equal(game.allocateSkill('critical-damage').ok, true);
  assert.equal(game.allocateSkill('ore-yield').ok, true);
  assert.equal(game.getManualPower(), 3);

  const broken = game.mine();
  assert.equal(broken.type, 'break');
  assert.equal(broken.critical, true);
  assert.equal(broken.damage, 4);
  assert.equal(broken.baseQuantity, 2);
  assert.equal(broken.bonusQuantity, 1);
  assert.equal(broken.quantity, 3);

  game.state.character.skillPoints = 3;
  assert.equal(game.allocateSkill('mining-power').ok, true);
  assert.equal(game.allocateSkill('mining-power').reason, 'max-rank');
});

test('skill resets quote a configured cost, prevent overspending, and refund allocated points', () => {
  const { game } = createGame();
  game.start();
  game.state.character.skillPoints = 2;
  game.allocateSkill('mining-power');
  game.allocateSkill('critical-chance');
  assert.equal(game.getSkillResetCost(), 50);

  game.state.cash = 49;
  assert.deepEqual(game.resetSkills(), {
    ok: false, reason: 'insufficient-cash', cost: 50, cash: 49,
  });
  assert.equal(game.state.skills['mining-power'], 1);
  game.state.cash = 50;
  const reset = game.resetSkills();
  assert.equal(reset.ok, true);
  assert.equal(reset.refundedPoints, 2);
  assert.equal(game.state.cash, 0);
  assert.equal(game.state.character.skillPoints, 2);
  assert.equal(game.state.skills['mining-power'], 0);
  assert.equal(game.state.skills['critical-chance'], 0);
});

test('employee wages can fund the contract buyout and subsequent resources belong to the player', () => {
  const { game } = createGame(config(), { clock: () => 777 });
  game.start();
  assert.deepEqual(game.buyOutContract(), {
    ok: false, reason: 'insufficient-cash', cost: 50, cash: 0,
  });

  let swings = 0;
  while (game.state.cash < 50 && swings < 100) {
    game.mine();
    swings += 1;
  }
  assert.equal(game.state.cash, 50);
  assert.ok(game.state.milestones.includes('contract-ready'));
  const companyStoneBefore = game.state.employment.companyResources.stone;
  const bought = game.buyOutContract();
  assert.equal(bought.ok, true);
  assert.equal(game.state.cash, 0);
  assert.equal(game.state.storyStage, 'independent');
  assert.equal(game.state.employment.active, false);
  assert.equal(game.state.employment.contractBuyoutPaid, 50);
  assert.equal(game.state.employment.endedAt, 777);
  assert.ok(game.state.milestones.includes('contract-bought'));
  assert.deepEqual(game.buyOutContract(), { ok: false, reason: 'not-employed' });

  game.mine();
  const independentBreak = game.mine();
  assert.equal(independentBreak.destination, 'player');
  assert.equal(independentBreak.wage, 0);
  assert.equal(game.state.employment.companyResources.stone, companyStoneBefore);
  assert.equal(game.state.materials.stone, 2);
  assert.equal(game.state.cash, 0);
});

test('data-driven milestone triggers unlock once at start, level, contract, and stage thresholds', () => {
  const seen = [];
  const { game } = createGame();
  game.subscribe((event) => {
    if (event.type === 'milestone') seen.push(event.detail.id);
  });
  game.start();
  assert.deepEqual(seen, ['first-shift']);

  game.state.cash = 50;
  assert.deepEqual(game.evaluateMilestones().map((entry) => entry.id), ['contract-ready']);
  assert.deepEqual(game.evaluateMilestones(), []);
  game.state.character.level = 2;
  assert.deepEqual(game.evaluateMilestones().map((entry) => entry.id), ['level-two']);
  game.state.storyStage = 'independent';
  assert.deepEqual(game.evaluateMilestones().map((entry) => entry.id), ['contract-bought']);
  assert.deepEqual(seen, ['first-shift', 'contract-ready', 'level-two', 'contract-bought']);
});

test('incremental tick support tracks time and autosaves at the configured interval', () => {
  let saveCount = 0;
  const { game } = createGame(config(), {
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

test('incremental saves round trip, migrate v1 saves, and reject malformed or future data', (t) => {
  const originalWindow = globalThis.window;
  t.after(() => { globalThis.window = originalWindow; });
  globalThis.window = { location: { href: 'http://localhost/?game=miner-incremental' } };
  const local = storage();
  const snapshot = createInitialIncrementalSnapshot(config(), { now: 1234, gameVersion: '0.2.0' });

  assert.equal(saveIncrementalGame(snapshot, 1, { storage: local, now: 1234 }), true);
  assert.ok(local.values.has('pixel_engine_save_miner-incremental_slot_1'));
  assert.deepEqual(loadIncrementalGame(1, { storage: local }), snapshot);

  const negative = JSON.parse(JSON.stringify(snapshot));
  negative.materials.stone = -1;
  assert.equal(validateIncrementalSnapshot(negative), false);
  local.setItem('pixel_engine_save_miner-incremental_slot_1', JSON.stringify({
    version: INCREMENTAL_SAVE_VERSION,
    gameType: 'incremental',
    gameId: 'miner-incremental',
    slot: 1,
    payload: negative,
  }));
  assert.equal(loadIncrementalGame(1, { storage: local }), null);

  const legacy = JSON.parse(JSON.stringify(snapshot));
  legacy.saveVersion = 1;
  delete legacy.employment.active;
  delete legacy.employment.contractBuyoutPaid;
  delete legacy.employment.endedAt;
  const legacyEnvelope = {
    version: 1,
    gameType: 'incremental',
    gameId: 'miner-incremental',
    slot: 1,
    payload: legacy,
  };
  local.setItem('pixel_engine_save_miner-incremental_slot_1', JSON.stringify(legacyEnvelope));
  const migratedLegacy = loadIncrementalGame(1, { storage: local });
  assert.equal(migratedLegacy.saveVersion, 2);
  assert.equal(migratedLegacy.employment.active, true);
  assert.equal(migratedLegacy.employment.contractBuyoutPaid, 0);
  assert.equal(migratedLegacy.employment.endedAt, null);
  assert.ok(normalizeIncrementalSaveEnvelope(legacyEnvelope, {
    gameId: 'miner-incremental', slot: 1,
  }));

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
  assert.equal(migrateIncrementalSnapshot(versionZero).saveVersion, 2);
});

test('large values use compact readable formatting', () => {
  assert.equal(formatNumber(999), '999');
  assert.equal(formatNumber(1_250), '1.25K');
  assert.equal(formatNumber(4_800_000), '4.80M');
  assert.equal(formatNumber(2_310_000_000), '2.31B');
  assert.equal(formatCurrency(1_040_000_000_000), '$1.04T');
});

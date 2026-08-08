import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeGameManifest } from '../../src/gameManifest.js';
import {
  normalizeIncrementalConfig,
  rollScratchPrize,
  scaledPurchaseCost,
  selectWeightedDeposit,
  selectWeightedMiningEvent,
  selectWeightedRareFind,
} from '../../src/incrementalContent.js';
import { IncrementalGame } from '../../src/incrementalGame.js';
import { calculateOfflineWindow } from '../../src/incrementalOffline.js';
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
      maxAutomationBreaksPerTick: 100,
    },
    progression: {
      xpBase: 100,
      xpGrowth: 1.25,
      skillPointsPerLevel: 1,
      skillResetCostPerPoint: 25,
    },
    offlineProgress: {
      minimumAwaySeconds: 60,
      capSeconds: 36_000,
      maxBreaks: 100_000,
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
        effect: { type: 'automation-bonus', amount: 0.1, label: '+10% automation' },
      },
    ],
    equipment: {
      slots: [
        { id: 'tool', name: 'Main Tool' },
        { id: 'gloves', name: 'Gloves' },
      ],
      items: [
        {
          id: 'starter-pickaxe',
          name: 'Starter Pickaxe',
          slotId: 'tool',
          cost: 0,
          startingOwned: true,
          startingEquipped: true,
          bonuses: [{ type: 'manual-power-flat', amount: 0, label: 'Base power' }],
        },
        {
          id: 'iron-pickaxe',
          name: 'Iron Pickaxe',
          slotId: 'tool',
          cost: 10,
          requiresItemId: 'starter-pickaxe',
          bonuses: [{ type: 'manual-power-flat', amount: 2, label: '+2 power' }],
        },
        {
          id: 'steel-pickaxe',
          name: 'Steel Pickaxe',
          slotId: 'tool',
          cost: 20,
          requiresItemId: 'iron-pickaxe',
          bonuses: [{ type: 'manual-power-flat', amount: 4, label: '+4 power' }],
        },
        {
          id: 'work-gloves',
          name: 'Work Gloves',
          slotId: 'gloves',
          cost: 8,
          bonuses: [{ type: 'critical-chance', amount: 0.25, label: '+25% critical chance' }],
        },
      ],
    },
    lottery: {
      disclaimer: 'Fictional test lottery.',
      scratchTickets: [
        {
          id: 'test-scratch',
          name: 'Test Scratch',
          cost: 10,
          prizes: [
            { id: 'none', label: 'No prize', probability: 0.5, reward: { type: 'none' } },
            { id: 'cash', label: '$4', probability: 0.25, reward: { type: 'cash', amount: 4 } },
            { id: 'stone', label: '1 Stone', probability: 0.15, reward: { type: 'resource', resourceId: 'stone', amount: 1 } },
            { id: 'free', label: 'Free ticket', probability: 0.1, reward: { type: 'free-ticket', ticketId: 'test-scratch' } },
          ],
        },
      ],
    },
    store: {
      id: 'test-store',
      name: 'Test Store',
      categories: [
        {
          id: 'gear',
          name: 'Gear',
          equipmentIds: ['starter-pickaxe', 'iron-pickaxe', 'steel-pickaxe', 'work-gloves'],
        },
        {
          id: 'lottery',
          name: 'Lottery',
          scratchTicketIds: ['test-scratch'],
        },
      ],
    },
    company: {
      ownerRole: 'Founder',
      creation: {
        cost: 100,
        requiredCharacterLevel: 2,
        minimumNameLength: 2,
        maximumNameLength: 30,
      },
      levels: [
        { level: 1, name: 'Test Outfit', requiredInvestment: 0 },
        { level: 2, name: 'Test Company', requiredInvestment: 30 },
        { level: 3, name: 'Test Producer', requiredInvestment: 200 },
      ],
    },
    generators: [
      {
        id: 'hired-miner',
        name: 'Hired Miner',
        baseCost: 10,
        growthRate: 1.5,
        powerPerSecond: 1,
        workersPerUnit: 1,
        unlock: { companyLevel: 1 },
      },
      {
        id: 'test-crew',
        name: 'Test Crew',
        baseCost: 40,
        growthRate: 2,
        powerPerSecond: 5,
        workersPerUnit: 3,
        unlock: {
          companyLevel: 2,
          requiredGeneratorId: 'hired-miner',
          requiredGeneratorOwned: 2,
        },
      },
    ],
    businessUpgrades: [
      {
        id: 'worker-training',
        name: 'Worker Training',
        baseCost: 20,
        growthRate: 2,
        maxRank: 2,
        effect: {
          type: 'automation-multiplier',
          amount: 0.25,
          label: '+25% automation',
        },
        unlock: {
          companyLevel: 1,
          requiredGeneratorId: 'hired-miner',
          requiredGeneratorOwned: 1,
        },
      },
      {
        id: 'crew-tools',
        name: 'Crew Tools',
        baseCost: 50,
        growthRate: 2,
        maxRank: 2,
        effect: {
          type: 'generator-multiplier',
          generatorId: 'test-crew',
          amount: 0.5,
          label: '+50% crew power',
        },
        unlock: {
          companyLevel: 2,
          requiredGeneratorId: 'test-crew',
          requiredGeneratorOwned: 1,
        },
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

function addMineProgressionContent(raw) {
  raw.skills.push({
    id: 'rare-find',
    name: 'Rare Find',
    maxRank: 2,
    effect: { type: 'rare-find-chance', amount: 0.25, label: '+25% rare finds' },
  });
  raw.resources.push({ id: 'iron', name: 'Iron Ore', value: 25, color: '#999999', icon: '⬢' });
  raw.deposits.push({
    id: 'iron-vein',
    name: 'Iron Vein',
    maxHp: 8,
    resourceId: 'iron',
    reward: { min: 3, max: 3 },
    xp: 8,
    weight: 1,
  });
  raw.mines[0].unlock = {
    cost: 0,
    characterLevel: 1,
    companyLevel: 0,
    requiresIndependence: false,
    requiredDepositsBroken: 0,
  };
  raw.mines.push({
    id: 'iron-mine',
    name: 'Iron Mine',
    description: 'A deeper test mine.',
    depositIds: ['stone-face', 'iron-vein'],
    unlock: {
      cost: 30,
      characterLevel: 3,
      companyLevel: 2,
      requiresIndependence: true,
      requiredMineId: 'test-mine',
      requiredDepositsBroken: 2,
    },
  });
  raw.rareFinds = {
    baseChance: 0.2,
    maxChance: 0.8,
    manualOnly: true,
    finds: [
      {
        id: 'old-coin',
        name: 'Old Coin',
        weight: 1,
        reward: { type: 'cash', amount: 15 },
      },
      {
        id: 'iron-specimen',
        name: 'Iron Specimen',
        weight: 1,
        eligibleMineIds: ['iron-mine'],
        reward: { type: 'resource', resourceId: 'iron', amount: 2 },
      },
    ],
  };
  raw.miningEvents = {
    triggerChance: 0.1,
    events: [
      {
        id: 'rich-seam',
        name: 'Rich Seam',
        weight: 1,
        durationSeconds: 10,
        effects: { rewardMultiplier: 1.5, depositWeightMultipliers: {} },
      },
      {
        id: 'iron-rush',
        name: 'Iron Rush',
        weight: 1,
        durationSeconds: 20,
        eligibleMineIds: ['iron-mine'],
        effects: {
          rewardMultiplier: 2,
          depositWeightMultipliers: { 'iron-vein': 5 },
        },
      },
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
    gameVersion: '0.6.0',
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
  assert.equal(normalized.equipment.itemsById['iron-pickaxe'].requiresItemId, 'starter-pickaxe');
  assert.equal(normalized.store.categories[0].equipmentIds.length, 4);
  assert.equal(normalized.lottery.scratchTicketsById['test-scratch'].probabilityTotal, 1);
  assert.equal(normalized.lottery.scratchTicketsById['test-scratch'].expectedPayout, 3.5);
  assert.deepEqual(normalized.offlineProgress, {
    minimumAwaySeconds: 60,
    capSeconds: 36_000,
    maxBreaks: 100_000,
  });

  const broken = rawConfig();
  broken.deposits[0].resourceId = 'missing';
  broken.deposits[0].reward.max = -1;
  broken.skills[0].effect.amount = Number.POSITIVE_INFINITY;
  broken.story.milestones[0].trigger.type = 'javascript';
  broken.equipment.items[1].requiresItemId = 'missing';
  broken.store.categories[1].scratchTicketIds = ['missing'];
  broken.lottery.scratchTickets[0].prizes[0].probability = 0.4;
  broken.generators[1].unlock.requiredGeneratorId = 'missing';
  broken.businessUpgrades[1].effect.generatorId = 'missing';
  broken.generators[0].growthRate = Number.POSITIVE_INFINITY;
  broken.offlineProgress.capSeconds = Number.POSITIVE_INFINITY;
  assert.throws(
    () => normalizeIncrementalConfig(broken, { gameId: 'miner-incremental' }),
    /missing resource|reward\.max|effect\.amount|trigger\.type|missing item|missing scratch ticket|total exactly 1|missing generator|growthRate|offlineProgress\.capSeconds/,
  );

  const emptyCompanyLevels = rawConfig();
  emptyCompanyLevels.company.levels = [];
  assert.throws(
    () => normalizeIncrementalConfig(emptyCompanyLevels, { gameId: 'miner-incremental' }),
    /company\.levels must contain at least one/,
  );

  const invalidOfflineLimits = rawConfig();
  invalidOfflineLimits.offlineProgress.minimumAwaySeconds = 500;
  invalidOfflineLimits.offlineProgress.capSeconds = 300;
  invalidOfflineLimits.offlineProgress.maxBreaks = 1_000_001;
  assert.throws(
    () => normalizeIncrementalConfig(invalidOfflineLimits, { gameId: 'miner-incremental' }),
    /capSeconds must be at least|maxBreaks must not exceed/,
  );
});

test('mine, rare-find, and mining-event contracts validate references and select weighted content deterministically', () => {
  const progression = config(addMineProgressionContent);
  assert.equal(progression.minesById['iron-mine'].unlock.requiredMineId, 'test-mine');
  assert.equal(progression.rareFinds.baseChance, 0.2);
  assert.equal(progression.miningEvents.eventsById['iron-rush'].effects.depositWeightMultipliers['iron-vein'], 5);
  assert.equal(selectWeightedRareFind(progression, 'test-mine', () => 0.99).id, 'old-coin');
  assert.equal(selectWeightedRareFind(progression, 'iron-mine', () => 0.75).id, 'iron-specimen');
  assert.equal(selectWeightedMiningEvent(progression, 'test-mine', () => 0.99).id, 'rich-seam');
  assert.equal(selectWeightedMiningEvent(progression, 'iron-mine', () => 0.75).id, 'iron-rush');
  assert.equal(selectWeightedDeposit(progression, 'iron-mine', () => 0.2).id, 'stone-face');
  assert.equal(selectWeightedDeposit(
    progression,
    'iron-mine',
    () => 0.2,
    { 'iron-vein': 5 },
  ).id, 'iron-vein');

  const broken = rawConfig();
  addMineProgressionContent(broken);
  broken.mines[1].unlock.requiredMineId = 'missing-mine';
  broken.rareFinds.finds[1].reward.resourceId = 'missing-resource';
  broken.miningEvents.events[1].effects.depositWeightMultipliers = { 'missing-deposit': 2 };
  broken.miningEvents.triggerChance = Number.POSITIVE_INFINITY;
  assert.throws(
    () => normalizeIncrementalConfig(broken, { gameId: 'miner-incremental' }),
    /requires missing mine|missing resource|missing deposit|triggerChance/,
  );

  const forwardReference = rawConfig();
  addMineProgressionContent(forwardReference);
  forwardReference.mines[0].unlock.requiredMineId = 'iron-mine';
  assert.throws(
    () => normalizeIncrementalConfig(forwardReference, { gameId: 'miner-incremental' }),
    /starting mine must be unlocked|must require an earlier mine/,
  );
});

test('lottery prize tables total exactly and remain below ticket cost', () => {
  const ticket = config().lottery.scratchTicketsById['test-scratch'];
  assert.equal(ticket.prizes.reduce((sum, prize) => sum + prize.probability, 0), 1);
  assert.equal(ticket.expectedPayout, 3.5);
  assert.ok(ticket.expectedPayout < ticket.cost);
  assert.equal(rollScratchPrize(ticket, () => 0).id, 'none');
  assert.equal(rollScratchPrize(ticket, () => 0.5).id, 'cash');
  assert.equal(rollScratchPrize(ticket, () => 0.8).id, 'stone');
  assert.equal(rollScratchPrize(ticket, () => 0.99).id, 'free');

  const overpaying = rawConfig();
  overpaying.lottery.scratchTickets[0].prizes = [
    { id: 'certain-win', label: '$10', probability: 1, reward: { type: 'cash', amount: 10 } },
  ];
  assert.throws(
    () => normalizeIncrementalConfig(overpaying, { gameId: 'miner-incremental' }),
    /expected payout must be below/,
  );

  const circularEquipment = rawConfig();
  circularEquipment.equipment.items[0].requiresItemId = 'steel-pickaxe';
  assert.throws(
    () => normalizeIncrementalConfig(circularEquipment, { gameId: 'miner-incremental' }),
    /circular prerequisite chain/,
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
  game.state.character.skillPoints = 5;
  assert.equal(game.allocateSkill('automation-bonus').ok, true);
  assert.equal(game.allocateSkill('mining-power').ok, true);
  assert.equal(game.allocateSkill('critical-chance').ok, true);
  assert.equal(game.allocateSkill('critical-damage').ok, true);
  assert.equal(game.allocateSkill('ore-yield').ok, true);
  assert.equal(game.getManualPower(), 3);
  assert.equal(game.getMiningStats().automationBonus, 0.1);

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

test('independent miners can sell fixed quantities or all ore without producing negative resources', () => {
  const { game } = createGame();
  game.start();
  game.state.materials.stone = 12;
  assert.deepEqual(game.sellResource('stone', 1), { ok: false, reason: 'not-independent' });

  game.state.storyStage = 'independent';
  game.state.employment.active = false;
  assert.equal(game.sellResource('missing', 1).reason, 'unknown-resource');
  assert.equal(game.sellResource('stone', 0).reason, 'invalid-quantity');
  assert.equal(game.sellResource('stone', 13).reason, 'insufficient-resource');

  const first = game.sellResource('stone', 1);
  assert.equal(first.ok, true);
  assert.equal(first.proceeds, 10);
  assert.equal(first.remaining, 11);
  const ten = game.sellResource('stone', 10);
  assert.equal(ten.proceeds, 100);
  assert.equal(game.state.materials.stone, 1);
  const rest = game.sellResource('stone', 'all');
  assert.equal(rest.quantity, 1);
  assert.equal(rest.proceeds, 10);
  assert.equal(game.state.materials.stone, 0);
  assert.equal(game.state.cash, 120);
  assert.equal(game.state.statistics.totalOreSold, 12);
  assert.equal(game.state.statistics.lifetimeEarnings, 120);
  assert.equal(game.sellResource('stone', 'all').reason, 'nothing-to-sell');
});

test('equipment purchases validate cash and prerequisites while equipped bonuses affect mining stats', () => {
  const { game } = createGame();
  game.start();
  assert.deepEqual(game.state.ownedEquipment, ['starter-pickaxe']);
  assert.equal(game.state.equipment.tool, 'starter-pickaxe');
  assert.equal(game.getManualPower(), 2);
  assert.equal(game.purchaseEquipment('missing').reason, 'unknown-equipment');
  assert.equal(game.purchaseEquipment('steel-pickaxe').reason, 'missing-prerequisite');

  game.state.cash = 9;
  assert.equal(game.purchaseEquipment('iron-pickaxe').reason, 'insufficient-cash');
  assert.equal(game.state.cash, 9);
  game.state.cash = 18;
  const iron = game.purchaseEquipment('iron-pickaxe');
  assert.equal(iron.ok, true);
  assert.equal(iron.equipped, true);
  assert.equal(game.state.cash, 8);
  assert.equal(game.state.equipment.tool, 'iron-pickaxe');
  assert.equal(game.getManualPower(), 4);
  assert.equal(game.purchaseEquipment('iron-pickaxe').reason, 'already-owned');

  const gloves = game.purchaseEquipment('work-gloves');
  assert.equal(gloves.ok, true);
  assert.equal(game.state.cash, 0);
  assert.equal(game.getMiningStats().criticalChance, 0.25);
  assert.equal(game.equipItem('steel-pickaxe').reason, 'not-owned');
  const starter = game.equipItem('starter-pickaxe');
  assert.equal(starter.ok, true);
  assert.equal(game.getManualPower(), 2);
  assert.equal(game.equipItem('starter-pickaxe').reason, 'already-equipped');

  const hiddenConfig = config((raw) => {
    raw.equipment.items.push({
      id: 'reward-pickaxe',
      name: 'Reward Pickaxe',
      slotId: 'tool',
      cost: 1,
      bonuses: [{ type: 'manual-power-flat', amount: 20, label: '+20 power' }],
    });
  });
  const { game: hiddenGame } = createGame(hiddenConfig);
  hiddenGame.start();
  hiddenGame.state.cash = 100;
  assert.equal(hiddenGame.purchaseEquipment('reward-pickaxe').reason, 'not-for-sale');
});

test('scratch tickets cannot overspend and deterministic prizes update only valid save fields', () => {
  const { game } = createGame(config(), { random: () => 0.8 });
  game.start();
  assert.equal(game.buyScratchTicket('missing').reason, 'unknown-ticket');
  assert.deepEqual(game.buyScratchTicket('test-scratch'), {
    ok: false, reason: 'insufficient-cash', ticketId: 'test-scratch', cost: 10, cash: 0,
  });
  assert.equal(game.state.cash, 0);
  assert.equal(game.state.statistics.lotteryTicketsPurchased, 0);

  game.state.cash = 10;
  const bought = game.buyScratchTicket('test-scratch');
  assert.equal(bought.ok, true);
  assert.equal(game.state.cash, 0);
  assert.deepEqual(game.state.lotteryState.scratchTickets, ['test-scratch']);
  assert.equal(game.state.statistics.lotteryTicketsPurchased, 1);
  const revealed = game.scratchTicket('test-scratch');
  assert.equal(revealed.prizeId, 'stone');
  assert.equal(game.state.materials.stone, 1);
  assert.equal(game.state.statistics.lotteryWinnings, 10);
  assert.equal(game.state.statistics.largestLotteryWin, 10);
  assert.deepEqual(game.state.lotteryState.scratchTickets, []);
  assert.equal(game.scratchTicket('test-scratch').reason, 'ticket-not-owned');
  assert.ok(game.state.cash >= 0);
  assert.ok(game.state.materials.stone >= 0);

  const { game: freeTicketGame } = createGame(config(), { random: () => 0.99 });
  freeTicketGame.start();
  freeTicketGame.state.cash = 10;
  freeTicketGame.buyScratchTicket('test-scratch');
  const free = freeTicketGame.scratchTicket('test-scratch');
  assert.equal(free.prizeId, 'free');
  assert.deepEqual(freeTicketGame.state.lotteryState.scratchTickets, ['test-scratch']);
  assert.equal(freeTicketGame.state.statistics.lotteryTicketsPurchased, 1);

  const { game: cashGame } = createGame(config(), { random: () => 0.5 });
  cashGame.start();
  cashGame.state.cash = 10;
  cashGame.buyScratchTicket('test-scratch');
  assert.equal(cashGame.scratchTicket('test-scratch').prizeId, 'cash');
  assert.equal(cashGame.state.cash, 4);

  const hiddenLotteryConfig = config((raw) => {
    raw.lottery.scratchTickets.push({
      id: 'reward-scratch',
      name: 'Reward Scratch',
      cost: 10,
      prizes: [{ id: 'none', label: 'No prize', probability: 1, reward: { type: 'none' } }],
    });
  });
  const { game: hiddenLotteryGame } = createGame(hiddenLotteryConfig);
  hiddenLotteryGame.start();
  hiddenLotteryGame.state.cash = 10;
  assert.equal(hiddenLotteryGame.buyScratchTicket('reward-scratch').reason, 'not-for-sale');
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

test('company creation validates independence, level, name, and cash before recording a safe name', () => {
  const { game } = createGame(config(), { clock: () => 1_234 });
  game.start();
  assert.equal(game.createCompany('Test Mining').reason, 'not-independent');

  game.state.storyStage = 'independent';
  game.state.employment.active = false;
  game.state.cash = 100;
  assert.equal(game.createCompany('Test Mining').reason, 'level-required');
  game.state.character.level = 2;
  assert.equal(game.createCompany('X').reason, 'invalid-name');
  game.state.cash = 99;
  assert.equal(game.createCompany('Test Mining').reason, 'insufficient-cash');

  game.state.cash = 100;
  const created = game.createCompany('  Test\u0000   Mining  ');
  assert.equal(created.ok, true);
  assert.equal(created.name, 'Test Mining');
  assert.equal(game.state.cash, 0);
  assert.equal(game.state.company.created, true);
  assert.equal(game.state.company.name, 'Test Mining');
  assert.equal(game.state.company.level, 1);
  assert.equal(game.state.company.createdAt, 1_234);
  assert.equal(game.state.company.lifetimeInvestment, 0);
  assert.equal(game.state.storyStage, 'company-owner');
  assert.equal(game.createCompany('Again').reason, 'already-created');
});

test('generator costs scale predictably and purchases drive workers and company levels', () => {
  assert.equal(scaledPurchaseCost(10, 1.5, 0), 10);
  assert.equal(scaledPurchaseCost(10, 1.5, 1), 15);
  assert.equal(scaledPurchaseCost(10, 1.5, 2), 23);
  assert.equal(scaledPurchaseCost(Number.MAX_SAFE_INTEGER, 2, 100), Number.MAX_SAFE_INTEGER);

  const { game } = createGame();
  game.start();
  assert.equal(game.purchaseGenerator('missing').reason, 'unknown-generator');
  assert.equal(game.purchaseGenerator('hired-miner').reason, 'company-required');
  game.state.storyStage = 'independent';
  game.state.employment.active = false;
  game.state.character.level = 2;
  game.state.cash = 1_000;
  game.createCompany('Test Mining');

  assert.equal(game.purchaseGenerator('test-crew').reason, 'company-level');
  const first = game.purchaseGenerator('hired-miner');
  assert.equal(first.ok, true);
  assert.equal(first.cost, 10);
  assert.equal(first.nextCost, 15);
  assert.equal(game.state.generators['hired-miner'], 1);
  assert.equal(game.state.statistics.workersHired, 1);
  assert.equal(game.state.company.lifetimeInvestment, 10);
  assert.equal(game.purchaseGenerator('test-crew').reason, 'company-level');

  const training = game.purchaseBusinessUpgrade('worker-training');
  assert.equal(training.ok, true);
  assert.equal(training.cost, 20);
  assert.equal(training.rank, 1);
  assert.equal(training.nextCost, 40);
  assert.equal(game.state.company.level, 2);
  assert.equal(game.purchaseGenerator('test-crew').reason, 'generator-required');

  const second = game.purchaseGenerator('hired-miner');
  assert.equal(second.cost, 15);
  const crew = game.purchaseGenerator('test-crew');
  assert.equal(crew.ok, true);
  assert.equal(crew.cost, 40);
  assert.equal(game.state.statistics.workersHired, 5);
  assert.equal(game.state.company.lifetimeInvestment, 85);
  assert.equal(game.state.cash, 815);
  assert.ok(Object.values(game.state.generators).every((owned) => owned >= 0));
});

test('business upgrades and automation damage the active deposit while manual mining owns XP progression', () => {
  const { game } = createGame();
  game.start();
  game.state.storyStage = 'independent';
  game.state.employment.active = false;
  game.state.character.level = 2;
  game.state.character.skillPoints = 1;
  game.state.cash = 1_000;
  game.createCompany('Test Mining');
  game.purchaseGenerator('hired-miner');

  const firstTick = game.update(2);
  assert.equal(firstTick.automation.damage, 2);
  assert.equal(firstTick.automation.depositsBroken, 0);
  assert.equal(game.state.currentDeposit.hp, 2);
  assert.equal(game.state.character.xp, 0);
  assert.equal(game.state.materials.stone, 0);

  const secondTick = game.update(2);
  assert.equal(secondTick.automation.depositsBroken, 1);
  assert.equal(secondTick.automation.resources.stone, 2);
  assert.equal(game.state.materials.stone, 2);
  assert.equal(game.state.character.xp, 0);
  assert.equal(game.state.statistics.totalAutomatedProduction, 2);
  assert.equal(game.state.statistics.totalDepositsBroken, 1);
  assert.equal(game.state.statistics.totalManualSwings, 0);
  assert.deepEqual(game.state.mineProgress['test-mine'], { depositsBroken: 1, oreMined: 2 });
  assert.deepEqual(game.state.currentDeposit, { id: 'stone-face', hp: 4, maxHp: 4 });

  assert.equal(game.allocateSkill('automation-bonus').ok, true);
  assert.equal(game.purchaseBusinessUpgrade('worker-training').ok, true);
  assert.equal(game.getAutomationPower(), 1.35);
  assert.equal(game.purchaseBusinessUpgrade('worker-training').ok, true);
  assert.equal(game.purchaseBusinessUpgrade('worker-training').reason, 'max-rank');
  assert.equal(game.getAutomationPower(), 1.6);

  game.purchaseGenerator('hired-miner');
  game.purchaseGenerator('test-crew');
  assert.equal(game.purchaseBusinessUpgrade('crew-tools').ok, true);
  assert.ok(Math.abs(game.getAutomationPower() - 15.2) < 1e-9);

  game.state.currentDeposit.hp = 2;
  const manualBreak = game.mine();
  assert.equal(manualBreak.source, 'manual');
  assert.equal(manualBreak.xp, 5);
  assert.equal(game.state.character.xp, 5);
  assert.equal(game.state.statistics.totalManualSwings, 1);
  assert.ok(Object.values(game.state.materials).every((quantity) => quantity >= 0));
});

test('mine unlocks combine independence, character, company, prior-mine, and cash requirements', () => {
  const progression = config((raw) => {
    addMineProgressionContent(raw);
    raw.rareFinds.baseChance = 0;
    raw.miningEvents.triggerChance = 0;
  });
  const { game } = createGame(progression);
  game.start();
  assert.equal(game.selectMine('iron-mine').reason, 'locked-mine');
  assert.equal(game.state.currentMine, 'test-mine');

  game.mine();
  game.mine();
  game.mine();
  game.mine();
  assert.deepEqual(game.state.mineProgress['test-mine'], { depositsBroken: 2, oreMined: 4 });
  assert.equal(game.getMineUnlockStatus('iron-mine').reason, 'independence');
  assert.equal(game.unlockMine('iron-mine').unlocked, false);

  game.state.storyStage = 'independent';
  game.state.employment.active = false;
  assert.equal(game.getMineUnlockStatus('iron-mine').reason, 'characterLevel');
  game.state.character.level = 3;
  assert.equal(game.getMineUnlockStatus('iron-mine').reason, 'companyLevel');
  game.state.company = {
    created: true,
    name: 'Progression Mining',
    level: 2,
    reputation: 0,
    createdAt: 1_000,
    lifetimeInvestment: 30,
  };
  game.state.storyStage = 'company-owner';
  assert.equal(game.getMineUnlockStatus('iron-mine').reason, 'cash');
  game.state.cash = 100;

  const status = game.getMineUnlockStatus('iron-mine');
  assert.equal(status.canUnlock, true);
  const unlocked = game.unlockMine('iron-mine');
  assert.equal(unlocked.ok, true);
  assert.equal(unlocked.cost, 30);
  assert.equal(game.state.cash, 70);
  assert.deepEqual(game.state.unlockedMines, ['test-mine', 'iron-mine']);
  assert.equal(game.state.statistics.minesUnlocked, 2);
  assert.equal(game.unlockMine('iron-mine').reason, 'already-unlocked');

  const selected = game.selectMine('iron-mine');
  assert.equal(selected.ok, true);
  assert.equal(game.state.currentMine, 'iron-mine');
  assert.ok(progression.minesById['iron-mine'].depositIds.includes(game.state.currentDeposit.id));
  assert.equal(game.selectMine('missing').reason, 'unknown-mine');
});

test('manual rare finds use injected randomness, skill chance, and package-defined rewards', () => {
  const progression = config((raw) => {
    addMineProgressionContent(raw);
    raw.miningEvents.triggerChance = 0;
  });
  const { game } = createGame(progression, { random: () => 0 });
  game.start();
  assert.equal(game.getMiningStats().rareFindChance, 0.2);
  game.state.character.skillPoints = 1;
  assert.equal(game.allocateSkill('rare-find').ok, true);
  assert.equal(game.getMiningStats().rareFindChance, 0.45);

  game.mine();
  const result = game.mine();
  assert.equal(result.type, 'break');
  assert.equal(result.rareFind.id, 'old-coin');
  assert.equal(result.rareFind.value, 15);
  assert.equal(game.state.cash, 17);
  assert.equal(game.state.statistics.rareFindsDiscovered, 1);
  assert.equal(game.state.statistics.lifetimeEarnings, 17);
  assert.equal(game.state.activeMiningEvent, null);

  const resourceConfig = config((raw) => {
    addMineProgressionContent(raw);
    raw.deposits[0].maxHp = 2;
    raw.rareFinds.baseChance = 1;
    raw.rareFinds.maxChance = 1;
    raw.rareFinds.finds = [{
      id: 'iron-specimen',
      name: 'Iron Specimen',
      weight: 1,
      reward: { type: 'resource', resourceId: 'iron', amount: 2 },
    }];
    raw.miningEvents.triggerChance = 0;
  });
  const { game: resourceGame } = createGame(resourceConfig, { random: () => 0 });
  resourceGame.start();
  const employeeFind = resourceGame.mine();
  assert.equal(employeeFind.rareFind.destination, 'employer');
  assert.equal(resourceGame.state.employment.companyResources.iron, 2);
  assert.equal(resourceGame.state.materials.iron, 0);
  resourceGame.state.storyStage = 'independent';
  resourceGame.state.employment.active = false;
  const independentFind = resourceGame.mine();
  assert.equal(independentFind.rareFind.destination, 'player');
  assert.equal(resourceGame.state.materials.iron, 2);
});

test('timed mining events affect subsequent deposit rewards and expire through the game loop', () => {
  const progression = config((raw) => {
    addMineProgressionContent(raw);
    raw.deposits[0].maxHp = 2;
    raw.rareFinds.baseChance = 0;
    raw.miningEvents.triggerChance = 1;
  });
  const { game } = createGame(progression, { random: () => 0 });
  const ended = [];
  game.subscribe((event) => {
    if (event.type === 'mining-event-ended') ended.push(event.detail.id);
  });
  game.start();

  const first = game.mine();
  assert.equal(first.eventStarted.id, 'rich-seam');
  assert.equal(first.quantity, 2);
  assert.equal(game.getActiveMiningEvent().remainingSeconds, 10);
  assert.equal(game.state.statistics.miningEventsTriggered, 1);

  const second = game.mine();
  assert.equal(second.rewardMultiplier, 1.5);
  assert.equal(second.eventBonusQuantity, 1);
  assert.equal(second.quantity, 3);
  assert.equal(second.eventStarted, null);
  game.update(4);
  assert.equal(game.getActiveMiningEvent().remainingSeconds, 6);
  game.update(6);
  assert.equal(game.getActiveMiningEvent(), null);
  assert.deepEqual(ended, ['rich-seam']);
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

test('offline time windows ignore short and future gaps while capping enormous elapsed time', () => {
  const settings = { minimumAwaySeconds: 60, capSeconds: 36_000 };
  assert.deepEqual(calculateOfflineWindow(1_000, 60_000, settings), {
    timeAwaySeconds: 59,
    creditedSeconds: 0,
    minimumAwaySeconds: 60,
    capSeconds: 36_000,
    eligible: false,
    capped: false,
    reason: 'below-minimum',
  });
  assert.deepEqual(calculateOfflineWindow(10_000, 9_000, settings), {
    timeAwaySeconds: 0,
    creditedSeconds: 0,
    minimumAwaySeconds: 60,
    capSeconds: 36_000,
    eligible: false,
    capped: false,
    reason: 'future-timestamp',
  });
  const capped = calculateOfflineWindow(1_000, 1_000 + (10_000_000 * 1000), settings);
  assert.equal(capped.timeAwaySeconds, 10_000_000);
  assert.equal(capped.creditedSeconds, 36_000);
  assert.equal(capped.eligible, true);
  assert.equal(capped.capped, true);
});

test('offline automation resumes through deposits once, expires events, and records a return summary', () => {
  const progression = config(addMineProgressionContent);
  const now = 1_000_000;
  const snapshot = createInitialIncrementalSnapshot(progression, {
    now: now - 120_000,
    gameVersion: '0.6.0',
  });
  snapshot.storyStage = 'company-owner';
  snapshot.employment.active = false;
  snapshot.employment.contractBuyoutPaid = 50;
  snapshot.employment.endedAt = now - 500_000;
  snapshot.company = {
    created: true,
    name: 'Offline Test Mining',
    level: 1,
    reputation: 0,
    createdAt: now - 400_000,
    lifetimeInvestment: 0,
  };
  snapshot.generators['hired-miner'] = 1;
  snapshot.activeMiningEvent = { id: 'rich-seam', remainingSeconds: 10 };
  const saved = [];
  const { game } = createGame(progression, {
    clock: () => now,
    saveAdapter: {
      load: () => snapshot,
      save: (state) => {
        saved.push(JSON.parse(JSON.stringify(state)));
        return true;
      },
    },
  });

  const started = game.start();
  const offline = started.offlineProgress;
  assert.equal(started.source, 'save');
  assert.equal(offline.showSummary, true);
  assert.equal(offline.timeAwaySeconds, 120);
  assert.equal(offline.creditedSeconds, 120);
  assert.equal(offline.productionPower, 1);
  assert.equal(offline.damage, 120);
  assert.equal(offline.depositsBroken, 30);
  assert.deepEqual(offline.resources, { stone: 60 });
  assert.equal(offline.producedQuantity, 60);
  assert.equal(offline.estimatedValue, 600);
  assert.equal(offline.eventExpired.id, 'rich-seam');
  assert.equal(game.state.activeMiningEvent, null);
  assert.equal(game.state.materials.stone, 60);
  assert.equal(game.state.statistics.totalAutomatedProduction, 60);
  assert.equal(game.state.statistics.totalOfflineProduction, 60);
  assert.equal(game.state.statistics.totalOfflineTime, 120);
  assert.equal(game.state.statistics.offlineSessions, 1);
  assert.equal(game.state.statistics.miningEventsTriggered, 0);
  assert.equal(game.state.statistics.timePlayed, 0);
  assert.equal(game.state.lastPlayed, now);
  assert.equal(saved.at(-1).statistics.totalOfflineProduction, 60);

  const repeated = game.processOfflineProgress();
  assert.equal(repeated.processed, false);
  assert.equal(game.state.materials.stone, 60);
  assert.equal(game.state.statistics.offlineSessions, 1);
});

test('offline production obeys both the configured time cap and simulation break safety limit', () => {
  const limitedConfig = config((raw) => {
    raw.offlineProgress.capSeconds = 300;
    raw.offlineProgress.maxBreaks = 2;
  });
  const now = 20_000_000;
  const snapshot = createInitialIncrementalSnapshot(limitedConfig, {
    now: now - 10_000_000,
    gameVersion: '0.6.0',
  });
  snapshot.storyStage = 'company-owner';
  snapshot.employment.active = false;
  snapshot.company = {
    created: true,
    name: 'Limited Test Mining',
    level: 1,
    reputation: 0,
    createdAt: now - 11_000_000,
    lifetimeInvestment: 0,
  };
  snapshot.generators['hired-miner'] = 1;
  const { game } = createGame(limitedConfig, {
    clock: () => now,
    saveAdapter: { load: () => snapshot, save: () => true },
  });

  const offline = game.start().offlineProgress;
  assert.equal(offline.capped, true);
  assert.equal(offline.capSeconds, 300);
  assert.equal(offline.limited, true);
  assert.equal(offline.depositsBroken, 2);
  assert.equal(offline.damage, 8);
  assert.equal(offline.creditedSeconds, 8);
  assert.deepEqual(offline.resources, { stone: 4 });
  assert.equal(game.state.statistics.totalOfflineTime, 8);
});

test('future save timestamps reset safely without granting offline production', () => {
  const gameConfig = config();
  const now = 1_000_000;
  const snapshot = createInitialIncrementalSnapshot(gameConfig, {
    now: now + 60_000,
    gameVersion: '0.6.0',
  });
  snapshot.storyStage = 'company-owner';
  snapshot.employment.active = false;
  snapshot.company = {
    created: true,
    name: 'Clock Test Mining',
    level: 1,
    reputation: 0,
    createdAt: now - 1_000,
    lifetimeInvestment: 0,
  };
  snapshot.generators['hired-miner'] = 1;
  const { game } = createGame(gameConfig, {
    clock: () => now,
    saveAdapter: { load: () => snapshot, save: () => true },
  });

  const offline = game.start().offlineProgress;
  assert.equal(offline.reason, 'future-timestamp');
  assert.equal(offline.timestampReset, true);
  assert.equal(offline.showSummary, false);
  assert.equal(game.state.lastPlayed, now);
  assert.equal(game.state.materials.stone, 0);
  assert.equal(game.state.statistics.totalOfflineProduction, 0);
  assert.equal(game.state.statistics.offlineSessions, 0);
});

test('incremental saves round trip, migrate v1-v5 saves, and reject malformed or future data', (t) => {
  const originalWindow = globalThis.window;
  t.after(() => { globalThis.window = originalWindow; });
  globalThis.window = { location: { href: 'http://localhost/?game=miner-incremental' } };
  const local = storage();
  const snapshot = createInitialIncrementalSnapshot(config(), { now: 1234, gameVersion: '0.6.0' });

  assert.equal(saveIncrementalGame(snapshot, 1, { storage: local, now: 1234 }), true);
  assert.ok(local.values.has('pixel_engine_save_miner-incremental_slot_1'));
  assert.deepEqual(loadIncrementalGame(1, { storage: local }), snapshot);

  const negative = JSON.parse(JSON.stringify(snapshot));
  negative.materials.stone = -1;
  assert.equal(validateIncrementalSnapshot(negative), false);
  const negativeGenerator = JSON.parse(JSON.stringify(snapshot));
  negativeGenerator.generators['hired-miner'] = -1;
  assert.equal(validateIncrementalSnapshot(negativeGenerator), false);
  const negativeMineProgress = JSON.parse(JSON.stringify(snapshot));
  negativeMineProgress.mineProgress['test-mine'].depositsBroken = -1;
  assert.equal(validateIncrementalSnapshot(negativeMineProgress), false);
  const malformedEvent = JSON.parse(JSON.stringify(snapshot));
  malformedEvent.activeMiningEvent = { id: 'rich-seam', remainingSeconds: Number.POSITIVE_INFINITY };
  assert.equal(validateIncrementalSnapshot(malformedEvent), false);
  const negativeOfflineProduction = JSON.parse(JSON.stringify(snapshot));
  negativeOfflineProduction.statistics.totalOfflineProduction = -1;
  assert.equal(validateIncrementalSnapshot(negativeOfflineProduction), false);
  const fractionalOfflineSessions = JSON.parse(JSON.stringify(snapshot));
  fractionalOfflineSessions.statistics.offlineSessions = 0.5;
  assert.equal(validateIncrementalSnapshot(fractionalOfflineSessions), false);
  local.setItem('pixel_engine_save_miner-incremental_slot_1', JSON.stringify({
    version: INCREMENTAL_SAVE_VERSION,
    gameType: 'incremental',
    gameId: 'miner-incremental',
    slot: 1,
    payload: negative,
  }));
  assert.equal(loadIncrementalGame(1, { storage: local }), null);

  const businessSnapshot = JSON.parse(JSON.stringify(snapshot));
  businessSnapshot.storyStage = 'company-owner';
  businessSnapshot.employment.active = false;
  businessSnapshot.company = {
    created: true,
    name: 'Round Trip Mining',
    level: 2,
    reputation: 0,
    createdAt: 1234,
    lifetimeInvestment: 30,
  };
  businessSnapshot.generators['hired-miner'] = 2;
  businessSnapshot.businessUpgrades['worker-training'] = 1;
  assert.equal(saveIncrementalGame(businessSnapshot, 1, { storage: local, now: 1234 }), true);
  assert.deepEqual(loadIncrementalGame(1, { storage: local }), businessSnapshot);

  const unknownEquipment = JSON.parse(JSON.stringify(snapshot));
  unknownEquipment.ownedEquipment.push('forged-client-item');
  assert.equal(validateIncrementalSnapshot(unknownEquipment), true);
  const { game: incompatibleGame } = createGame(config(), {
    saveAdapter: { load: () => unknownEquipment, save: () => true },
  });
  assert.equal(incompatibleGame.start().source, 'invalid-save');

  const legacy = JSON.parse(JSON.stringify(snapshot));
  legacy.saveVersion = 1;
  delete legacy.ownedEquipment;
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
  assert.equal(migratedLegacy.saveVersion, 6);
  assert.deepEqual(migratedLegacy.ownedEquipment, ['starter-pickaxe']);
  assert.equal(migratedLegacy.employment.active, true);
  assert.equal(migratedLegacy.employment.contractBuyoutPaid, 0);
  assert.equal(migratedLegacy.employment.endedAt, null);
  assert.equal(migratedLegacy.company.createdAt, null);
  assert.equal(migratedLegacy.company.lifetimeInvestment, 0);
  assert.ok(normalizeIncrementalSaveEnvelope(legacyEnvelope, {
    gameId: 'miner-incremental', slot: 1,
  }));

  const milestoneTwo = JSON.parse(JSON.stringify(snapshot));
  milestoneTwo.saveVersion = 2;
  milestoneTwo.equipment = {};
  delete milestoneTwo.ownedEquipment;
  const migratedMilestoneTwo = migrateIncrementalSnapshot(milestoneTwo);
  assert.equal(migratedMilestoneTwo.saveVersion, 6);
  assert.deepEqual(migratedMilestoneTwo.ownedEquipment, []);
  let reconciledSave = null;
  const { game: reconciledGame } = createGame(config(), {
    saveAdapter: {
      load: () => migratedMilestoneTwo,
      save: (state) => { reconciledSave = JSON.parse(JSON.stringify(state)); return true; },
    },
  });
  assert.equal(reconciledGame.start().source, 'save');
  assert.equal(reconciledGame.state.gameVersion, '0.6.0');
  assert.deepEqual(reconciledGame.state.ownedEquipment, ['starter-pickaxe']);
  assert.equal(reconciledGame.state.equipment.tool, 'starter-pickaxe');
  assert.deepEqual(reconciledSave.ownedEquipment, ['starter-pickaxe']);

  const milestoneThree = JSON.parse(JSON.stringify(snapshot));
  milestoneThree.saveVersion = 3;
  milestoneThree.generators = {};
  milestoneThree.businessUpgrades = {};
  delete milestoneThree.company.createdAt;
  delete milestoneThree.company.lifetimeInvestment;
  const migratedMilestoneThree = migrateIncrementalSnapshot(milestoneThree);
  assert.equal(migratedMilestoneThree.saveVersion, 6);
  assert.equal(migratedMilestoneThree.company.createdAt, null);
  assert.equal(migratedMilestoneThree.company.lifetimeInvestment, 0);
  const { game: milestoneFourGame } = createGame(config(), {
    saveAdapter: { load: () => migratedMilestoneThree, save: () => true },
  });
  assert.equal(milestoneFourGame.start().source, 'save');
  assert.deepEqual(milestoneFourGame.state.generators, { 'hired-miner': 0, 'test-crew': 0 });
  assert.deepEqual(milestoneFourGame.state.businessUpgrades, { 'worker-training': 0, 'crew-tools': 0 });

  const milestoneFour = JSON.parse(JSON.stringify(snapshot));
  milestoneFour.saveVersion = 4;
  milestoneFour.statistics.totalDepositsBroken = 12;
  milestoneFour.statistics.totalOreMined = 34;
  delete milestoneFour.mineProgress;
  delete milestoneFour.activeMiningEvent;
  delete milestoneFour.statistics.rareFindsDiscovered;
  delete milestoneFour.statistics.miningEventsTriggered;
  const migratedMilestoneFour = migrateIncrementalSnapshot(milestoneFour);
  assert.equal(migratedMilestoneFour.saveVersion, 6);
  assert.deepEqual(migratedMilestoneFour.mineProgress['test-mine'], {
    depositsBroken: 12,
    oreMined: 34,
  });
  assert.equal(migratedMilestoneFour.activeMiningEvent, null);
  assert.equal(migratedMilestoneFour.statistics.rareFindsDiscovered, 0);
  assert.equal(migratedMilestoneFour.statistics.miningEventsTriggered, 0);

  const milestoneFive = JSON.parse(JSON.stringify(snapshot));
  milestoneFive.saveVersion = 5;
  delete milestoneFive.statistics.totalOfflineProduction;
  delete milestoneFive.statistics.totalOfflineTime;
  delete milestoneFive.statistics.offlineSessions;
  const migratedMilestoneFive = migrateIncrementalSnapshot(milestoneFive);
  assert.equal(migratedMilestoneFive.saveVersion, 6);
  assert.equal(migratedMilestoneFive.statistics.totalOfflineProduction, 0);
  assert.equal(migratedMilestoneFive.statistics.totalOfflineTime, 0);
  assert.equal(migratedMilestoneFive.statistics.offlineSessions, 0);

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
  assert.equal(migrateIncrementalSnapshot(versionZero).saveVersion, 6);
});

test('Milestone 4 saves reconcile new resources, skills, mines, and progress without resetting the player', () => {
  const oldSnapshot = createInitialIncrementalSnapshot(config(), {
    now: 1234,
    gameVersion: '0.4.0',
  });
  oldSnapshot.cash = 321;
  oldSnapshot.statistics.totalDepositsBroken = 7;
  oldSnapshot.statistics.totalOreMined = 14;
  oldSnapshot.saveVersion = 4;
  delete oldSnapshot.mineProgress;
  delete oldSnapshot.activeMiningEvent;
  delete oldSnapshot.statistics.rareFindsDiscovered;
  delete oldSnapshot.statistics.miningEventsTriggered;
  delete oldSnapshot.statistics.totalOfflineProduction;
  delete oldSnapshot.statistics.totalOfflineTime;
  delete oldSnapshot.statistics.offlineSessions;
  const migrated = migrateIncrementalSnapshot(oldSnapshot);
  const expanded = config(addMineProgressionContent);
  let reconciled = null;
  const { game } = createGame(expanded, {
    saveAdapter: {
      load: () => migrated,
      save: (state) => {
        reconciled = JSON.parse(JSON.stringify(state));
        return true;
      },
    },
  });

  assert.equal(game.start().source, 'save');
  assert.equal(game.state.cash, 321);
  assert.equal(game.state.gameVersion, '0.6.0');
  assert.equal(game.state.materials.iron, 0);
  assert.equal(game.state.statistics.resourceTotals.iron, 0);
  assert.equal(game.state.skills['rare-find'], 0);
  assert.deepEqual(game.state.mineProgress['test-mine'], { depositsBroken: 7, oreMined: 14 });
  assert.deepEqual(game.state.mineProgress['iron-mine'], { depositsBroken: 0, oreMined: 0 });
  assert.equal(game.state.statistics.totalOfflineProduction, 0);
  assert.equal(game.state.statistics.totalOfflineTime, 0);
  assert.equal(game.state.statistics.offlineSessions, 0);
  assert.equal(reconciled.cash, 321);
});

test('large values use compact readable formatting', () => {
  assert.equal(formatNumber(999), '999');
  assert.equal(formatNumber(1_250), '1.25K');
  assert.equal(formatNumber(4_800_000), '4.80M');
  assert.equal(formatNumber(2_310_000_000), '2.31B');
  assert.equal(formatCurrency(1_040_000_000_000), '$1.04T');
});

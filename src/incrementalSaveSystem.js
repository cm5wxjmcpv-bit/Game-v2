import { getActiveGameId } from './gameManifest.js';
import { getSaveStorageKey } from './saveNamespace.js';

export const INCREMENTAL_SAVE_VERSION = 7;
const DEFAULT_SLOT = 1;
const ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/i;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizedSlot(slot) {
  return Number.isInteger(slot) && slot > 0 ? slot : DEFAULT_SLOT;
}

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonnegativeFinite(value) {
  return Number.isFinite(value) && value >= 0;
}

function nonnegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function validId(value) {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

function validIdList(value) {
  return Array.isArray(value) && value.every(validId) && new Set(value).size === value.length;
}

function validNumberMap(value, integersOnly = false) {
  if (!plainObject(value)) return false;
  return Object.entries(value).every(([id, quantity]) => (
    validId(id) && (integersOnly ? nonnegativeInteger(quantity) : nonnegativeFinite(quantity))
  ));
}

function validMineProgressMap(value) {
  if (!plainObject(value)) return false;
  return Object.entries(value).every(([mineId, progress]) => (
    validId(mineId)
    && plainObject(progress)
    && Object.keys(progress).every((field) => ['depositsBroken', 'oreMined'].includes(field))
    && nonnegativeInteger(progress.depositsBroken)
    && nonnegativeFinite(progress.oreMined)
  ));
}

function validActiveMiningEvent(value) {
  return value === null || (
    plainObject(value)
    && Object.keys(value).every((field) => ['id', 'remainingSeconds'].includes(field))
    && validId(value.id)
    && Number.isFinite(value.remainingSeconds)
    && value.remainingSeconds > 0
  );
}

function resourceMap(config, initial = 0) {
  return Object.fromEntries(config.resources.map((resource) => [resource.id, initial]));
}

function skillMap(config) {
  return Object.fromEntries(config.skills.map((skill) => [skill.id, 0]));
}

function generatorMap(config) {
  return Object.fromEntries((config.generators || []).map((generator) => [generator.id, 0]));
}

function businessUpgradeMap(config) {
  return Object.fromEntries((config.businessUpgrades || []).map((upgrade) => [upgrade.id, 0]));
}

function mineProgressMap(config) {
  return Object.fromEntries(config.mines.map((mine) => [mine.id, {
    depositsBroken: 0,
    oreMined: 0,
  }]));
}

function startingEquipment(config) {
  const equipped = Object.fromEntries(config.equipment.slots.map((slot) => [slot.id, null]));
  config.equipment.items.forEach((item) => {
    if (item.startingEquipped) equipped[item.slotId] = item.id;
  });
  return equipped;
}

function startingOwnedEquipment(config) {
  return config.equipment.items.filter((item) => item.startingOwned).map((item) => item.id);
}

export function createInitialIncrementalSnapshot(config, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const deposit = config.depositsById[config.start.depositId];
  return {
    saveVersion: INCREMENTAL_SAVE_VERSION,
    gameVersion: String(options.gameVersion || '0.0.0'),
    cash: config.start.cash,
    character: {
      level: config.start.level,
      xp: config.start.xp,
      skillPoints: 0,
    },
    skills: skillMap(config),
    materials: resourceMap(config),
    ownedEquipment: startingOwnedEquipment(config),
    equipment: startingEquipment(config),
    currentMine: config.start.mineId,
    unlockedMines: [config.start.mineId],
    mineProgress: mineProgressMap(config),
    currentDeposit: {
      id: deposit.id,
      hp: deposit.maxHp,
      maxHp: deposit.maxHp,
    },
    generators: generatorMap(config),
    businessUpgrades: businessUpgradeMap(config),
    company: {
      created: false,
      name: '',
      level: 0,
      reputation: 0,
      createdAt: null,
      lifetimeInvestment: 0,
    },
    competition: {
      rivalId: config.competition.rival.id,
      acquired: false,
      acquiredAt: null,
      acquisitionPricePaid: 0,
    },
    employment: {
      companyId: config.employment.companyId,
      active: config.start.storyStage === 'employee',
      contractBuyoutPaid: 0,
      endedAt: null,
      companyResources: resourceMap(config),
      companyValue: 0,
      totalWages: 0,
    },
    storyStage: config.start.storyStage,
    milestones: [],
    lotteryState: {
      scratchTickets: [],
      drawingTickets: [],
    },
    activeMiningEvent: null,
    statistics: {
      totalManualSwings: 0,
      totalDepositsBroken: 0,
      totalOreMined: 0,
      totalOreSold: 0,
      lifetimeEarnings: 0,
      lotteryTicketsPurchased: 0,
      lotteryWinnings: 0,
      largestLotteryWin: 0,
      workersHired: 0,
      minesUnlocked: 1,
      rareFindsDiscovered: 0,
      miningEventsTriggered: 0,
      totalAutomatedProduction: 0,
      totalOfflineProduction: 0,
      totalOfflineTime: 0,
      offlineSessions: 0,
      companiesAcquired: 0,
      timePlayed: 0,
      resourceTotals: resourceMap(config),
    },
    lastPlayed: now,
  };
}

export function migrateIncrementalSnapshot(snapshot) {
  if (!plainObject(snapshot)) return null;
  let migrated;
  try {
    migrated = clone(snapshot);
  } catch {
    return null;
  }
  const version = Number.isInteger(migrated.saveVersion) ? migrated.saveVersion : 0;
  if (version > INCREMENTAL_SAVE_VERSION || version < 0) return null;

  if (version === 0) {
    migrated.saveVersion = 1;
    migrated.skills = plainObject(migrated.skills) ? migrated.skills : {};
    migrated.equipment = plainObject(migrated.equipment) ? migrated.equipment : {};
    migrated.generators = plainObject(migrated.generators) ? migrated.generators : {};
    migrated.businessUpgrades = plainObject(migrated.businessUpgrades) ? migrated.businessUpgrades : {};
    migrated.milestones = Array.isArray(migrated.milestones) ? migrated.milestones : [];
    migrated.lotteryState = plainObject(migrated.lotteryState)
      ? migrated.lotteryState
      : { scratchTickets: [], drawingTickets: [] };
  }

  if (migrated.saveVersion === 1) {
    const employment = plainObject(migrated.employment) ? migrated.employment : {};
    employment.active = migrated.storyStage === 'employee';
    employment.contractBuyoutPaid = 0;
    employment.endedAt = null;
    migrated.employment = employment;
    migrated.saveVersion = 2;
  }

  if (migrated.saveVersion === 2) {
    const equippedIds = plainObject(migrated.equipment)
      ? Object.values(migrated.equipment).filter(validId)
      : [];
    const previouslyOwned = Array.isArray(migrated.ownedEquipment)
      ? migrated.ownedEquipment.filter(validId)
      : [];
    migrated.ownedEquipment = [...new Set([...previouslyOwned, ...equippedIds])];
    migrated.saveVersion = 3;
  }

  if (migrated.saveVersion === 3) {
    migrated.generators = plainObject(migrated.generators) ? migrated.generators : {};
    migrated.businessUpgrades = plainObject(migrated.businessUpgrades) ? migrated.businessUpgrades : {};
    const company = plainObject(migrated.company) ? migrated.company : {};
    company.createdAt = company.createdAt === null || nonnegativeFinite(company.createdAt)
      ? company.createdAt
      : null;
    company.lifetimeInvestment = nonnegativeFinite(company.lifetimeInvestment)
      ? company.lifetimeInvestment
      : 0;
    migrated.company = company;
    migrated.saveVersion = 4;
  }

  if (migrated.saveVersion === 4) {
    const statistics = plainObject(migrated.statistics) ? migrated.statistics : {};
    const currentMine = validId(migrated.currentMine) ? migrated.currentMine : null;
    migrated.mineProgress = plainObject(migrated.mineProgress) ? migrated.mineProgress : {};
    if (currentMine && !plainObject(migrated.mineProgress[currentMine])) {
      migrated.mineProgress[currentMine] = {
        depositsBroken: nonnegativeInteger(statistics.totalDepositsBroken)
          ? statistics.totalDepositsBroken
          : 0,
        oreMined: nonnegativeFinite(statistics.totalOreMined) ? statistics.totalOreMined : 0,
      };
    }
    migrated.activeMiningEvent = null;
    statistics.rareFindsDiscovered = nonnegativeFinite(statistics.rareFindsDiscovered)
      ? statistics.rareFindsDiscovered
      : 0;
    statistics.miningEventsTriggered = nonnegativeFinite(statistics.miningEventsTriggered)
      ? statistics.miningEventsTriggered
      : 0;
    migrated.statistics = statistics;
    migrated.saveVersion = 5;
  }

  if (migrated.saveVersion === 5) {
    const statistics = plainObject(migrated.statistics) ? migrated.statistics : {};
    statistics.totalOfflineProduction = nonnegativeFinite(statistics.totalOfflineProduction)
      ? statistics.totalOfflineProduction
      : 0;
    statistics.totalOfflineTime = nonnegativeFinite(statistics.totalOfflineTime)
      ? statistics.totalOfflineTime
      : 0;
    statistics.offlineSessions = nonnegativeInteger(statistics.offlineSessions)
      ? statistics.offlineSessions
      : 0;
    migrated.statistics = statistics;
    migrated.saveVersion = 6;
  }

  if (migrated.saveVersion === 6) {
    const employment = plainObject(migrated.employment) ? migrated.employment : {};
    const competition = plainObject(migrated.competition) ? migrated.competition : {};
    competition.rivalId = validId(competition.rivalId)
      ? competition.rivalId
      : validId(employment.companyId)
        ? employment.companyId
        : 'rival-company';
    competition.acquired = competition.acquired === true;
    competition.acquiredAt = competition.acquired && nonnegativeFinite(competition.acquiredAt)
      ? competition.acquiredAt
      : null;
    competition.acquisitionPricePaid = competition.acquired
      && nonnegativeFinite(competition.acquisitionPricePaid)
      ? competition.acquisitionPricePaid
      : 0;
    migrated.competition = competition;
    const statistics = plainObject(migrated.statistics) ? migrated.statistics : {};
    statistics.companiesAcquired = nonnegativeInteger(statistics.companiesAcquired)
      ? statistics.companiesAcquired
      : competition.acquired
        ? 1
        : 0;
    migrated.statistics = statistics;
    migrated.saveVersion = 7;
  }

  return migrated;
}

export function validateIncrementalSnapshot(snapshot) {
  if (!plainObject(snapshot)) return false;
  if (snapshot.saveVersion !== INCREMENTAL_SAVE_VERSION) return false;
  if (typeof snapshot.gameVersion !== 'string' || !snapshot.gameVersion.trim() || snapshot.gameVersion.length > 40) return false;
  if (!nonnegativeFinite(snapshot.cash)) return false;

  const character = snapshot.character;
  if (!plainObject(character) || !Number.isInteger(character.level) || character.level < 1) return false;
  if (!nonnegativeFinite(character.xp) || !nonnegativeInteger(character.skillPoints)) return false;
  if (!validNumberMap(snapshot.skills, true)) return false;
  if (!validNumberMap(snapshot.materials)) return false;

  if (!validIdList(snapshot.ownedEquipment)) return false;
  if (!plainObject(snapshot.equipment)) return false;
  if (!Object.entries(snapshot.equipment).every(([slot, itemId]) => (
    validId(slot) && (itemId === null || (validId(itemId) && snapshot.ownedEquipment.includes(itemId)))
  ))) return false;
  if (!validId(snapshot.currentMine) || !validIdList(snapshot.unlockedMines) || !snapshot.unlockedMines.includes(snapshot.currentMine)) return false;
  if (!validMineProgressMap(snapshot.mineProgress)) return false;

  const deposit = snapshot.currentDeposit;
  if (!plainObject(deposit) || !validId(deposit.id)) return false;
  if (!(Number.isFinite(deposit.maxHp) && deposit.maxHp > 0)) return false;
  if (!(nonnegativeFinite(deposit.hp) && deposit.hp <= deposit.maxHp)) return false;

  if (!validNumberMap(snapshot.generators, true)) return false;
  if (!validNumberMap(snapshot.businessUpgrades, true)) return false;

  const company = snapshot.company;
  if (!plainObject(company) || typeof company.created !== 'boolean' || typeof company.name !== 'string' || company.name.length > 100) return false;
  if (!nonnegativeInteger(company.level) || !nonnegativeFinite(company.reputation)) return false;
  if (company.createdAt !== null && !nonnegativeFinite(company.createdAt)) return false;
  if (!nonnegativeFinite(company.lifetimeInvestment)) return false;

  const competition = snapshot.competition;
  if (!plainObject(competition) || !validId(competition.rivalId)) return false;
  if (typeof competition.acquired !== 'boolean') return false;
  if (competition.acquiredAt !== null && !nonnegativeFinite(competition.acquiredAt)) return false;
  if (!nonnegativeFinite(competition.acquisitionPricePaid)) return false;
  if (!competition.acquired
    && (competition.acquiredAt !== null || competition.acquisitionPricePaid !== 0)) return false;
  if (competition.acquired && competition.acquiredAt === null) return false;

  const employment = snapshot.employment;
  if (!plainObject(employment) || !validId(employment.companyId)) return false;
  if (typeof employment.active !== 'boolean') return false;
  if (!nonnegativeFinite(employment.contractBuyoutPaid)) return false;
  if (employment.endedAt !== null && !nonnegativeFinite(employment.endedAt)) return false;
  if (!validNumberMap(employment.companyResources)) return false;
  if (!nonnegativeFinite(employment.companyValue) || !nonnegativeFinite(employment.totalWages)) return false;

  if (!validId(snapshot.storyStage) || !validIdList(snapshot.milestones)) return false;
  if (!plainObject(snapshot.lotteryState)) return false;
  if (!Array.isArray(snapshot.lotteryState.scratchTickets) || !snapshot.lotteryState.scratchTickets.every(validId)) return false;
  if (!Array.isArray(snapshot.lotteryState.drawingTickets) || !snapshot.lotteryState.drawingTickets.every(validId)) return false;
  if (!validActiveMiningEvent(snapshot.activeMiningEvent)) return false;

  const statistics = snapshot.statistics;
  if (!plainObject(statistics) || !validNumberMap(statistics.resourceTotals)) return false;
  const statisticFields = [
    'totalManualSwings',
    'totalDepositsBroken',
    'totalOreMined',
    'totalOreSold',
    'lifetimeEarnings',
    'lotteryTicketsPurchased',
    'lotteryWinnings',
    'largestLotteryWin',
    'workersHired',
    'minesUnlocked',
    'rareFindsDiscovered',
    'miningEventsTriggered',
    'totalAutomatedProduction',
    'totalOfflineProduction',
    'totalOfflineTime',
    'offlineSessions',
    'companiesAcquired',
    'timePlayed',
  ];
  if (!statisticFields.every((field) => nonnegativeFinite(statistics[field]))) return false;
  if (!nonnegativeInteger(statistics.offlineSessions)
    || !nonnegativeInteger(statistics.companiesAcquired)) return false;
  return nonnegativeFinite(snapshot.lastPlayed);
}

export function makeIncrementalSaveEnvelope(snapshot, slot = DEFAULT_SLOT, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  return {
    version: INCREMENTAL_SAVE_VERSION,
    gameType: 'incremental',
    gameId: getActiveGameId(),
    slot: normalizedSlot(slot),
    checkpointAt: new Date(now).toISOString(),
    payload: snapshot,
  };
}

export function normalizeIncrementalSaveEnvelope(envelope, options = {}) {
  if (!plainObject(envelope) || envelope.gameType !== 'incremental') return null;
  const expectedSlot = normalizedSlot(options.slot);
  const expectedGameId = String(options.gameId || '').trim().toLowerCase();
  if (!Number.isInteger(envelope.version) || envelope.version < 1 || envelope.version > INCREMENTAL_SAVE_VERSION) return null;
  if (envelope.slot !== expectedSlot) return null;
  if (expectedGameId && envelope.gameId !== expectedGameId) return null;
  const migrated = migrateIncrementalSnapshot(envelope.payload);
  if (!validateIncrementalSnapshot(migrated)) return null;
  return { ...envelope, version: INCREMENTAL_SAVE_VERSION, payload: migrated };
}

export function saveIncrementalGame(snapshot, slot = DEFAULT_SLOT, options = {}) {
  const storage = options.storage || globalThis.localStorage;
  const migrated = migrateIncrementalSnapshot(snapshot);
  if (!storage || !validateIncrementalSnapshot(migrated)) return false;
  try {
    storage.setItem(
      getSaveStorageKey(slot),
      JSON.stringify(makeIncrementalSaveEnvelope(migrated, slot, options)),
    );
    return true;
  } catch {
    return false;
  }
}

export function loadIncrementalGame(slot = DEFAULT_SLOT, options = {}) {
  const storage = options.storage || globalThis.localStorage;
  if (!storage) return null;
  try {
    const safeSlot = normalizedSlot(slot);
    const raw = storage.getItem(getSaveStorageKey(safeSlot));
    if (!raw) return null;
    const normalized = normalizeIncrementalSaveEnvelope(JSON.parse(raw), {
      slot: safeSlot,
      gameId: getActiveGameId(),
    });
    return normalized?.payload || null;
  } catch {
    return null;
  }
}

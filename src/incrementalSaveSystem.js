import { getActiveGameId } from './gameManifest.js';
import { getSaveStorageKey } from './saveNamespace.js';

export const INCREMENTAL_SAVE_VERSION = 2;
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

function resourceMap(config, initial = 0) {
  return Object.fromEntries(config.resources.map((resource) => [resource.id, initial]));
}

function skillMap(config) {
  return Object.fromEntries(config.skills.map((skill) => [skill.id, 0]));
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
    equipment: {},
    currentMine: config.start.mineId,
    unlockedMines: [config.start.mineId],
    currentDeposit: {
      id: deposit.id,
      hp: deposit.maxHp,
      maxHp: deposit.maxHp,
    },
    generators: {},
    businessUpgrades: {},
    company: {
      created: false,
      name: '',
      level: 0,
      reputation: 0,
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
      totalAutomatedProduction: 0,
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

  if (!plainObject(snapshot.equipment)) return false;
  if (!Object.entries(snapshot.equipment).every(([slot, itemId]) => validId(slot) && (itemId === null || validId(itemId)))) return false;
  if (!validId(snapshot.currentMine) || !validIdList(snapshot.unlockedMines) || !snapshot.unlockedMines.includes(snapshot.currentMine)) return false;

  const deposit = snapshot.currentDeposit;
  if (!plainObject(deposit) || !validId(deposit.id)) return false;
  if (!(Number.isFinite(deposit.maxHp) && deposit.maxHp > 0)) return false;
  if (!(nonnegativeFinite(deposit.hp) && deposit.hp <= deposit.maxHp)) return false;

  if (!validNumberMap(snapshot.generators, true)) return false;
  if (!validNumberMap(snapshot.businessUpgrades, true)) return false;

  const company = snapshot.company;
  if (!plainObject(company) || typeof company.created !== 'boolean' || typeof company.name !== 'string' || company.name.length > 100) return false;
  if (!nonnegativeInteger(company.level) || !nonnegativeFinite(company.reputation)) return false;

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
    'totalAutomatedProduction',
    'timePlayed',
  ];
  if (!statisticFields.every((field) => nonnegativeFinite(statistics[field]))) return false;
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

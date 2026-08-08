const ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/i;
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export class IncrementalConfigError extends Error {
  constructor(errors) {
    super(`Invalid incremental game data:\n- ${errors.join('\n- ')}`);
    this.name = 'IncrementalConfigError';
    this.errors = errors;
  }
}

function text(value, fallback, maxLength = 160) {
  const normalized = String(value ?? fallback ?? '').trim();
  return normalized.slice(0, maxLength);
}

function color(value, fallback) {
  const normalized = String(value || '').trim();
  return HEX_COLOR_PATTERN.test(normalized) ? normalized.toLowerCase() : fallback;
}

function finite(value, fallback) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function nonnegative(value, fallback = 0) {
  return Math.max(0, finite(value, fallback));
}

function integer(value, fallback = 0, minimum = 0) {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized >= minimum ? normalized : fallback;
}

function normalizedId(value) {
  const id = String(value || '').trim().toLowerCase();
  return ID_PATTERN.test(id) ? id : '';
}

function uniqueIds(entries, label, errors) {
  const seen = new Set();
  entries.forEach((entry, index) => {
    if (!entry.id) errors.push(`${label}[${index}] has an invalid or missing id`);
    else if (seen.has(entry.id)) errors.push(`${label} contains duplicate id "${entry.id}"`);
    else seen.add(entry.id);
  });
  return seen;
}

export function normalizeIncrementalConfig(raw, options = {}) {
  const errors = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new IncrementalConfigError(['root value must be an object']);
  }

  const configId = normalizedId(raw.id);
  const expectedId = normalizedId(options.gameId);
  if (!configId) errors.push('id must be a safe non-empty identifier');
  if (expectedId && configId && configId !== expectedId) {
    errors.push(`id "${configId}" does not match package "${expectedId}"`);
  }
  if (raw.schemaVersion !== 1) {
    errors.push('schemaVersion must be the supported version 1');
  }

  const rawResources = Array.isArray(raw.resources) ? raw.resources : [];
  if (!rawResources.length) errors.push('resources must contain at least one entry');
  const resources = rawResources.map((entry, index) => {
    if (!isFiniteNumber(entry?.value) || entry.value < 0) {
      errors.push(`resources[${index}].value must be a finite nonnegative number`);
    }
    return {
      id: normalizedId(entry?.id),
      name: text(entry?.name, entry?.id || 'Resource', 80),
      value: nonnegative(entry?.value),
      color: color(entry?.color, '#94a3b8'),
      icon: text(entry?.icon, '◆', 8),
    };
  });
  const resourceIds = uniqueIds(resources, 'resources', errors);

  const rawDeposits = Array.isArray(raw.deposits) ? raw.deposits : [];
  if (!rawDeposits.length) errors.push('deposits must contain at least one entry');
  const deposits = rawDeposits.map((entry, index) => {
    if (!isFiniteNumber(entry?.maxHp) || entry.maxHp <= 0) {
      errors.push(`deposits[${index}].maxHp must be a finite positive number`);
    }
    if (!Number.isInteger(entry?.reward?.min) || entry.reward.min < 0) {
      errors.push(`deposits[${index}].reward.min must be a nonnegative integer`);
    }
    if (!Number.isInteger(entry?.reward?.max) || entry.reward.max < 0) {
      errors.push(`deposits[${index}].reward.max must be a nonnegative integer`);
    }
    if (!isFiniteNumber(entry?.xp) || entry.xp < 0) {
      errors.push(`deposits[${index}].xp must be a finite nonnegative number`);
    }
    if (!isFiniteNumber(entry?.weight) || entry.weight <= 0) {
      errors.push(`deposits[${index}].weight must be a finite positive number`);
    }
    const rewardMin = integer(entry?.reward?.min, 0);
    const rewardMax = integer(entry?.reward?.max, rewardMin);
    const maxHp = finite(entry?.maxHp, 0);
    const weight = finite(entry?.weight, 0);
    return {
      id: normalizedId(entry?.id),
      name: text(entry?.name, entry?.id || 'Deposit', 80),
      maxHp,
      resourceId: normalizedId(entry?.resourceId),
      reward: { min: rewardMin, max: rewardMax },
      xp: nonnegative(entry?.xp),
      weight,
      visual: {
        color: color(entry?.visual?.color, '#64748b'),
        accent: color(entry?.visual?.accent, '#cbd5e1'),
        icon: text(entry?.visual?.icon, '⛏', 8),
      },
    };
  });
  uniqueIds(deposits, 'deposits', errors);
  deposits.forEach((deposit) => {
    if (!(deposit.maxHp > 0)) errors.push(`deposit "${deposit.id || '(invalid)'}" maxHp must be positive`);
    if (!resourceIds.has(deposit.resourceId)) errors.push(`deposit "${deposit.id || '(invalid)'}" references missing resource "${deposit.resourceId || '(invalid)'}"`);
    if (deposit.reward.max < deposit.reward.min) errors.push(`deposit "${deposit.id || '(invalid)'}" reward.max must be at least reward.min`);
    if (!(deposit.weight > 0)) errors.push(`deposit "${deposit.id || '(invalid)'}" weight must be positive`);
  });
  const depositIds = new Set(deposits.map((entry) => entry.id).filter(Boolean));

  const rawMines = Array.isArray(raw.mines) ? raw.mines : [];
  if (!rawMines.length) errors.push('mines must contain at least one entry');
  const mines = rawMines.map((entry) => ({
    id: normalizedId(entry?.id),
    name: text(entry?.name, entry?.id || 'Mine', 80),
    description: text(entry?.description, '', 240),
    depositIds: Array.isArray(entry?.depositIds)
      ? entry.depositIds.map(normalizedId).filter(Boolean)
      : [],
  }));
  const mineIds = uniqueIds(mines, 'mines', errors);
  mines.forEach((mine) => {
    if (!mine.depositIds.length) errors.push(`mine "${mine.id || '(invalid)'}" must reference at least one deposit`);
    if (new Set(mine.depositIds).size !== mine.depositIds.length) errors.push(`mine "${mine.id || '(invalid)'}" contains duplicate deposit references`);
    mine.depositIds.forEach((depositId) => {
      if (!depositIds.has(depositId)) errors.push(`mine "${mine.id || '(invalid)'}" references missing deposit "${depositId}"`);
    });
  });

  const startMineId = normalizedId(raw.start?.mineId);
  const startDepositId = normalizedId(raw.start?.depositId);
  if (!mineIds.has(startMineId)) errors.push(`start.mineId references missing mine "${startMineId || '(invalid)'}"`);
  const startMine = mines.find((mine) => mine.id === startMineId);
  if (!depositIds.has(startDepositId) || !startMine?.depositIds.includes(startDepositId)) {
    errors.push(`start.depositId "${startDepositId || '(invalid)'}" is not available in the starting mine`);
  }
  if (!isFiniteNumber(raw.start?.cash) || raw.start.cash < 0) errors.push('start.cash must be a finite nonnegative number');
  if (!Number.isInteger(raw.start?.level) || raw.start.level < 1) errors.push('start.level must be a positive integer');
  if (!isFiniteNumber(raw.start?.xp) || raw.start.xp < 0) errors.push('start.xp must be a finite nonnegative number');
  const storyStage = normalizedId(raw.start?.storyStage);
  if (!storyStage) errors.push('start.storyStage must be a safe non-empty identifier');

  const employerId = normalizedId(raw.employment?.companyId);
  if (!employerId) errors.push('employment.companyId must be a safe non-empty identifier');

  const manualPower = finite(raw.balance?.manualPower, 0);
  const autosaveSeconds = finite(raw.balance?.autosaveSeconds, 0);
  const employeeWageShare = finite(raw.balance?.employeeWageShare, -1);
  const minimumWage = finite(raw.balance?.minimumWage, -1);
  if (!isFiniteNumber(raw.balance?.manualPower)) errors.push('balance.manualPower must be a finite number');
  if (!isFiniteNumber(raw.balance?.autosaveSeconds)) errors.push('balance.autosaveSeconds must be a finite number');
  if (!isFiniteNumber(raw.balance?.employeeWageShare)) errors.push('balance.employeeWageShare must be a finite number');
  if (!isFiniteNumber(raw.balance?.minimumWage)) errors.push('balance.minimumWage must be a finite number');
  if (!(manualPower > 0)) errors.push('balance.manualPower must be positive');
  if (!(autosaveSeconds > 0)) errors.push('balance.autosaveSeconds must be positive');
  if (employeeWageShare < 0 || employeeWageShare > 1) errors.push('balance.employeeWageShare must be between 0 and 1');
  if (minimumWage < 0) errors.push('balance.minimumWage must be nonnegative');

  const xpBase = finite(raw.progression?.xpBase, 0);
  const xpGrowth = finite(raw.progression?.xpGrowth, 0);
  if (!isFiniteNumber(raw.progression?.xpBase)) errors.push('progression.xpBase must be a finite number');
  if (!isFiniteNumber(raw.progression?.xpGrowth)) errors.push('progression.xpGrowth must be a finite number');
  if (!(xpBase > 0)) errors.push('progression.xpBase must be positive');
  if (!(xpGrowth >= 1)) errors.push('progression.xpGrowth must be at least 1');

  if (errors.length) throw new IncrementalConfigError(errors);

  return {
    schemaVersion: integer(raw.schemaVersion, 1, 1),
    id: configId,
    balance: {
      manualPower,
      autosaveSeconds,
      employeeWageShare,
      minimumWage,
    },
    progression: { xpBase, xpGrowth },
    start: {
      cash: nonnegative(raw.start?.cash),
      level: integer(raw.start?.level, 1, 1),
      xp: nonnegative(raw.start?.xp),
      mineId: startMineId,
      depositId: startDepositId,
      storyStage,
    },
    employment: {
      companyId: employerId,
      companyName: text(raw.employment?.companyName, 'Mining Company', 100),
      role: text(raw.employment?.role, 'Mine Worker', 100),
      foremanName: text(raw.employment?.foremanName, 'Foreman', 100),
    },
    ui: {
      title: text(raw.ui?.title, raw.name || configId, 100),
      subtitle: text(raw.ui?.subtitle, '', 220),
      instruction: text(raw.ui?.instruction, 'Tap the deposit to mine.', 220),
    },
    resources,
    deposits,
    mines,
    resourcesById: Object.fromEntries(resources.map((entry) => [entry.id, entry])),
    depositsById: Object.fromEntries(deposits.map((entry) => [entry.id, entry])),
    minesById: Object.fromEntries(mines.map((entry) => [entry.id, entry])),
  };
}

function safeRandom(random) {
  const value = Number(random());
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(0.999999999999, value));
}

export function selectWeightedDeposit(config, mineId, random = Math.random) {
  const mine = config.minesById[mineId];
  if (!mine) throw new Error(`Unknown mine "${mineId}".`);
  const deposits = mine.depositIds.map((id) => config.depositsById[id]);
  const totalWeight = deposits.reduce((sum, deposit) => sum + deposit.weight, 0);
  let roll = safeRandom(random) * totalWeight;
  for (const deposit of deposits) {
    roll -= deposit.weight;
    if (roll < 0) return deposit;
  }
  return deposits.at(-1);
}

export function rollDepositReward(deposit, random = Math.random) {
  const range = deposit.reward.max - deposit.reward.min + 1;
  return deposit.reward.min + Math.floor(safeRandom(random) * range);
}

export function xpRequiredForLevel(config, level) {
  const safeLevel = Math.max(1, integer(level, 1, 1));
  return Math.floor(config.progression.xpBase * (config.progression.xpGrowth ** (safeLevel - 1)));
}

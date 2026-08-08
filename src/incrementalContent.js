const ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/i;
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const SKILL_EFFECT_TYPES = new Set([
  'manual-power-flat',
  'mining-speed',
  'critical-chance',
  'critical-damage',
  'ore-yield-chance',
  'rare-find-chance',
  'automation-bonus',
]);
const STORY_TRIGGER_TYPES = new Set(['start', 'level', 'cash', 'stage', 'contract-affordable']);

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

function normalizeSkills(rawSkills, errors) {
  if (rawSkills !== undefined && !Array.isArray(rawSkills)) {
    errors.push('skills must be an array when provided');
  }
  const skills = (Array.isArray(rawSkills) ? rawSkills : []).map((entry, index) => {
    const effectType = normalizedId(entry?.effect?.type);
    if (!Number.isInteger(entry?.maxRank) || entry.maxRank < 1) {
      errors.push(`skills[${index}].maxRank must be a positive integer`);
    }
    if (!SKILL_EFFECT_TYPES.has(effectType)) {
      errors.push(`skills[${index}].effect.type is unsupported`);
    }
    if (!isFiniteNumber(entry?.effect?.amount) || entry.effect.amount < 0) {
      errors.push(`skills[${index}].effect.amount must be a finite nonnegative number`);
    }
    if (entry?.enabled !== undefined && typeof entry.enabled !== 'boolean') {
      errors.push(`skills[${index}].enabled must be a boolean when provided`);
    }
    return {
      id: normalizedId(entry?.id),
      name: text(entry?.name, entry?.id || 'Skill', 80),
      description: text(entry?.description, '', 240),
      maxRank: integer(entry?.maxRank, 1, 1),
      enabled: entry?.enabled !== false,
      unlockNote: text(entry?.unlockNote, '', 140),
      effect: {
        type: effectType,
        amount: nonnegative(entry?.effect?.amount),
        label: text(entry?.effect?.label, '', 120),
      },
    };
  });
  uniqueIds(skills, 'skills', errors);
  return skills;
}

function normalizeMilestones(rawStory, errors) {
  const rawMilestones = rawStory?.milestones;
  if (rawMilestones !== undefined && !Array.isArray(rawMilestones)) {
    errors.push('story.milestones must be an array when provided');
  }
  const milestones = (Array.isArray(rawMilestones) ? rawMilestones : []).map((entry, index) => {
    const triggerType = normalizedId(entry?.trigger?.type);
    const rawValue = entry?.trigger?.value;
    if (!STORY_TRIGGER_TYPES.has(triggerType)) {
      errors.push(`story.milestones[${index}].trigger.type is unsupported`);
    } else if (triggerType === 'level' && (!Number.isInteger(rawValue) || rawValue < 1)) {
      errors.push(`story.milestones[${index}].trigger.value must be a positive level`);
    } else if (triggerType === 'cash' && (!isFiniteNumber(rawValue) || rawValue < 0)) {
      errors.push(`story.milestones[${index}].trigger.value must be finite and nonnegative`);
    } else if (triggerType === 'stage' && !normalizedId(rawValue)) {
      errors.push(`story.milestones[${index}].trigger.value must be a safe stage id`);
    }
    return {
      id: normalizedId(entry?.id),
      title: text(entry?.title, 'Milestone', 100),
      speaker: text(entry?.speaker, '', 100),
      text: text(entry?.text, '', 360),
      trigger: {
        type: triggerType,
        value: triggerType === 'stage'
          ? normalizedId(rawValue)
          : triggerType === 'level'
            ? integer(rawValue, 1, 1)
            : triggerType === 'cash'
              ? nonnegative(rawValue)
              : null,
      },
    };
  });
  uniqueIds(milestones, 'story.milestones', errors);
  return milestones;
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
    return {
      id: normalizedId(entry?.id),
      name: text(entry?.name, entry?.id || 'Deposit', 80),
      maxHp: finite(entry?.maxHp, 0),
      resourceId: normalizedId(entry?.resourceId),
      reward: { min: rewardMin, max: rewardMax },
      xp: nonnegative(entry?.xp),
      weight: finite(entry?.weight, 0),
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
  const contractBuyoutCost = finite(raw.employment?.contractBuyoutCost, 5000);
  if (raw.employment?.contractBuyoutCost !== undefined
    && (!isFiniteNumber(raw.employment.contractBuyoutCost) || raw.employment.contractBuyoutCost < 0)) {
    errors.push('employment.contractBuyoutCost must be a finite nonnegative number');
  }

  const manualPower = finite(raw.balance?.manualPower, 0);
  const autosaveSeconds = finite(raw.balance?.autosaveSeconds, 0);
  const employeeWageShare = finite(raw.balance?.employeeWageShare, -1);
  const minimumWage = finite(raw.balance?.minimumWage, -1);
  const baseCriticalChance = finite(raw.balance?.baseCriticalChance, 0);
  const baseCriticalDamage = finite(raw.balance?.baseCriticalDamage, 2);
  const baseOreYieldChance = finite(raw.balance?.baseOreYieldChance, 0);
  ['manualPower', 'autosaveSeconds', 'employeeWageShare', 'minimumWage'].forEach((field) => {
    if (!isFiniteNumber(raw.balance?.[field])) errors.push(`balance.${field} must be a finite number`);
  });
  if (raw.balance?.baseCriticalChance !== undefined && !isFiniteNumber(raw.balance.baseCriticalChance)) errors.push('balance.baseCriticalChance must be a finite number');
  if (raw.balance?.baseCriticalDamage !== undefined && !isFiniteNumber(raw.balance.baseCriticalDamage)) errors.push('balance.baseCriticalDamage must be a finite number');
  if (raw.balance?.baseOreYieldChance !== undefined && !isFiniteNumber(raw.balance.baseOreYieldChance)) errors.push('balance.baseOreYieldChance must be a finite number');
  if (!(manualPower > 0)) errors.push('balance.manualPower must be positive');
  if (!(autosaveSeconds > 0)) errors.push('balance.autosaveSeconds must be positive');
  if (employeeWageShare < 0 || employeeWageShare > 1) errors.push('balance.employeeWageShare must be between 0 and 1');
  if (minimumWage < 0) errors.push('balance.minimumWage must be nonnegative');
  if (baseCriticalChance < 0 || baseCriticalChance > 1) errors.push('balance.baseCriticalChance must be between 0 and 1');
  if (baseCriticalDamage < 1) errors.push('balance.baseCriticalDamage must be at least 1');
  if (baseOreYieldChance < 0 || baseOreYieldChance > 1) errors.push('balance.baseOreYieldChance must be between 0 and 1');

  const xpBase = finite(raw.progression?.xpBase, 0);
  const xpGrowth = finite(raw.progression?.xpGrowth, 0);
  const skillPointsPerLevel = integer(raw.progression?.skillPointsPerLevel, 1, 1);
  const skillResetCostPerPoint = finite(raw.progression?.skillResetCostPerPoint, 25);
  if (!isFiniteNumber(raw.progression?.xpBase)) errors.push('progression.xpBase must be a finite number');
  if (!isFiniteNumber(raw.progression?.xpGrowth)) errors.push('progression.xpGrowth must be a finite number');
  if (raw.progression?.skillPointsPerLevel !== undefined
    && (!Number.isInteger(raw.progression.skillPointsPerLevel) || raw.progression.skillPointsPerLevel < 1)) {
    errors.push('progression.skillPointsPerLevel must be a positive integer');
  }
  if (raw.progression?.skillResetCostPerPoint !== undefined
    && (!isFiniteNumber(raw.progression.skillResetCostPerPoint) || raw.progression.skillResetCostPerPoint < 0)) {
    errors.push('progression.skillResetCostPerPoint must be a finite nonnegative number');
  }
  if (!(xpBase > 0)) errors.push('progression.xpBase must be positive');
  if (!(xpGrowth >= 1)) errors.push('progression.xpGrowth must be at least 1');

  const skills = normalizeSkills(raw.skills, errors);
  const milestones = normalizeMilestones(raw.story, errors);

  if (errors.length) throw new IncrementalConfigError(errors);

  return {
    schemaVersion: integer(raw.schemaVersion, 1, 1),
    id: configId,
    balance: {
      manualPower,
      autosaveSeconds,
      employeeWageShare,
      minimumWage,
      baseCriticalChance,
      baseCriticalDamage,
      baseOreYieldChance,
    },
    progression: {
      xpBase,
      xpGrowth,
      skillPointsPerLevel,
      skillResetCostPerPoint: nonnegative(skillResetCostPerPoint),
    },
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
      contractBuyoutCost: nonnegative(contractBuyoutCost),
    },
    independence: {
      role: text(raw.independence?.role, 'Independent Miner', 100),
      operationName: text(raw.independence?.operationName, 'Independent Claim', 100),
      locationName: text(raw.independence?.locationName, 'Independent Claim', 100),
      subtitle: text(raw.independence?.subtitle, 'The claim is small, but every resource belongs to you.', 220),
      instruction: text(raw.independence?.instruction, 'Mine deposits and keep every resource you recover.', 220),
    },
    ui: {
      title: text(raw.ui?.title, raw.name || configId, 100),
      subtitle: text(raw.ui?.subtitle, '', 220),
      instruction: text(raw.ui?.instruction, 'Tap the deposit to mine.', 220),
    },
    story: { milestones },
    skills,
    resources,
    deposits,
    mines,
    skillsById: Object.fromEntries(skills.map((entry) => [entry.id, entry])),
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

export function rollChance(chance, random = Math.random) {
  const probability = Math.max(0, Math.min(1, finite(chance, 0)));
  return probability > 0 && safeRandom(random) < probability;
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
  const required = config.progression.xpBase * (config.progression.xpGrowth ** (safeLevel - 1));
  if (!Number.isFinite(required)) return Number.MAX_SAFE_INTEGER;
  return Math.max(1, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(required)));
}

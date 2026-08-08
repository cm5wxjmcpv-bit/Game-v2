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
const LOTTERY_REWARD_TYPES = new Set(['none', 'cash', 'resource', 'free-ticket']);
const RARE_FIND_REWARD_TYPES = new Set(['cash', 'resource', 'xp']);
const BUSINESS_EFFECT_TYPES = new Set(['automation-multiplier', 'generator-multiplier']);
const STORY_TRIGGER_TYPES = new Set(['start', 'level', 'cash', 'stage', 'contract-affordable']);
const PROBABILITY_EPSILON = 1e-9;

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

function normalizeEquipment(rawEquipment, errors) {
  if (rawEquipment !== undefined && (!rawEquipment || typeof rawEquipment !== 'object' || Array.isArray(rawEquipment))) {
    errors.push('equipment must be an object when provided');
  }
  const source = rawEquipment && typeof rawEquipment === 'object' && !Array.isArray(rawEquipment)
    ? rawEquipment
    : {};
  if (source.slots !== undefined && !Array.isArray(source.slots)) {
    errors.push('equipment.slots must be an array when provided');
  }
  if (source.items !== undefined && !Array.isArray(source.items)) {
    errors.push('equipment.items must be an array when provided');
  }

  const slots = (Array.isArray(source.slots) ? source.slots : []).map((entry) => ({
    id: normalizedId(entry?.id),
    name: text(entry?.name, entry?.id || 'Equipment Slot', 80),
    description: text(entry?.description, '', 180),
  }));
  const slotIds = uniqueIds(slots, 'equipment.slots', errors);

  const items = (Array.isArray(source.items) ? source.items : []).map((entry, itemIndex) => {
    if (!isFiniteNumber(entry?.cost) || entry.cost < 0) {
      errors.push(`equipment.items[${itemIndex}].cost must be a finite nonnegative number`);
    }
    if (entry?.startingOwned !== undefined && typeof entry.startingOwned !== 'boolean') {
      errors.push(`equipment.items[${itemIndex}].startingOwned must be a boolean when provided`);
    }
    if (entry?.startingEquipped !== undefined && typeof entry.startingEquipped !== 'boolean') {
      errors.push(`equipment.items[${itemIndex}].startingEquipped must be a boolean when provided`);
    }
    if (entry?.bonuses !== undefined && !Array.isArray(entry.bonuses)) {
      errors.push(`equipment.items[${itemIndex}].bonuses must be an array when provided`);
    }
    const bonuses = (Array.isArray(entry?.bonuses) ? entry.bonuses : []).map((bonus, bonusIndex) => {
      const type = normalizedId(bonus?.type);
      if (!SKILL_EFFECT_TYPES.has(type)) {
        errors.push(`equipment.items[${itemIndex}].bonuses[${bonusIndex}].type is unsupported`);
      }
      if (!isFiniteNumber(bonus?.amount) || bonus.amount < 0) {
        errors.push(`equipment.items[${itemIndex}].bonuses[${bonusIndex}].amount must be a finite nonnegative number`);
      }
      return {
        type,
        amount: nonnegative(bonus?.amount),
        label: text(bonus?.label, '', 120),
      };
    });
    return {
      id: normalizedId(entry?.id),
      name: text(entry?.name, entry?.id || 'Equipment', 80),
      description: text(entry?.description, '', 240),
      slotId: normalizedId(entry?.slotId),
      cost: nonnegative(entry?.cost),
      icon: text(entry?.icon, '⛏', 8),
      requiresItemId: normalizedId(entry?.requiresItemId),
      startingOwned: entry?.startingOwned === true,
      startingEquipped: entry?.startingEquipped === true,
      bonuses,
    };
  });
  const itemIds = uniqueIds(items, 'equipment.items', errors);
  const itemsById = Object.fromEntries(items.map((entry) => [entry.id, entry]));
  const startingSlots = new Set();
  items.forEach((item) => {
    if (!slotIds.has(item.slotId)) {
      errors.push(`equipment item "${item.id || '(invalid)'}" references missing slot "${item.slotId || '(invalid)'}"`);
    }
    if (item.requiresItemId && !itemIds.has(item.requiresItemId)) {
      errors.push(`equipment item "${item.id || '(invalid)'}" requires missing item "${item.requiresItemId}"`);
    }
    if (item.requiresItemId === item.id) {
      errors.push(`equipment item "${item.id || '(invalid)'}" cannot require itself`);
    }
    if (item.startingEquipped && !item.startingOwned) {
      errors.push(`equipment item "${item.id || '(invalid)'}" must be startingOwned when startingEquipped`);
    }
    if (item.startingOwned && item.requiresItemId && !itemsById[item.requiresItemId]?.startingOwned) {
      errors.push(`starting equipment item "${item.id || '(invalid)'}" requires an item that is not startingOwned`);
    }
    if (item.startingEquipped && startingSlots.has(item.slotId)) {
      errors.push(`equipment slot "${item.slotId || '(invalid)'}" has more than one starting item`);
    }
    if (item.startingEquipped) startingSlots.add(item.slotId);
  });
  items.forEach((item) => {
    const visited = new Set([item.id]);
    let requiredId = item.requiresItemId;
    while (requiredId && itemsById[requiredId]) {
      if (visited.has(requiredId)) {
        errors.push(`equipment item "${item.id || '(invalid)'}" has a circular prerequisite chain`);
        break;
      }
      visited.add(requiredId);
      requiredId = itemsById[requiredId].requiresItemId;
    }
  });

  return {
    slots,
    items,
    slotsById: Object.fromEntries(slots.map((entry) => [entry.id, entry])),
    itemsById,
  };
}

function normalizeLottery(rawLottery, resourcesById, errors) {
  if (rawLottery !== undefined && (!rawLottery || typeof rawLottery !== 'object' || Array.isArray(rawLottery))) {
    errors.push('lottery must be an object when provided');
  }
  const source = rawLottery && typeof rawLottery === 'object' && !Array.isArray(rawLottery)
    ? rawLottery
    : {};
  if (source.scratchTickets !== undefined && !Array.isArray(source.scratchTickets)) {
    errors.push('lottery.scratchTickets must be an array when provided');
  }
  const tickets = (Array.isArray(source.scratchTickets) ? source.scratchTickets : []).map((entry, ticketIndex) => {
    if (!isFiniteNumber(entry?.cost) || entry.cost <= 0) {
      errors.push(`lottery.scratchTickets[${ticketIndex}].cost must be a finite positive number`);
    }
    if (!Array.isArray(entry?.prizes) || entry.prizes.length < 1) {
      errors.push(`lottery.scratchTickets[${ticketIndex}].prizes must contain at least one entry`);
    }
    const prizes = (Array.isArray(entry?.prizes) ? entry.prizes : []).map((prize, prizeIndex) => {
      const probability = finite(prize?.probability, -1);
      const rewardType = normalizedId(prize?.reward?.type);
      if (!isFiniteNumber(prize?.probability) || probability <= 0 || probability > 1) {
        errors.push(`lottery.scratchTickets[${ticketIndex}].prizes[${prizeIndex}].probability must be greater than 0 and at most 1`);
      }
      if (!LOTTERY_REWARD_TYPES.has(rewardType)) {
        errors.push(`lottery.scratchTickets[${ticketIndex}].prizes[${prizeIndex}].reward.type is unsupported`);
      }
      if (rewardType === 'cash'
        && (!isFiniteNumber(prize?.reward?.amount) || prize.reward.amount < 0)) {
        errors.push(`lottery.scratchTickets[${ticketIndex}].prizes[${prizeIndex}].reward.amount must be finite and nonnegative`);
      }
      if (rewardType === 'resource'
        && (!Number.isInteger(prize?.reward?.amount) || prize.reward.amount < 1)) {
        errors.push(`lottery.scratchTickets[${ticketIndex}].prizes[${prizeIndex}].reward.amount must be a positive integer`);
      }
      const resourceId = normalizedId(prize?.reward?.resourceId);
      if (rewardType === 'resource' && !resourcesById[resourceId]) {
        errors.push(`lottery.scratchTickets[${ticketIndex}].prizes[${prizeIndex}] references missing resource "${resourceId || '(invalid)'}"`);
      }
      return {
        id: normalizedId(prize?.id),
        label: text(prize?.label, 'Prize', 100),
        probability: Math.max(0, probability),
        reward: {
          type: rewardType,
          amount: rewardType === 'resource'
            ? integer(prize?.reward?.amount, 0, 1)
            : rewardType === 'cash'
              ? nonnegative(prize?.reward?.amount)
              : 0,
          resourceId,
          ticketId: normalizedId(prize?.reward?.ticketId),
        },
      };
    });
    uniqueIds(prizes, `lottery.scratchTickets[${ticketIndex}].prizes`, errors);
    return {
      id: normalizedId(entry?.id),
      name: text(entry?.name, entry?.id || 'Scratch Ticket', 80),
      description: text(entry?.description, '', 240),
      cost: nonnegative(entry?.cost),
      icon: text(entry?.icon, '★', 8),
      prizes,
      probabilityTotal: prizes.reduce((sum, prize) => sum + prize.probability, 0),
      expectedPayout: 0,
    };
  });
  const ticketIds = uniqueIds(tickets, 'lottery.scratchTickets', errors);
  const ticketsById = Object.fromEntries(tickets.map((entry) => [entry.id, entry]));

  tickets.forEach((ticket) => {
    if (Math.abs(ticket.probabilityTotal - 1) > PROBABILITY_EPSILON) {
      errors.push(`scratch ticket "${ticket.id || '(invalid)'}" prize probabilities must total exactly 1`);
    }
    ticket.prizes.forEach((prize) => {
      if (prize.reward.type === 'free-ticket') {
        if (!ticketIds.has(prize.reward.ticketId)) {
          errors.push(`scratch ticket "${ticket.id || '(invalid)'}" prize "${prize.id || '(invalid)'}" references missing ticket "${prize.reward.ticketId || '(invalid)'}"`);
        }
      }
      const value = prize.reward.type === 'cash'
        ? prize.reward.amount
        : prize.reward.type === 'resource'
          ? prize.reward.amount * (resourcesById[prize.reward.resourceId]?.value || 0)
          : prize.reward.type === 'free-ticket'
            ? ticketsById[prize.reward.ticketId]?.cost || 0
            : 0;
      prize.estimatedValue = value;
    });
    ticket.expectedPayout = ticket.prizes.reduce(
      (sum, prize) => sum + (prize.probability * prize.estimatedValue),
      0,
    );
    if (ticket.expectedPayout >= ticket.cost) {
      errors.push(`scratch ticket "${ticket.id || '(invalid)'}" expected payout must be below its purchase cost`);
    }
  });

  return {
    disclaimer: text(source.disclaimer, 'Fictional lottery using earned in-game currency only.', 240),
    scratchTickets: tickets,
    scratchTicketsById: ticketsById,
  };
}

function normalizeStore(rawStore, equipment, lottery, errors) {
  if (rawStore !== undefined && (!rawStore || typeof rawStore !== 'object' || Array.isArray(rawStore))) {
    errors.push('store must be an object when provided');
  }
  const source = rawStore && typeof rawStore === 'object' && !Array.isArray(rawStore) ? rawStore : {};
  if (source.categories !== undefined && !Array.isArray(source.categories)) {
    errors.push('store.categories must be an array when provided');
  }
  const categories = (Array.isArray(source.categories) ? source.categories : []).map((entry, index) => {
    if (entry?.equipmentIds !== undefined && !Array.isArray(entry.equipmentIds)) {
      errors.push(`store.categories[${index}].equipmentIds must be an array when provided`);
    }
    if (entry?.scratchTicketIds !== undefined && !Array.isArray(entry.scratchTicketIds)) {
      errors.push(`store.categories[${index}].scratchTicketIds must be an array when provided`);
    }
    return {
      id: normalizedId(entry?.id),
      name: text(entry?.name, entry?.id || 'Store Category', 80),
      description: text(entry?.description, '', 200),
      equipmentIds: Array.isArray(entry?.equipmentIds)
        ? entry.equipmentIds.map(normalizedId).filter(Boolean)
        : [],
      scratchTicketIds: Array.isArray(entry?.scratchTicketIds)
        ? entry.scratchTicketIds.map(normalizedId).filter(Boolean)
        : [],
    };
  });
  uniqueIds(categories, 'store.categories', errors);
  const listedEquipment = new Set();
  const listedTickets = new Set();
  categories.forEach((category) => {
    if (!category.equipmentIds.length && !category.scratchTicketIds.length) {
      errors.push(`store category "${category.id || '(invalid)'}" must list equipment or scratch tickets`);
    }
    category.equipmentIds.forEach((itemId) => {
      if (!equipment.itemsById[itemId]) {
        errors.push(`store category "${category.id || '(invalid)'}" references missing equipment "${itemId}"`);
      } else if (listedEquipment.has(itemId)) {
        errors.push(`store equipment "${itemId}" is listed more than once`);
      }
      listedEquipment.add(itemId);
    });
    category.scratchTicketIds.forEach((ticketId) => {
      if (!lottery.scratchTicketsById[ticketId]) {
        errors.push(`store category "${category.id || '(invalid)'}" references missing scratch ticket "${ticketId}"`);
      } else if (listedTickets.has(ticketId)) {
        errors.push(`store scratch ticket "${ticketId}" is listed more than once`);
      }
      listedTickets.add(ticketId);
    });
  });
  return {
    id: normalizedId(source.id),
    name: text(source.name, 'General Store', 100),
    keeperName: text(source.keeperName, 'Shopkeeper', 100),
    description: text(source.description, '', 240),
    categories,
    equipmentIds: [...listedEquipment],
    scratchTicketIds: [...listedTickets],
  };
}

function normalizeCompany(rawCompany, errors) {
  if (rawCompany !== undefined && (!rawCompany || typeof rawCompany !== 'object' || Array.isArray(rawCompany))) {
    errors.push('company must be an object when provided');
  }
  const source = rawCompany && typeof rawCompany === 'object' && !Array.isArray(rawCompany)
    ? rawCompany
    : {};
  const rawCreation = source.creation && typeof source.creation === 'object' && !Array.isArray(source.creation)
    ? source.creation
    : {};
  if (source.creation !== undefined && rawCreation !== source.creation) {
    errors.push('company.creation must be an object when provided');
  }

  const creationCost = finite(rawCreation.cost, 2500);
  const requiredCharacterLevel = integer(rawCreation.requiredCharacterLevel, 1, 1);
  const minimumNameLength = integer(rawCreation.minimumNameLength, 2, 1);
  const maximumNameLength = integer(rawCreation.maximumNameLength, 40, 1);
  if (rawCreation.cost !== undefined && (!isFiniteNumber(rawCreation.cost) || rawCreation.cost < 0)) {
    errors.push('company.creation.cost must be a finite nonnegative number');
  }
  if (rawCreation.requiredCharacterLevel !== undefined
    && (!Number.isInteger(rawCreation.requiredCharacterLevel) || rawCreation.requiredCharacterLevel < 1)) {
    errors.push('company.creation.requiredCharacterLevel must be a positive integer');
  }
  if (rawCreation.minimumNameLength !== undefined
    && (!Number.isInteger(rawCreation.minimumNameLength) || rawCreation.minimumNameLength < 1)) {
    errors.push('company.creation.minimumNameLength must be a positive integer');
  }
  if (rawCreation.maximumNameLength !== undefined
    && (!Number.isInteger(rawCreation.maximumNameLength) || rawCreation.maximumNameLength < 1)) {
    errors.push('company.creation.maximumNameLength must be a positive integer');
  }
  if (maximumNameLength < minimumNameLength || maximumNameLength > 100) {
    errors.push('company creation name length limits must be ordered and at most 100 characters');
  }

  if (source.levels !== undefined && !Array.isArray(source.levels)) {
    errors.push('company.levels must be an array when provided');
  }
  if (Array.isArray(source.levels) && source.levels.length < 1) {
    errors.push('company.levels must contain at least one entry when provided');
  }
  const rawLevels = Array.isArray(source.levels) && source.levels.length
    ? source.levels
    : [{ level: 1, name: 'Mining Company', requiredInvestment: 0 }];
  const levels = rawLevels.map((entry, index) => {
    if (!Number.isInteger(entry?.level) || entry.level < 1) {
      errors.push(`company.levels[${index}].level must be a positive integer`);
    }
    if (!isFiniteNumber(entry?.requiredInvestment) || entry.requiredInvestment < 0) {
      errors.push(`company.levels[${index}].requiredInvestment must be a finite nonnegative number`);
    }
    return {
      level: integer(entry?.level, index + 1, 1),
      name: text(entry?.name, `Company Level ${index + 1}`, 80),
      requiredInvestment: nonnegative(entry?.requiredInvestment),
    };
  });
  levels.forEach((entry, index) => {
    if (entry.level !== index + 1) {
      errors.push('company.levels must be sequential and start at level 1');
    }
    if (index === 0 && entry.requiredInvestment !== 0) {
      errors.push('company level 1 must require zero lifetime investment');
    }
    if (index > 0 && entry.requiredInvestment <= levels[index - 1].requiredInvestment) {
      errors.push('company level investment requirements must increase strictly');
    }
  });

  return {
    ownerRole: text(source.ownerRole, 'Founder & Lead Miner', 100),
    creation: {
      cost: nonnegative(creationCost),
      requiredCharacterLevel,
      minimumNameLength,
      maximumNameLength,
    },
    levels,
    levelsByLevel: Object.fromEntries(levels.map((entry) => [entry.level, entry])),
    maxLevel: levels.at(-1)?.level || 1,
  };
}

function normalizeGeneratorUnlock(rawUnlock, company, label, errors) {
  const source = rawUnlock && typeof rawUnlock === 'object' && !Array.isArray(rawUnlock)
    ? rawUnlock
    : {};
  if (rawUnlock !== undefined && source !== rawUnlock) {
    errors.push(`${label}.unlock must be an object when provided`);
  }
  const companyLevel = integer(source.companyLevel, 1, 1);
  const requiredGeneratorId = normalizedId(source.requiredGeneratorId);
  const requiredGeneratorOwned = integer(source.requiredGeneratorOwned, requiredGeneratorId ? 1 : 0, 0);
  if (source.companyLevel !== undefined
    && (!Number.isInteger(source.companyLevel) || source.companyLevel < 1 || source.companyLevel > company.maxLevel)) {
    errors.push(`${label}.unlock.companyLevel must reference a configured company level`);
  }
  if (source.requiredGeneratorId !== undefined && !requiredGeneratorId) {
    errors.push(`${label}.unlock.requiredGeneratorId must be a safe id`);
  }
  if (source.requiredGeneratorOwned !== undefined
    && (!Number.isInteger(source.requiredGeneratorOwned) || source.requiredGeneratorOwned < 1)) {
    errors.push(`${label}.unlock.requiredGeneratorOwned must be a positive integer`);
  }
  if (!requiredGeneratorId && source.requiredGeneratorOwned !== undefined) {
    errors.push(`${label}.unlock.requiredGeneratorOwned requires requiredGeneratorId`);
  }
  return { companyLevel, requiredGeneratorId, requiredGeneratorOwned };
}

function normalizeGenerators(rawGenerators, company, errors) {
  if (rawGenerators !== undefined && !Array.isArray(rawGenerators)) {
    errors.push('generators must be an array when provided');
  }
  const generators = (Array.isArray(rawGenerators) ? rawGenerators : []).map((entry, index) => {
    const label = `generators[${index}]`;
    if (!isFiniteNumber(entry?.baseCost) || entry.baseCost < 0) {
      errors.push(`${label}.baseCost must be a finite nonnegative number`);
    }
    if (!isFiniteNumber(entry?.growthRate) || entry.growthRate < 1) {
      errors.push(`${label}.growthRate must be a finite number of at least 1`);
    }
    if (!isFiniteNumber(entry?.powerPerSecond) || entry.powerPerSecond < 0) {
      errors.push(`${label}.powerPerSecond must be a finite nonnegative number`);
    }
    if (entry?.workersPerUnit !== undefined
      && (!Number.isInteger(entry.workersPerUnit) || entry.workersPerUnit < 0)) {
      errors.push(`${label}.workersPerUnit must be a nonnegative integer`);
    }
    return {
      id: normalizedId(entry?.id),
      name: text(entry?.name, entry?.id || 'Generator', 80),
      description: text(entry?.description, '', 240),
      icon: text(entry?.icon, 'AU', 8),
      baseCost: nonnegative(entry?.baseCost),
      growthRate: Math.max(1, finite(entry?.growthRate, 1)),
      powerPerSecond: nonnegative(entry?.powerPerSecond),
      workersPerUnit: integer(entry?.workersPerUnit, 0),
      unlock: normalizeGeneratorUnlock(entry?.unlock, company, label, errors),
    };
  });
  const generatorIds = uniqueIds(generators, 'generators', errors);
  const generatorsById = Object.fromEntries(generators.map((entry) => [entry.id, entry]));
  generators.forEach((generator) => {
    const requiredId = generator.unlock.requiredGeneratorId;
    if (requiredId && !generatorIds.has(requiredId)) {
      errors.push(`generator "${generator.id || '(invalid)'}" requires missing generator "${requiredId}"`);
    }
    if (requiredId === generator.id) {
      errors.push(`generator "${generator.id || '(invalid)'}" cannot require itself`);
    }
  });
  generators.forEach((generator) => {
    const visited = new Set([generator.id]);
    let requiredId = generator.unlock.requiredGeneratorId;
    while (requiredId && generatorsById[requiredId]) {
      if (visited.has(requiredId)) {
        errors.push(`generator "${generator.id || '(invalid)'}" has a circular prerequisite chain`);
        break;
      }
      visited.add(requiredId);
      requiredId = generatorsById[requiredId].unlock.requiredGeneratorId;
    }
  });
  return { generators, generatorsById };
}

function normalizeBusinessUpgrades(rawUpgrades, company, generatorsById, errors) {
  if (rawUpgrades !== undefined && !Array.isArray(rawUpgrades)) {
    errors.push('businessUpgrades must be an array when provided');
  }
  const upgrades = (Array.isArray(rawUpgrades) ? rawUpgrades : []).map((entry, index) => {
    const label = `businessUpgrades[${index}]`;
    const effectType = normalizedId(entry?.effect?.type);
    const generatorId = normalizedId(entry?.effect?.generatorId);
    if (!isFiniteNumber(entry?.baseCost) || entry.baseCost < 0) {
      errors.push(`${label}.baseCost must be a finite nonnegative number`);
    }
    if (!isFiniteNumber(entry?.growthRate) || entry.growthRate < 1) {
      errors.push(`${label}.growthRate must be a finite number of at least 1`);
    }
    if (!Number.isInteger(entry?.maxRank) || entry.maxRank < 1) {
      errors.push(`${label}.maxRank must be a positive integer`);
    }
    if (!BUSINESS_EFFECT_TYPES.has(effectType)) {
      errors.push(`${label}.effect.type is unsupported`);
    }
    if (!isFiniteNumber(entry?.effect?.amount) || entry.effect.amount < 0) {
      errors.push(`${label}.effect.amount must be a finite nonnegative number`);
    }
    if (effectType === 'generator-multiplier' && !generatorsById[generatorId]) {
      errors.push(`${label}.effect.generatorId references a missing generator`);
    }
    if (effectType === 'automation-multiplier' && entry?.effect?.generatorId !== undefined) {
      errors.push(`${label}.effect.generatorId is only valid for generator-multiplier effects`);
    }
    return {
      id: normalizedId(entry?.id),
      name: text(entry?.name, entry?.id || 'Business Upgrade', 80),
      description: text(entry?.description, '', 240),
      baseCost: nonnegative(entry?.baseCost),
      growthRate: Math.max(1, finite(entry?.growthRate, 1)),
      maxRank: integer(entry?.maxRank, 1, 1),
      effect: {
        type: effectType,
        generatorId,
        amount: nonnegative(entry?.effect?.amount),
        label: text(entry?.effect?.label, '', 140),
      },
      unlock: normalizeGeneratorUnlock(entry?.unlock, company, label, errors),
    };
  });
  uniqueIds(upgrades, 'businessUpgrades', errors);
  upgrades.forEach((upgrade) => {
    const requiredId = upgrade.unlock.requiredGeneratorId;
    if (requiredId && !generatorsById[requiredId]) {
      errors.push(`business upgrade "${upgrade.id || '(invalid)'}" requires missing generator "${requiredId}"`);
    }
  });
  return {
    businessUpgrades: upgrades,
    businessUpgradesById: Object.fromEntries(upgrades.map((entry) => [entry.id, entry])),
  };
}

function normalizeMineUnlock(rawUnlock, label, errors) {
  if (rawUnlock !== undefined
    && (!rawUnlock || typeof rawUnlock !== 'object' || Array.isArray(rawUnlock))) {
    errors.push(`${label}.unlock must be an object when provided`);
  }
  const source = rawUnlock && typeof rawUnlock === 'object' && !Array.isArray(rawUnlock)
    ? rawUnlock
    : {};
  if (source.cost !== undefined && (!isFiniteNumber(source.cost) || source.cost < 0)) {
    errors.push(`${label}.unlock.cost must be a finite nonnegative number`);
  }
  if (source.characterLevel !== undefined
    && (!Number.isInteger(source.characterLevel) || source.characterLevel < 1)) {
    errors.push(`${label}.unlock.characterLevel must be a positive integer`);
  }
  if (source.companyLevel !== undefined
    && (!Number.isInteger(source.companyLevel) || source.companyLevel < 0)) {
    errors.push(`${label}.unlock.companyLevel must be a nonnegative integer`);
  }
  if (source.requiredDepositsBroken !== undefined
    && (!Number.isInteger(source.requiredDepositsBroken) || source.requiredDepositsBroken < 0)) {
    errors.push(`${label}.unlock.requiredDepositsBroken must be a nonnegative integer`);
  }
  if (source.requiresIndependence !== undefined && typeof source.requiresIndependence !== 'boolean') {
    errors.push(`${label}.unlock.requiresIndependence must be a boolean when provided`);
  }
  if (source.requiredMineId !== undefined && source.requiredMineId !== '' && !normalizedId(source.requiredMineId)) {
    errors.push(`${label}.unlock.requiredMineId must be a safe id when provided`);
  }
  return {
    cost: nonnegative(source.cost),
    characterLevel: integer(source.characterLevel, 1, 1),
    companyLevel: integer(source.companyLevel, 0),
    requiresIndependence: source.requiresIndependence === true,
    requiredMineId: normalizedId(source.requiredMineId),
    requiredDepositsBroken: integer(source.requiredDepositsBroken, 0),
  };
}

function normalizeEligibleMineIds(value, label, mineIds, errors) {
  if (value !== undefined && !Array.isArray(value)) {
    errors.push(`${label} must be an array when provided`);
  }
  const ids = (Array.isArray(value) ? value : []).map(normalizedId).filter(Boolean);
  if (ids.length !== (Array.isArray(value) ? value.length : 0)) {
    errors.push(`${label} must contain only safe mine ids`);
  }
  if (new Set(ids).size !== ids.length) errors.push(`${label} contains duplicate mine ids`);
  ids.forEach((id) => {
    if (!mineIds.has(id)) errors.push(`${label} references missing mine "${id}"`);
  });
  return ids;
}

function normalizeRareFinds(rawRareFinds, resourcesById, mineIds, errors) {
  if (rawRareFinds !== undefined
    && (!rawRareFinds || typeof rawRareFinds !== 'object' || Array.isArray(rawRareFinds))) {
    errors.push('rareFinds must be an object when provided');
  }
  const source = rawRareFinds && typeof rawRareFinds === 'object' && !Array.isArray(rawRareFinds)
    ? rawRareFinds
    : {};
  if (source.finds !== undefined && !Array.isArray(source.finds)) {
    errors.push('rareFinds.finds must be an array when provided');
  }
  if (source.baseChance !== undefined
    && (!isFiniteNumber(source.baseChance) || source.baseChance < 0 || source.baseChance > 1)) {
    errors.push('rareFinds.baseChance must be between 0 and 1');
  }
  if (source.maxChance !== undefined
    && (!isFiniteNumber(source.maxChance) || source.maxChance < 0 || source.maxChance > 1)) {
    errors.push('rareFinds.maxChance must be between 0 and 1');
  }
  if (source.manualOnly !== undefined && typeof source.manualOnly !== 'boolean') {
    errors.push('rareFinds.manualOnly must be a boolean when provided');
  }
  const baseChance = finite(source.baseChance, 0);
  const maxChance = finite(source.maxChance, 0.5);
  if (maxChance < baseChance) errors.push('rareFinds.maxChance must be at least rareFinds.baseChance');

  const finds = (Array.isArray(source.finds) ? source.finds : []).map((entry, index) => {
    const label = `rareFinds.finds[${index}]`;
    const rewardType = normalizedId(entry?.reward?.type);
    if (!isFiniteNumber(entry?.weight) || entry.weight <= 0) {
      errors.push(`${label}.weight must be a finite positive number`);
    }
    if (!RARE_FIND_REWARD_TYPES.has(rewardType)) {
      errors.push(`${label}.reward.type is unsupported`);
    }
    if (rewardType === 'resource') {
      if (!resourcesById[normalizedId(entry?.reward?.resourceId)]) {
        errors.push(`${label}.reward.resourceId references a missing resource`);
      }
      if (!Number.isInteger(entry?.reward?.amount) || entry.reward.amount < 1) {
        errors.push(`${label}.reward.amount must be a positive integer for resource rewards`);
      }
    } else if (!isFiniteNumber(entry?.reward?.amount) || entry.reward.amount <= 0) {
      errors.push(`${label}.reward.amount must be a finite positive number`);
    }
    return {
      id: normalizedId(entry?.id),
      name: text(entry?.name, entry?.id || 'Rare Find', 100),
      description: text(entry?.description, '', 240),
      icon: text(entry?.icon, '★', 8),
      weight: finite(entry?.weight, 0),
      eligibleMineIds: normalizeEligibleMineIds(entry?.eligibleMineIds, `${label}.eligibleMineIds`, mineIds, errors),
      reward: {
        type: rewardType,
        resourceId: rewardType === 'resource' ? normalizedId(entry?.reward?.resourceId) : '',
        amount: rewardType === 'resource'
          ? integer(entry?.reward?.amount, 1, 1)
          : nonnegative(entry?.reward?.amount),
      },
    };
  });
  uniqueIds(finds, 'rareFinds.finds', errors);
  if (baseChance > 0 && finds.length < 1) {
    errors.push('rareFinds.finds must contain at least one entry when baseChance is positive');
  }
  return {
    baseChance: Math.max(0, Math.min(1, baseChance)),
    maxChance: Math.max(0, Math.min(1, maxChance)),
    manualOnly: source.manualOnly !== false,
    finds,
    findsById: Object.fromEntries(finds.map((entry) => [entry.id, entry])),
  };
}

function normalizeMiningEvents(rawEvents, mineIds, depositsById, errors) {
  if (rawEvents !== undefined
    && (!rawEvents || typeof rawEvents !== 'object' || Array.isArray(rawEvents))) {
    errors.push('miningEvents must be an object when provided');
  }
  const source = rawEvents && typeof rawEvents === 'object' && !Array.isArray(rawEvents)
    ? rawEvents
    : {};
  if (source.events !== undefined && !Array.isArray(source.events)) {
    errors.push('miningEvents.events must be an array when provided');
  }
  if (source.triggerChance !== undefined
    && (!isFiniteNumber(source.triggerChance) || source.triggerChance < 0 || source.triggerChance > 1)) {
    errors.push('miningEvents.triggerChance must be between 0 and 1');
  }
  const triggerChance = finite(source.triggerChance, 0);
  const events = (Array.isArray(source.events) ? source.events : []).map((entry, index) => {
    const label = `miningEvents.events[${index}]`;
    if (!isFiniteNumber(entry?.weight) || entry.weight <= 0) {
      errors.push(`${label}.weight must be a finite positive number`);
    }
    if (!isFiniteNumber(entry?.durationSeconds) || entry.durationSeconds <= 0) {
      errors.push(`${label}.durationSeconds must be a finite positive number`);
    }
    if (!isFiniteNumber(entry?.effects?.rewardMultiplier) || entry.effects.rewardMultiplier < 1) {
      errors.push(`${label}.effects.rewardMultiplier must be a finite number of at least 1`);
    }
    const rawMultipliers = entry?.effects?.depositWeightMultipliers;
    if (rawMultipliers !== undefined
      && (!rawMultipliers || typeof rawMultipliers !== 'object' || Array.isArray(rawMultipliers))) {
      errors.push(`${label}.effects.depositWeightMultipliers must be an object when provided`);
    }
    const multipliers = {};
    if (rawMultipliers && typeof rawMultipliers === 'object' && !Array.isArray(rawMultipliers)) {
      Object.entries(rawMultipliers).forEach(([rawId, multiplier]) => {
        const depositId = normalizedId(rawId);
        if (!depositId || !depositsById[depositId]) {
          errors.push(`${label}.effects.depositWeightMultipliers references missing deposit "${rawId}"`);
        } else if (!isFiniteNumber(multiplier) || multiplier <= 0) {
          errors.push(`${label}.effects.depositWeightMultipliers.${depositId} must be a finite positive number`);
        } else {
          multipliers[depositId] = multiplier;
        }
      });
    }
    return {
      id: normalizedId(entry?.id),
      name: text(entry?.name, entry?.id || 'Mining Event', 100),
      description: text(entry?.description, '', 240),
      icon: text(entry?.icon, '!', 8),
      weight: finite(entry?.weight, 0),
      durationSeconds: finite(entry?.durationSeconds, 0),
      eligibleMineIds: normalizeEligibleMineIds(entry?.eligibleMineIds, `${label}.eligibleMineIds`, mineIds, errors),
      effects: {
        rewardMultiplier: finite(entry?.effects?.rewardMultiplier, 1),
        depositWeightMultipliers: multipliers,
      },
    };
  });
  uniqueIds(events, 'miningEvents.events', errors);
  if (triggerChance > 0 && events.length < 1) {
    errors.push('miningEvents.events must contain at least one entry when triggerChance is positive');
  }
  return {
    triggerChance: Math.max(0, Math.min(1, triggerChance)),
    events,
    eventsById: Object.fromEntries(events.map((entry) => [entry.id, entry])),
  };
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
  const resourcesById = Object.fromEntries(resources.map((entry) => [entry.id, entry]));

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
  const depositsById = Object.fromEntries(deposits.map((entry) => [entry.id, entry]));

  const rawMines = Array.isArray(raw.mines) ? raw.mines : [];
  if (!rawMines.length) errors.push('mines must contain at least one entry');
  const mines = rawMines.map((entry, index) => ({
    id: normalizedId(entry?.id),
    name: text(entry?.name, entry?.id || 'Mine', 80),
    description: text(entry?.description, '', 240),
    order: index + 1,
    depositIds: Array.isArray(entry?.depositIds)
      ? entry.depositIds.map(normalizedId).filter(Boolean)
      : [],
    unlock: normalizeMineUnlock(entry?.unlock, `mines[${index}]`, errors),
    visual: {
      background: color(entry?.visual?.background, '#29221f'),
      accent: color(entry?.visual?.accent, '#f0b94d'),
    },
  }));
  const mineIds = uniqueIds(mines, 'mines', errors);
  const mineIndexes = Object.fromEntries(mines.map((mine, index) => [mine.id, index]));
  mines.forEach((mine, index) => {
    if (!mine.depositIds.length) errors.push(`mine "${mine.id || '(invalid)'}" must reference at least one deposit`);
    if (new Set(mine.depositIds).size !== mine.depositIds.length) errors.push(`mine "${mine.id || '(invalid)'}" contains duplicate deposit references`);
    mine.depositIds.forEach((depositId) => {
      if (!depositIds.has(depositId)) errors.push(`mine "${mine.id || '(invalid)'}" references missing deposit "${depositId}"`);
    });
    const requiredMineId = mine.unlock.requiredMineId;
    if (mine.unlock.requiredDepositsBroken > 0 && !requiredMineId) {
      errors.push(`mine "${mine.id || '(invalid)'}" requires deposits broken but has no requiredMineId`);
    }
    if (requiredMineId && !mineIds.has(requiredMineId)) {
      errors.push(`mine "${mine.id || '(invalid)'}" requires missing mine "${requiredMineId}"`);
    } else if (requiredMineId === mine.id) {
      errors.push(`mine "${mine.id || '(invalid)'}" cannot require itself`);
    } else if (requiredMineId && mineIndexes[requiredMineId] >= index) {
      errors.push(`mine "${mine.id || '(invalid)'}" must require an earlier mine`);
    }
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
  if (startMine && (startMine.unlock.cost > 0
    || startMine.unlock.characterLevel > integer(raw.start?.level, 1, 1)
    || startMine.unlock.companyLevel > 0
    || startMine.unlock.requiresIndependence
    || startMine.unlock.requiredMineId)) {
    errors.push('the starting mine must be unlocked by the starting state');
  }

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
  const maxAutomationBreaksPerTick = integer(raw.balance?.maxAutomationBreaksPerTick, 1000, 1);
  ['manualPower', 'autosaveSeconds', 'employeeWageShare', 'minimumWage'].forEach((field) => {
    if (!isFiniteNumber(raw.balance?.[field])) errors.push(`balance.${field} must be a finite number`);
  });
  if (raw.balance?.baseCriticalChance !== undefined && !isFiniteNumber(raw.balance.baseCriticalChance)) errors.push('balance.baseCriticalChance must be a finite number');
  if (raw.balance?.baseCriticalDamage !== undefined && !isFiniteNumber(raw.balance.baseCriticalDamage)) errors.push('balance.baseCriticalDamage must be a finite number');
  if (raw.balance?.baseOreYieldChance !== undefined && !isFiniteNumber(raw.balance.baseOreYieldChance)) errors.push('balance.baseOreYieldChance must be a finite number');
  if (raw.balance?.maxAutomationBreaksPerTick !== undefined
    && (!Number.isInteger(raw.balance.maxAutomationBreaksPerTick) || raw.balance.maxAutomationBreaksPerTick < 1)) {
    errors.push('balance.maxAutomationBreaksPerTick must be a positive integer');
  }
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
  const equipment = normalizeEquipment(raw.equipment, errors);
  const lottery = normalizeLottery(raw.lottery, resourcesById, errors);
  const store = normalizeStore(raw.store, equipment, lottery, errors);
  const company = normalizeCompany(raw.company, errors);
  const { generators, generatorsById } = normalizeGenerators(raw.generators, company, errors);
  const { businessUpgrades, businessUpgradesById } = normalizeBusinessUpgrades(
    raw.businessUpgrades,
    company,
    generatorsById,
    errors,
  );
  mines.forEach((mine) => {
    if (mine.unlock.companyLevel > company.maxLevel) {
      errors.push(`mine "${mine.id || '(invalid)'}" requires company level ${mine.unlock.companyLevel}, above the configured maximum`);
    }
  });
  const rareFinds = normalizeRareFinds(raw.rareFinds, resourcesById, mineIds, errors);
  const miningEvents = normalizeMiningEvents(raw.miningEvents, mineIds, depositsById, errors);
  if ((equipment.items.length || lottery.scratchTickets.length || store.categories.length) && !store.id) {
    errors.push('store.id must be a safe non-empty identifier when store content is provided');
  }

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
      maxAutomationBreaksPerTick,
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
    equipment,
    lottery,
    store,
    company,
    generators,
    generatorsById,
    businessUpgrades,
    businessUpgradesById,
    rareFinds,
    miningEvents,
    resources,
    deposits,
    mines,
    skillsById: Object.fromEntries(skills.map((entry) => [entry.id, entry])),
    resourcesById,
    depositsById,
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

function eligibleForMine(entry, mineId) {
  return entry.eligibleMineIds.length === 0 || entry.eligibleMineIds.includes(mineId);
}

function selectWeightedEntry(entries, random, weightFor = (entry) => entry.weight) {
  const weighted = entries.map((entry) => ({
    entry,
    weight: Math.max(0, finite(weightFor(entry), 0)),
  }));
  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
  if (!(totalWeight > 0)) return null;
  let roll = safeRandom(random) * totalWeight;
  for (const item of weighted) {
    roll -= item.weight;
    if (roll < 0) return item.entry;
  }
  return weighted.at(-1)?.entry || null;
}

export function selectWeightedDeposit(config, mineId, random = Math.random, weightMultipliers = {}) {
  const mine = config.minesById[mineId];
  if (!mine) throw new Error(`Unknown mine "${mineId}".`);
  const deposits = mine.depositIds.map((id) => config.depositsById[id]);
  return selectWeightedEntry(deposits, random, (deposit) => {
    const multiplier = finite(weightMultipliers?.[deposit.id], 1);
    return deposit.weight * Math.max(0, multiplier);
  }) || deposits[0];
}

export function selectWeightedRareFind(config, mineId, random = Math.random) {
  const eligible = config.rareFinds.finds.filter((entry) => eligibleForMine(entry, mineId));
  return selectWeightedEntry(eligible, random);
}

export function selectWeightedMiningEvent(config, mineId, random = Math.random) {
  const eligible = config.miningEvents.events.filter((entry) => eligibleForMine(entry, mineId));
  return selectWeightedEntry(eligible, random);
}

export function rollDepositReward(deposit, random = Math.random) {
  const range = deposit.reward.max - deposit.reward.min + 1;
  return deposit.reward.min + Math.floor(safeRandom(random) * range);
}

export function rollScratchPrize(ticket, random = Math.random) {
  if (!ticket?.prizes?.length) throw new Error('Scratch ticket has no prize table.');
  let roll = safeRandom(random);
  for (const prize of ticket.prizes) {
    roll -= prize.probability;
    if (roll < 0) return prize;
  }
  return ticket.prizes.at(-1);
}

export function xpRequiredForLevel(config, level) {
  const safeLevel = Math.max(1, integer(level, 1, 1));
  const required = config.progression.xpBase * (config.progression.xpGrowth ** (safeLevel - 1));
  if (!Number.isFinite(required)) return Number.MAX_SAFE_INTEGER;
  return Math.max(1, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(required)));
}

export function scaledPurchaseCost(baseCost, growthRate, owned) {
  const base = nonnegative(baseCost);
  const growth = Math.max(1, finite(growthRate, 1));
  const quantity = integer(owned, 0);
  const cost = base * (growth ** quantity);
  if (!Number.isFinite(cost)) return Number.MAX_SAFE_INTEGER;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.ceil(cost)));
}

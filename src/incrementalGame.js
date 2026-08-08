import {
  rollChance,
  rollDepositReward,
  rollScratchPrize,
  scaledPurchaseCost,
  selectWeightedDeposit,
  xpRequiredForLevel,
} from './incrementalContent.js';
import {
  createInitialIncrementalSnapshot,
  loadIncrementalGame,
  saveIncrementalGame,
  validateIncrementalSnapshot,
} from './incrementalSaveSystem.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function safeAdd(left, right) {
  const total = Number(left) + Number(right);
  if (!Number.isFinite(total)) return Number.MAX_SAFE_INTEGER;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, total));
}

function safeMultiply(left, right) {
  const product = Number(left) * Number(right);
  if (!Number.isFinite(product)) return Number.MAX_SAFE_INTEGER;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, product));
}

function normalizedId(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizedCompanyName(value) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

export class IncrementalGame {
  constructor(options) {
    if (!options?.config) throw new Error('IncrementalGame requires normalized config data.');
    this.config = options.config;
    this.gameVersion = String(options.gameVersion || '0.0.0');
    this.random = typeof options.random === 'function' ? options.random : Math.random;
    this.clock = typeof options.clock === 'function' ? options.clock : Date.now;
    this.saveAdapter = options.saveAdapter || {
      load: () => loadIncrementalGame(),
      save: (snapshot) => saveIncrementalGame(snapshot),
    };
    this.state = null;
    this.listeners = new Set();
    this.autosaveElapsed = 0;
  }

  subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(type, detail = {}) {
    const event = { type, detail, state: this.state };
    this.listeners.forEach((listener) => listener(event));
    return event;
  }

  start(options = {}) {
    const loaded = options.forceNew ? null : this.saveAdapter.load();
    const source = loaded && this.isStateCompatible(loaded)
      ? 'save'
      : loaded
        ? 'invalid-save'
        : 'new';
    let reconciled = false;
    if (source === 'save') {
      const result = this.reconcileState(loaded);
      this.state = result.state;
      reconciled = result.changed;
    } else {
      this.state = createInitialIncrementalSnapshot(this.config, {
        now: this.clock(),
        gameVersion: this.gameVersion,
      });
    }
    this.autosaveElapsed = 0;

    const levelResult = this.applyLevelProgression();
    this.emit('ready', { source });
    if (levelResult.levelsGained > 0) this.emit('level-up', levelResult);
    const milestones = this.evaluateMilestones();
    if (source !== 'save' || reconciled || levelResult.levelsGained > 0 || milestones.length > 0) {
      this.saveCheckpoint(source === 'save' ? 'progression-migration' : 'new-game');
    }
    return { source, state: this.state };
  }

  startNew() {
    return this.start({ forceNew: true });
  }

  reconcileState(snapshot) {
    const state = clone(snapshot);
    let changed = false;
    const missingEquipmentSlots = new Set();
    if (state.gameVersion !== this.gameVersion) {
      state.gameVersion = this.gameVersion;
      changed = true;
    }
    this.config.skills.forEach((skill) => {
      if (!Number.isInteger(state.skills[skill.id])) {
        state.skills[skill.id] = 0;
        changed = true;
      }
    });
    this.config.equipment.slots.forEach((slot) => {
      if (!Object.hasOwn(state.equipment, slot.id)) {
        state.equipment[slot.id] = null;
        missingEquipmentSlots.add(slot.id);
        changed = true;
      }
    });
    this.config.equipment.items.forEach((item) => {
      if (item.startingOwned && !state.ownedEquipment.includes(item.id)) {
        state.ownedEquipment.push(item.id);
        changed = true;
      }
      if (item.startingEquipped && missingEquipmentSlots.has(item.slotId)) {
        state.equipment[item.slotId] = item.id;
        changed = true;
      }
    });
    this.config.generators.forEach((generator) => {
      if (!Number.isInteger(state.generators[generator.id])) {
        state.generators[generator.id] = 0;
        changed = true;
      }
    });
    this.config.businessUpgrades.forEach((upgrade) => {
      if (!Number.isInteger(state.businessUpgrades[upgrade.id])) {
        state.businessUpgrades[upgrade.id] = 0;
        changed = true;
      }
    });
    const expectedCompanyLevel = state.company.created
      ? this.companyLevelForInvestment(state.company.lifetimeInvestment)
      : 0;
    if (state.company.level !== expectedCompanyLevel) {
      state.company.level = expectedCompanyLevel;
      changed = true;
    }
    return { state, changed };
  }

  isStateCompatible(snapshot) {
    if (!validateIncrementalSnapshot(snapshot)) return false;
    const mine = this.config.minesById[snapshot.currentMine];
    const deposit = this.config.depositsById[snapshot.currentDeposit.id];
    if (!mine || !deposit || !mine.depositIds.includes(deposit.id)) return false;
    if (snapshot.currentDeposit.maxHp !== deposit.maxHp || snapshot.currentDeposit.hp > deposit.maxHp) return false;
    if (snapshot.unlockedMines.some((id) => !this.config.minesById[id])) return false;
    if (snapshot.employment.companyId !== this.config.employment.companyId) return false;

    const knownSlots = new Set(this.config.equipment.slots.map((slot) => slot.id));
    const knownItems = new Set(this.config.equipment.items.map((item) => item.id));
    if (snapshot.ownedEquipment.some((id) => !knownItems.has(id))) return false;
    if (!Object.entries(snapshot.equipment).every(([slotId, itemId]) => {
      if (!knownSlots.has(slotId)) return false;
      if (itemId === null) return true;
      const item = this.config.equipment.itemsById[itemId];
      return Boolean(item) && item.slotId === slotId && snapshot.ownedEquipment.includes(itemId);
    })) return false;
    if (snapshot.lotteryState.scratchTickets.some((id) => !this.config.lottery.scratchTicketsById[id])) return false;

    const knownGenerators = new Set(this.config.generators.map((generator) => generator.id));
    if (!Object.entries(snapshot.generators).every(([id, owned]) => (
      knownGenerators.has(id) && Number.isInteger(owned) && owned >= 0
    ))) return false;
    const knownUpgrades = new Set(this.config.businessUpgrades.map((upgrade) => upgrade.id));
    if (!Object.entries(snapshot.businessUpgrades).every(([id, rank]) => {
      const upgrade = this.config.businessUpgradesById[id];
      return knownUpgrades.has(id) && Number.isInteger(rank) && rank >= 0 && rank <= upgrade.maxRank;
    })) return false;
    if (!snapshot.company.created
      && (snapshot.company.name !== ''
        || snapshot.company.level !== 0
        || snapshot.company.createdAt !== null
        || snapshot.company.lifetimeInvestment !== 0
        || Object.values(snapshot.generators).some((owned) => owned > 0)
        || Object.values(snapshot.businessUpgrades).some((rank) => rank > 0))) return false;
    if (snapshot.company.created) {
      const name = normalizedCompanyName(snapshot.company.name);
      const limits = this.config.company.creation;
      if (name !== snapshot.company.name
        || name.length < limits.minimumNameLength
        || name.length > limits.maximumNameLength
        || snapshot.company.createdAt === null
        || snapshot.company.level > this.config.company.maxLevel
        || snapshot.storyStage !== 'company-owner'
        || snapshot.employment.active) return false;
    }

    const knownResources = new Set(this.config.resources.map((resource) => resource.id));
    const resourceMaps = [
      snapshot.materials,
      snapshot.employment.companyResources,
      snapshot.statistics.resourceTotals,
    ];
    if (!resourceMaps.every((map) => (
      Object.keys(map).every((id) => knownResources.has(id))
      && this.config.resources.every((resource) => Number.isFinite(map[resource.id]) && map[resource.id] >= 0)
    ))) return false;

    return Object.entries(snapshot.skills).every(([id, rank]) => {
      const skill = this.config.skillsById[id];
      return Boolean(skill) && Number.isInteger(rank) && rank >= 0 && rank <= skill.maxRank;
    });
  }

  getSkillRank(skillId) {
    return this.state?.skills?.[skillId] || 0;
  }

  getSkillBonus(effectType) {
    if (!this.state) return 0;
    return this.config.skills.reduce((total, skill) => {
      if (skill.effect.type !== effectType) return total;
      return total + (this.getSkillRank(skill.id) * skill.effect.amount);
    }, 0);
  }

  getEquippedItem(slotId) {
    const itemId = this.state?.equipment?.[normalizedId(slotId)];
    return itemId ? this.config.equipment.itemsById[itemId] || null : null;
  }

  getEquipmentBonus(effectType) {
    if (!this.state) return 0;
    return Object.values(this.state.equipment).reduce((total, itemId) => {
      const item = itemId ? this.config.equipment.itemsById[itemId] : null;
      if (!item) return total;
      return total + item.bonuses.reduce(
        (itemTotal, bonus) => itemTotal + (bonus.type === effectType ? bonus.amount : 0),
        0,
      );
    }, 0);
  }

  getMiningBonus(effectType) {
    return this.getSkillBonus(effectType) + this.getEquipmentBonus(effectType);
  }

  getMiningStats() {
    return {
      manualPower: this.config.balance.manualPower + this.getMiningBonus('manual-power-flat'),
      miningSpeed: 1 + this.getMiningBonus('mining-speed'),
      criticalChance: Math.min(0.95, this.config.balance.baseCriticalChance + this.getMiningBonus('critical-chance')),
      criticalDamage: Math.max(1, this.config.balance.baseCriticalDamage + this.getMiningBonus('critical-damage')),
      oreYieldChance: Math.min(0.95, this.config.balance.baseOreYieldChance + this.getMiningBonus('ore-yield-chance')),
      rareFindChance: Math.min(0.95, this.getMiningBonus('rare-find-chance')),
      automationBonus: this.getMiningBonus('automation-bonus'),
    };
  }

  getManualPower() {
    return this.getMiningStats().manualPower;
  }

  companyLevelForInvestment(investment) {
    const total = Math.max(0, Number(investment) || 0);
    return this.config.company.levels.reduce(
      (level, entry) => (total >= entry.requiredInvestment ? entry.level : level),
      1,
    );
  }

  getCompanyLevelDefinition(level = this.state?.company?.level || 0) {
    return this.config.company.levelsByLevel[level] || null;
  }

  getNextCompanyLevel() {
    if (!this.state?.company?.created) return this.config.company.levels[0] || null;
    return this.config.company.levels.find((entry) => entry.level > this.state.company.level) || null;
  }

  getCompanyCreationStatus(companyName = '') {
    if (!this.state) return { ok: false, reason: 'not-started' };
    if (this.state.company.created) return { ok: false, reason: 'already-created' };
    if (this.state.employment.active || this.state.storyStage !== 'independent') {
      return { ok: false, reason: 'not-independent' };
    }
    const creation = this.config.company.creation;
    if (this.state.character.level < creation.requiredCharacterLevel) {
      return {
        ok: false,
        reason: 'level-required',
        requiredLevel: creation.requiredCharacterLevel,
        level: this.state.character.level,
      };
    }
    const name = normalizedCompanyName(companyName);
    if (name.length < creation.minimumNameLength || name.length > creation.maximumNameLength) {
      return {
        ok: false,
        reason: 'invalid-name',
        name,
        minimumNameLength: creation.minimumNameLength,
        maximumNameLength: creation.maximumNameLength,
      };
    }
    if (this.state.cash < creation.cost) {
      return { ok: false, reason: 'insufficient-cash', cost: creation.cost, cash: this.state.cash, name };
    }
    return { ok: true, name, cost: creation.cost };
  }

  createCompany(companyName) {
    const status = this.getCompanyCreationStatus(companyName);
    if (!status.ok) return status;
    this.state.cash = Math.max(0, this.state.cash - status.cost);
    this.state.company.created = true;
    this.state.company.name = status.name;
    this.state.company.level = 1;
    this.state.company.createdAt = this.clock();
    this.state.company.lifetimeInvestment = 0;
    this.state.storyStage = 'company-owner';
    const milestones = this.evaluateMilestones();
    const result = {
      ok: true,
      name: status.name,
      cost: status.cost,
      level: this.state.company.level,
      storyStage: this.state.storyStage,
      milestones,
    };
    this.saveCheckpoint('company-created');
    this.emit('company', { type: 'created', ...result });
    return result;
  }

  getGeneratorOwned(generatorId) {
    return this.state?.generators?.[normalizedId(generatorId)] || 0;
  }

  getGeneratorCost(generatorId) {
    const generator = this.config.generatorsById[normalizedId(generatorId)];
    if (!generator) return null;
    return scaledPurchaseCost(generator.baseCost, generator.growthRate, this.getGeneratorOwned(generator.id));
  }

  getBusinessUpgradeRank(upgradeId) {
    return this.state?.businessUpgrades?.[normalizedId(upgradeId)] || 0;
  }

  getBusinessUpgradeCost(upgradeId) {
    const upgrade = this.config.businessUpgradesById[normalizedId(upgradeId)];
    if (!upgrade) return null;
    return scaledPurchaseCost(upgrade.baseCost, upgrade.growthRate, this.getBusinessUpgradeRank(upgrade.id));
  }

  getBusinessUnlockStatus(unlock) {
    if (!this.state?.company?.created) return { unlocked: false, reason: 'company-required' };
    if (this.state.company.level < unlock.companyLevel) {
      return { unlocked: false, reason: 'company-level', requiredCompanyLevel: unlock.companyLevel };
    }
    if (unlock.requiredGeneratorId) {
      const owned = this.getGeneratorOwned(unlock.requiredGeneratorId);
      if (owned < unlock.requiredGeneratorOwned) {
        return {
          unlocked: false,
          reason: 'generator-required',
          requiredGeneratorId: unlock.requiredGeneratorId,
          requiredGeneratorOwned: unlock.requiredGeneratorOwned,
          owned,
        };
      }
    }
    return { unlocked: true };
  }

  getGeneratorUnlockStatus(generatorId) {
    const generator = this.config.generatorsById[normalizedId(generatorId)];
    if (!generator) return { unlocked: false, reason: 'unknown-generator' };
    return this.getBusinessUnlockStatus(generator.unlock);
  }

  getBusinessUpgradeUnlockStatus(upgradeId) {
    const upgrade = this.config.businessUpgradesById[normalizedId(upgradeId)];
    if (!upgrade) return { unlocked: false, reason: 'unknown-upgrade' };
    return this.getBusinessUnlockStatus(upgrade.unlock);
  }

  recordCompanyInvestment(cost) {
    const previousLevel = this.state.company.level;
    this.state.company.lifetimeInvestment = safeAdd(this.state.company.lifetimeInvestment, cost);
    this.state.company.level = this.companyLevelForInvestment(this.state.company.lifetimeInvestment);
    const levelsGained = Math.max(0, this.state.company.level - previousLevel);
    if (levelsGained > 0) {
      this.emit('company-level', {
        previousLevel,
        level: this.state.company.level,
        levelsGained,
        definition: clone(this.getCompanyLevelDefinition()),
      });
    }
    return { previousLevel, level: this.state.company.level, levelsGained };
  }

  purchaseGenerator(generatorId) {
    if (!this.state) throw new Error('IncrementalGame must be started before purchasing generators.');
    const id = normalizedId(generatorId);
    const generator = this.config.generatorsById[id];
    if (!generator) return { ok: false, reason: 'unknown-generator', generatorId: id };
    const unlock = this.getGeneratorUnlockStatus(id);
    if (!unlock.unlocked) return { ok: false, generatorId: id, ...unlock };
    const cost = this.getGeneratorCost(id);
    if (this.state.cash < cost) {
      return { ok: false, reason: 'insufficient-cash', generatorId: id, cost, cash: this.state.cash };
    }

    this.state.cash = Math.max(0, this.state.cash - cost);
    this.state.generators[id] += 1;
    this.state.statistics.workersHired = safeAdd(
      this.state.statistics.workersHired,
      generator.workersPerUnit,
    );
    const companyProgress = this.recordCompanyInvestment(cost);
    const result = {
      ok: true,
      generatorId: id,
      cost,
      owned: this.state.generators[id],
      nextCost: this.getGeneratorCost(id),
      companyProgress,
      automation: this.getAutomationStats(),
    };
    this.saveCheckpoint('generator-purchase');
    this.emit('generator', result);
    return result;
  }

  purchaseBusinessUpgrade(upgradeId) {
    if (!this.state) throw new Error('IncrementalGame must be started before purchasing business upgrades.');
    const id = normalizedId(upgradeId);
    const upgrade = this.config.businessUpgradesById[id];
    if (!upgrade) return { ok: false, reason: 'unknown-upgrade', upgradeId: id };
    const rank = this.getBusinessUpgradeRank(id);
    if (rank >= upgrade.maxRank) return { ok: false, reason: 'max-rank', upgradeId: id, rank };
    const unlock = this.getBusinessUpgradeUnlockStatus(id);
    if (!unlock.unlocked) return { ok: false, upgradeId: id, ...unlock };
    const cost = this.getBusinessUpgradeCost(id);
    if (this.state.cash < cost) {
      return { ok: false, reason: 'insufficient-cash', upgradeId: id, cost, cash: this.state.cash };
    }

    this.state.cash = Math.max(0, this.state.cash - cost);
    this.state.businessUpgrades[id] = rank + 1;
    const companyProgress = this.recordCompanyInvestment(cost);
    const result = {
      ok: true,
      upgradeId: id,
      cost,
      rank: this.state.businessUpgrades[id],
      nextCost: this.getBusinessUpgradeCost(id),
      companyProgress,
      automation: this.getAutomationStats(),
    };
    this.saveCheckpoint('business-upgrade-purchase');
    this.emit('business-upgrade', result);
    return result;
  }

  getAutomationStats() {
    const skillBonus = this.getMiningBonus('automation-bonus');
    const globalUpgradeBonus = this.config.businessUpgrades.reduce((total, upgrade) => {
      if (upgrade.effect.type !== 'automation-multiplier') return total;
      return total + (this.getBusinessUpgradeRank(upgrade.id) * upgrade.effect.amount);
    }, 0);
    const globalMultiplier = 1 + skillBonus + globalUpgradeBonus;
    const generators = this.config.generators.map((generator) => {
      const owned = this.getGeneratorOwned(generator.id);
      const generatorBonus = this.config.businessUpgrades.reduce((total, upgrade) => {
        if (upgrade.effect.type !== 'generator-multiplier'
          || upgrade.effect.generatorId !== generator.id) return total;
        return total + (this.getBusinessUpgradeRank(upgrade.id) * upgrade.effect.amount);
      }, 0);
      const basePower = safeMultiply(owned, generator.powerPerSecond);
      const power = safeMultiply(basePower, 1 + generatorBonus);
      return { id: generator.id, owned, basePower, generatorBonus, power };
    });
    const subtotalPower = generators.reduce((total, entry) => safeAdd(total, entry.power), 0);
    return {
      skillBonus,
      globalUpgradeBonus,
      globalMultiplier,
      subtotalPower,
      totalPower: safeMultiply(subtotalPower, globalMultiplier),
      generators,
    };
  }

  getAutomationPower() {
    return this.getAutomationStats().totalPower;
  }

  getXpRequired() {
    return xpRequiredForLevel(this.config, this.state?.character?.level || 1);
  }

  getSpentSkillPoints() {
    if (!this.state) return 0;
    return Object.values(this.state.skills).reduce((total, rank) => total + rank, 0);
  }

  getSkillResetCost() {
    return Math.ceil(this.getSpentSkillPoints() * this.config.progression.skillResetCostPerPoint);
  }

  allocateSkill(skillId) {
    if (!this.state) throw new Error('IncrementalGame must be started before allocating skills.');
    const id = String(skillId || '').trim().toLowerCase();
    const skill = this.config.skillsById[id];
    if (!skill) return { ok: false, reason: 'unknown-skill', skillId: id };
    if (!skill.enabled) return { ok: false, reason: 'skill-locked', skillId: id };
    const rank = this.getSkillRank(id);
    if (rank >= skill.maxRank) return { ok: false, reason: 'max-rank', skillId: id };
    if (this.state.character.skillPoints < 1) return { ok: false, reason: 'no-skill-points', skillId: id };

    this.state.skills[id] = rank + 1;
    this.state.character.skillPoints -= 1;
    const result = {
      ok: true,
      skillId: id,
      rank: this.state.skills[id],
      remainingPoints: this.state.character.skillPoints,
      miningStats: this.getMiningStats(),
    };
    this.saveCheckpoint('skill-allocation');
    this.emit('skill', result);
    return result;
  }

  resetSkills() {
    if (!this.state) throw new Error('IncrementalGame must be started before resetting skills.');
    const refundedPoints = this.getSpentSkillPoints();
    if (refundedPoints < 1) return { ok: false, reason: 'no-allocated-skills' };
    const cost = this.getSkillResetCost();
    if (this.state.cash < cost) {
      return { ok: false, reason: 'insufficient-cash', cost, cash: this.state.cash };
    }

    this.state.cash -= cost;
    this.config.skills.forEach((skill) => { this.state.skills[skill.id] = 0; });
    this.state.character.skillPoints = safeAdd(this.state.character.skillPoints, refundedPoints);
    const result = {
      ok: true,
      cost,
      refundedPoints,
      remainingPoints: this.state.character.skillPoints,
    };
    this.saveCheckpoint('skill-reset');
    this.emit('skill-reset', result);
    return result;
  }

  sellResource(resourceId, requestedQuantity = 'all') {
    if (!this.state) throw new Error('IncrementalGame must be started before selling resources.');
    if (!['independent', 'company-owner'].includes(this.state.storyStage) || this.state.employment.active) {
      return { ok: false, reason: 'not-independent' };
    }
    const id = normalizedId(resourceId);
    const resource = this.config.resourcesById[id];
    if (!resource) return { ok: false, reason: 'unknown-resource', resourceId: id };
    const available = this.state.materials[id];
    if (!(available > 0)) return { ok: false, reason: 'nothing-to-sell', resourceId: id, available };

    const sellingAll = requestedQuantity === 'all';
    const quantity = sellingAll
      ? available
      : Number(requestedQuantity);
    if (!(quantity > 0 && Number.isFinite(quantity)) || (!sellingAll && !Number.isInteger(quantity))) {
      return { ok: false, reason: 'invalid-quantity', resourceId: id, available };
    }
    if (quantity > available) {
      return { ok: false, reason: 'insufficient-resource', resourceId: id, quantity, available };
    }

    const proceeds = safeMultiply(quantity, resource.value);
    this.state.materials[id] = Math.max(0, available - quantity);
    this.state.cash = safeAdd(this.state.cash, proceeds);
    this.state.statistics.totalOreSold = safeAdd(this.state.statistics.totalOreSold, quantity);
    this.state.statistics.lifetimeEarnings = safeAdd(this.state.statistics.lifetimeEarnings, proceeds);
    const milestones = this.evaluateMilestones();
    const result = {
      ok: true,
      resourceId: id,
      quantity,
      unitValue: resource.value,
      proceeds,
      remaining: this.state.materials[id],
      milestones,
    };
    this.saveCheckpoint('resource-sale');
    this.emit('sale', result);
    return result;
  }

  equipItem(itemId) {
    if (!this.state) throw new Error('IncrementalGame must be started before equipping items.');
    const id = normalizedId(itemId);
    const item = this.config.equipment.itemsById[id];
    if (!item) return { ok: false, reason: 'unknown-equipment', itemId: id };
    if (!this.state.ownedEquipment.includes(id)) {
      return { ok: false, reason: 'not-owned', itemId: id };
    }
    const previousItemId = this.state.equipment[item.slotId] || null;
    if (previousItemId === id) {
      return { ok: false, reason: 'already-equipped', itemId: id, slotId: item.slotId };
    }
    this.state.equipment[item.slotId] = id;
    const result = {
      ok: true,
      itemId: id,
      slotId: item.slotId,
      previousItemId,
      miningStats: this.getMiningStats(),
    };
    this.saveCheckpoint('equipment-change');
    this.emit('equipment', result);
    return result;
  }

  purchaseEquipment(itemId, options = {}) {
    if (!this.state) throw new Error('IncrementalGame must be started before purchasing equipment.');
    const id = normalizedId(itemId);
    const item = this.config.equipment.itemsById[id];
    if (!item) return { ok: false, reason: 'unknown-equipment', itemId: id };
    if (!this.config.store.equipmentIds.includes(id)) {
      return { ok: false, reason: 'not-for-sale', itemId: id };
    }
    if (this.state.ownedEquipment.includes(id)) {
      return { ok: false, reason: 'already-owned', itemId: id };
    }
    if (item.requiresItemId && !this.state.ownedEquipment.includes(item.requiresItemId)) {
      return {
        ok: false,
        reason: 'missing-prerequisite',
        itemId: id,
        requiredItemId: item.requiresItemId,
      };
    }
    if (this.state.cash < item.cost) {
      return { ok: false, reason: 'insufficient-cash', itemId: id, cost: item.cost, cash: this.state.cash };
    }

    this.state.cash -= item.cost;
    this.state.ownedEquipment.push(id);
    const previousItemId = this.state.equipment[item.slotId] || null;
    const equipped = options.equip !== false;
    if (equipped) this.state.equipment[item.slotId] = id;
    const milestones = this.evaluateMilestones();
    const result = {
      ok: true,
      itemId: id,
      slotId: item.slotId,
      cost: item.cost,
      equipped,
      previousItemId,
      miningStats: this.getMiningStats(),
      milestones,
    };
    this.saveCheckpoint('equipment-purchase');
    this.emit('purchase', result);
    return result;
  }

  buyScratchTicket(ticketId) {
    if (!this.state) throw new Error('IncrementalGame must be started before purchasing lottery tickets.');
    const id = normalizedId(ticketId);
    const ticket = this.config.lottery.scratchTicketsById[id];
    if (!ticket) return { ok: false, reason: 'unknown-ticket', ticketId: id };
    if (!this.config.store.scratchTicketIds.includes(id)) {
      return { ok: false, reason: 'not-for-sale', ticketId: id };
    }
    if (this.state.cash < ticket.cost) {
      return { ok: false, reason: 'insufficient-cash', ticketId: id, cost: ticket.cost, cash: this.state.cash };
    }

    this.state.cash -= ticket.cost;
    this.state.lotteryState.scratchTickets.push(id);
    this.state.statistics.lotteryTicketsPurchased = safeAdd(
      this.state.statistics.lotteryTicketsPurchased,
      1,
    );
    const result = {
      ok: true,
      ticketId: id,
      cost: ticket.cost,
      pending: this.state.lotteryState.scratchTickets.filter((entry) => entry === id).length,
    };
    this.saveCheckpoint('scratch-ticket-purchase');
    this.emit('lottery-ticket', result);
    return result;
  }

  scratchTicket(ticketId) {
    if (!this.state) throw new Error('IncrementalGame must be started before scratching lottery tickets.');
    const id = normalizedId(ticketId);
    const ticket = this.config.lottery.scratchTicketsById[id];
    if (!ticket) return { ok: false, reason: 'unknown-ticket', ticketId: id };
    const ownedIndex = this.state.lotteryState.scratchTickets.indexOf(id);
    if (ownedIndex < 0) return { ok: false, reason: 'ticket-not-owned', ticketId: id };

    this.state.lotteryState.scratchTickets.splice(ownedIndex, 1);
    const prize = rollScratchPrize(ticket, this.random);
    const reward = prize.reward;
    if (reward.type === 'cash') {
      this.state.cash = safeAdd(this.state.cash, reward.amount);
    } else if (reward.type === 'resource') {
      this.state.materials[reward.resourceId] = safeAdd(
        this.state.materials[reward.resourceId],
        reward.amount,
      );
    } else if (reward.type === 'free-ticket') {
      this.state.lotteryState.scratchTickets.push(reward.ticketId);
    }

    this.state.statistics.lotteryWinnings = safeAdd(
      this.state.statistics.lotteryWinnings,
      prize.estimatedValue,
    );
    this.state.statistics.largestLotteryWin = Math.max(
      this.state.statistics.largestLotteryWin,
      prize.estimatedValue,
    );
    const milestones = this.evaluateMilestones();
    const result = {
      ok: true,
      ticketId: id,
      prizeId: prize.id,
      label: prize.label,
      reward: clone(reward),
      value: prize.estimatedValue,
      pending: this.state.lotteryState.scratchTickets.filter((entry) => entry === id).length,
      milestones,
    };
    this.saveCheckpoint('scratch-ticket-reveal');
    this.emit('lottery', result);
    return result;
  }

  buyOutContract() {
    if (!this.state) throw new Error('IncrementalGame must be started before buying out the contract.');
    if (this.state.storyStage !== 'employee' || !this.state.employment.active) {
      return { ok: false, reason: 'not-employed' };
    }
    const cost = this.config.employment.contractBuyoutCost;
    if (this.state.cash < cost) {
      return { ok: false, reason: 'insufficient-cash', cost, cash: this.state.cash };
    }

    this.state.cash -= cost;
    this.state.storyStage = 'independent';
    this.state.employment.active = false;
    this.state.employment.contractBuyoutPaid = cost;
    this.state.employment.endedAt = this.clock();
    const milestones = this.evaluateMilestones();
    const result = { ok: true, cost, storyStage: this.state.storyStage, milestones };
    this.saveCheckpoint('contract-buyout');
    this.emit('story', { type: 'contract-buyout', ...result });
    return result;
  }

  applyLevelProgression() {
    let levelsGained = 0;
    let skillPointsGained = 0;
    while (levelsGained < 10_000 && this.state.character.xp >= this.getXpRequired()) {
      const required = this.getXpRequired();
      this.state.character.xp -= required;
      this.state.character.level += 1;
      const awarded = this.config.progression.skillPointsPerLevel;
      this.state.character.skillPoints = safeAdd(this.state.character.skillPoints, awarded);
      levelsGained += 1;
      skillPointsGained = safeAdd(skillPointsGained, awarded);
    }
    return {
      levelsGained,
      skillPointsGained,
      level: this.state.character.level,
      xp: this.state.character.xp,
      xpRequired: this.getXpRequired(),
    };
  }

  milestoneTriggerMet(milestone) {
    const { type, value } = milestone.trigger;
    if (type === 'start') return true;
    if (type === 'level') return this.state.character.level >= value;
    if (type === 'cash') return this.state.cash >= value;
    if (type === 'stage') return this.state.storyStage === value;
    if (type === 'contract-affordable') {
      return this.state.storyStage === 'employee'
        && this.state.cash >= this.config.employment.contractBuyoutCost;
    }
    return false;
  }

  evaluateMilestones() {
    const unlocked = [];
    this.config.story.milestones.forEach((milestone) => {
      if (this.state.milestones.includes(milestone.id) || !this.milestoneTriggerMet(milestone)) return;
      this.state.milestones.push(milestone.id);
      const detail = clone(milestone);
      unlocked.push(detail);
      this.emit('milestone', detail);
    });
    return unlocked;
  }

  mine() {
    if (!this.state) throw new Error('IncrementalGame must be started before mining.');
    const deposit = this.config.depositsById[this.state.currentDeposit.id];
    if (!deposit) throw new Error(`Current deposit "${this.state.currentDeposit.id}" is unavailable.`);

    const miningStats = this.getMiningStats();
    const critical = rollChance(miningStats.criticalChance, this.random);
    const rawDamage = miningStats.manualPower * (critical ? miningStats.criticalDamage : 1);
    const damage = Math.min(rawDamage, this.state.currentDeposit.hp);
    this.state.currentDeposit.hp = Math.max(0, this.state.currentDeposit.hp - damage);
    this.state.statistics.totalManualSwings = safeAdd(this.state.statistics.totalManualSwings, 1);

    if (this.state.currentDeposit.hp > 0) {
      const result = { type: 'hit', damage, depositId: deposit.id, critical };
      this.emit('mine', result);
      return result;
    }

    return this.breakDeposit(deposit, damage, { critical, miningStats });
  }

  breakDeposit(deposit, damage, hit = {}) {
    const source = hit.source === 'automation' ? 'automation' : 'manual';
    const automated = source === 'automation';
    const resource = this.config.resourcesById[deposit.resourceId];
    const baseQuantity = rollDepositReward(deposit, this.random);
    const bonusQuantity = !automated && rollChance(hit.miningStats?.oreYieldChance || 0, this.random) ? 1 : 0;
    const quantity = baseQuantity + bonusQuantity;
    const grossValue = quantity * resource.value;
    const employeeStage = this.state.storyStage === 'employee' && this.state.employment.active;
    let wage = 0;

    if (employeeStage) {
      this.state.employment.companyResources[resource.id] += quantity;
      wage = Math.max(
        this.config.balance.minimumWage,
        Math.floor(grossValue * this.config.balance.employeeWageShare),
      );
      this.state.cash = safeAdd(this.state.cash, wage);
      this.state.employment.totalWages = safeAdd(this.state.employment.totalWages, wage);
      this.state.employment.companyValue = safeAdd(
        this.state.employment.companyValue,
        Math.max(0, grossValue - wage),
      );
      this.state.statistics.lifetimeEarnings = safeAdd(this.state.statistics.lifetimeEarnings, wage);
    } else {
      this.state.materials[resource.id] = safeAdd(this.state.materials[resource.id], quantity);
    }

    const xp = automated ? 0 : deposit.xp;
    this.state.character.xp = safeAdd(this.state.character.xp, xp);
    this.state.statistics.totalDepositsBroken = safeAdd(this.state.statistics.totalDepositsBroken, 1);
    this.state.statistics.totalOreMined = safeAdd(this.state.statistics.totalOreMined, quantity);
    this.state.statistics.resourceTotals[resource.id] = safeAdd(
      this.state.statistics.resourceTotals[resource.id],
      quantity,
    );
    if (automated) {
      this.state.statistics.totalAutomatedProduction = safeAdd(
        this.state.statistics.totalAutomatedProduction,
        quantity,
      );
    }
    const levelResult = automated
      ? {
          levelsGained: 0,
          skillPointsGained: 0,
          level: this.state.character.level,
          xp: this.state.character.xp,
          xpRequired: this.getXpRequired(),
        }
      : this.applyLevelProgression();

    const nextDeposit = selectWeightedDeposit(this.config, this.state.currentMine, this.random);
    this.state.currentDeposit = {
      id: nextDeposit.id,
      hp: nextDeposit.maxHp,
      maxHp: nextDeposit.maxHp,
    };

    if (levelResult.levelsGained > 0) this.emit('level-up', levelResult);
    const milestones = this.evaluateMilestones();
    const result = {
      type: 'break',
      source,
      damage,
      critical: Boolean(hit.critical),
      depositId: deposit.id,
      resourceId: resource.id,
      quantity,
      baseQuantity,
      bonusQuantity,
      grossValue,
      wage,
      xp,
      levelsGained: levelResult.levelsGained,
      skillPointsGained: levelResult.skillPointsGained,
      level: levelResult.level,
      destination: employeeStage ? 'employer' : 'player',
      nextDepositId: nextDeposit.id,
      milestones,
    };
    if (hit.save !== false) this.saveCheckpoint('deposit-break');
    if (hit.emit !== false) this.emit(automated ? 'automation' : 'mine', result);
    return result;
  }

  applyAutomation(deltaSeconds) {
    if (!this.state?.company?.created) {
      return { damage: 0, depositsBroken: 0, resources: {}, productionPower: 0 };
    }
    const productionPower = this.getAutomationPower();
    let remainingDamage = safeMultiply(productionPower, deltaSeconds);
    if (!(remainingDamage > 0)) {
      return { damage: 0, depositsBroken: 0, resources: {}, productionPower };
    }

    let damage = 0;
    let depositsBroken = 0;
    const resources = {};
    const breaks = [];
    while (remainingDamage > 0 && depositsBroken < this.config.balance.maxAutomationBreaksPerTick) {
      const deposit = this.config.depositsById[this.state.currentDeposit.id];
      if (!deposit) break;
      const appliedDamage = Math.min(remainingDamage, this.state.currentDeposit.hp);
      this.state.currentDeposit.hp = Math.max(0, this.state.currentDeposit.hp - appliedDamage);
      damage = safeAdd(damage, appliedDamage);
      remainingDamage = Math.max(0, remainingDamage - appliedDamage);
      if (this.state.currentDeposit.hp > 0) break;

      const result = this.breakDeposit(deposit, appliedDamage, {
        source: 'automation',
        miningStats: { oreYieldChance: 0 },
        save: false,
        emit: false,
      });
      depositsBroken += 1;
      resources[result.resourceId] = safeAdd(resources[result.resourceId] || 0, result.quantity);
      breaks.push(result);
    }

    const result = { damage, depositsBroken, resources, productionPower, breaks };
    if (depositsBroken > 0) this.emit('automation', result);
    return result;
  }

  update(deltaSeconds) {
    if (!this.state) return null;
    const delta = Number(deltaSeconds);
    if (!Number.isFinite(delta) || delta <= 0) return null;
    const safeDelta = Math.min(delta, 60);
    const automation = this.applyAutomation(safeDelta);
    this.state.statistics.timePlayed = safeAdd(this.state.statistics.timePlayed, safeDelta);
    this.autosaveElapsed += safeDelta;
    if (this.autosaveElapsed >= this.config.balance.autosaveSeconds) {
      this.autosaveElapsed %= this.config.balance.autosaveSeconds;
      this.saveCheckpoint('autosave');
    }
    return { deltaSeconds: safeDelta, automation };
  }

  saveCheckpoint(reason = 'manual') {
    if (!this.state) return false;
    this.state.lastPlayed = this.clock();
    const saved = this.saveAdapter.save(this.state);
    this.emit('save', { reason, saved });
    return saved;
  }

  snapshot() {
    return this.state ? clone(this.state) : null;
  }

  dispose() {
    if (this.state) this.saveCheckpoint('exit');
    this.listeners.clear();
  }
}

import {
  rollChance,
  rollDepositReward,
  rollScratchPrize,
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
    if (this.state.storyStage !== 'independent' || this.state.employment.active) {
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
    const resource = this.config.resourcesById[deposit.resourceId];
    const baseQuantity = rollDepositReward(deposit, this.random);
    const bonusQuantity = rollChance(hit.miningStats?.oreYieldChance || 0, this.random) ? 1 : 0;
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

    this.state.character.xp = safeAdd(this.state.character.xp, deposit.xp);
    this.state.statistics.totalDepositsBroken = safeAdd(this.state.statistics.totalDepositsBroken, 1);
    this.state.statistics.totalOreMined = safeAdd(this.state.statistics.totalOreMined, quantity);
    this.state.statistics.resourceTotals[resource.id] = safeAdd(
      this.state.statistics.resourceTotals[resource.id],
      quantity,
    );
    const levelResult = this.applyLevelProgression();

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
      damage,
      critical: Boolean(hit.critical),
      depositId: deposit.id,
      resourceId: resource.id,
      quantity,
      baseQuantity,
      bonusQuantity,
      grossValue,
      wage,
      xp: deposit.xp,
      levelsGained: levelResult.levelsGained,
      skillPointsGained: levelResult.skillPointsGained,
      level: levelResult.level,
      destination: employeeStage ? 'employer' : 'player',
      nextDepositId: nextDeposit.id,
      milestones,
    };
    this.saveCheckpoint('deposit-break');
    this.emit('mine', result);
    return result;
  }

  update(deltaSeconds) {
    if (!this.state) return;
    const delta = Number(deltaSeconds);
    if (!Number.isFinite(delta) || delta <= 0) return;
    const safeDelta = Math.min(delta, 60);
    this.state.statistics.timePlayed = safeAdd(this.state.statistics.timePlayed, safeDelta);
    this.autosaveElapsed += safeDelta;
    if (this.autosaveElapsed >= this.config.balance.autosaveSeconds) {
      this.autosaveElapsed %= this.config.balance.autosaveSeconds;
      this.saveCheckpoint('autosave');
    }
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

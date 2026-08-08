import {
  rollChance,
  rollDepositReward,
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
    this.state = source === 'save'
      ? this.reconcileState(loaded)
      : createInitialIncrementalSnapshot(this.config, {
        now: this.clock(),
        gameVersion: this.gameVersion,
      });
    this.autosaveElapsed = 0;

    const levelResult = this.applyLevelProgression();
    this.emit('ready', { source });
    if (levelResult.levelsGained > 0) this.emit('level-up', levelResult);
    const milestones = this.evaluateMilestones();
    if (source !== 'save' || levelResult.levelsGained > 0 || milestones.length > 0) {
      this.saveCheckpoint(source === 'save' ? 'progression-migration' : 'new-game');
    }
    return { source, state: this.state };
  }

  startNew() {
    return this.start({ forceNew: true });
  }

  reconcileState(snapshot) {
    const state = clone(snapshot);
    this.config.skills.forEach((skill) => {
      if (!Number.isInteger(state.skills[skill.id])) state.skills[skill.id] = 0;
    });
    return state;
  }

  isStateCompatible(snapshot) {
    if (!validateIncrementalSnapshot(snapshot)) return false;
    const mine = this.config.minesById[snapshot.currentMine];
    const deposit = this.config.depositsById[snapshot.currentDeposit.id];
    if (!mine || !deposit || !mine.depositIds.includes(deposit.id)) return false;
    if (snapshot.currentDeposit.maxHp !== deposit.maxHp || snapshot.currentDeposit.hp > deposit.maxHp) return false;
    if (snapshot.unlockedMines.some((id) => !this.config.minesById[id])) return false;
    if (snapshot.employment.companyId !== this.config.employment.companyId) return false;

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

  getMiningStats() {
    return {
      manualPower: this.config.balance.manualPower + this.getSkillBonus('manual-power-flat'),
      miningSpeed: 1 + this.getSkillBonus('mining-speed'),
      criticalChance: Math.min(0.95, this.config.balance.baseCriticalChance + this.getSkillBonus('critical-chance')),
      criticalDamage: Math.max(1, this.config.balance.baseCriticalDamage + this.getSkillBonus('critical-damage')),
      oreYieldChance: Math.min(0.95, this.config.balance.baseOreYieldChance + this.getSkillBonus('ore-yield-chance')),
      rareFindChance: Math.min(0.95, this.getSkillBonus('rare-find-chance')),
      automationBonus: this.getSkillBonus('automation-bonus'),
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

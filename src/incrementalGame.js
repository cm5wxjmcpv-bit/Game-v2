import {
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
    if (loaded && this.isStateCompatible(loaded)) {
      this.state = loaded;
      this.autosaveElapsed = 0;
      this.emit('ready', { source: 'save' });
      return { source: 'save', state: this.state };
    }

    this.state = createInitialIncrementalSnapshot(this.config, {
      now: this.clock(),
      gameVersion: this.gameVersion,
    });
    this.autosaveElapsed = 0;
    this.saveCheckpoint('new-game');
    this.emit('ready', { source: loaded ? 'invalid-save' : 'new' });
    return { source: loaded ? 'invalid-save' : 'new', state: this.state };
  }

  startNew() {
    return this.start({ forceNew: true });
  }

  isStateCompatible(snapshot) {
    if (!validateIncrementalSnapshot(snapshot)) return false;
    const mine = this.config.minesById[snapshot.currentMine];
    const deposit = this.config.depositsById[snapshot.currentDeposit.id];
    if (!mine || !deposit || !mine.depositIds.includes(deposit.id)) return false;
    if (snapshot.currentDeposit.maxHp !== deposit.maxHp || snapshot.currentDeposit.hp > deposit.maxHp) return false;
    if (snapshot.unlockedMines.some((id) => !this.config.minesById[id])) return false;

    const knownResources = new Set(this.config.resources.map((resource) => resource.id));
    const resourceMaps = [
      snapshot.materials,
      snapshot.employment.companyResources,
      snapshot.statistics.resourceTotals,
    ];
    return resourceMaps.every((map) => (
      Object.keys(map).every((id) => knownResources.has(id)) &&
      this.config.resources.every((resource) => Number.isFinite(map[resource.id]) && map[resource.id] >= 0)
    ));
  }

  getManualPower() {
    return this.config.balance.manualPower;
  }

  getXpRequired() {
    return xpRequiredForLevel(this.config, this.state?.character?.level || 1);
  }

  mine() {
    if (!this.state) throw new Error('IncrementalGame must be started before mining.');
    const deposit = this.config.depositsById[this.state.currentDeposit.id];
    if (!deposit) throw new Error(`Current deposit "${this.state.currentDeposit.id}" is unavailable.`);

    const damage = Math.min(this.getManualPower(), this.state.currentDeposit.hp);
    this.state.currentDeposit.hp = Math.max(0, this.state.currentDeposit.hp - damage);
    this.state.statistics.totalManualSwings += 1;

    if (this.state.currentDeposit.hp > 0) {
      const result = { type: 'hit', damage, depositId: deposit.id };
      this.emit('mine', result);
      return result;
    }

    return this.breakDeposit(deposit, damage);
  }

  breakDeposit(deposit, damage) {
    const resource = this.config.resourcesById[deposit.resourceId];
    const quantity = rollDepositReward(deposit, this.random);
    const grossValue = quantity * resource.value;
    const employeeStage = this.state.storyStage === 'employee';
    let wage = 0;

    if (employeeStage) {
      this.state.employment.companyResources[resource.id] += quantity;
      wage = Math.max(
        this.config.balance.minimumWage,
        Math.floor(grossValue * this.config.balance.employeeWageShare),
      );
      this.state.cash += wage;
      this.state.employment.totalWages += wage;
      this.state.employment.companyValue += Math.max(0, grossValue - wage);
      this.state.statistics.lifetimeEarnings += wage;
    } else {
      this.state.materials[resource.id] += quantity;
    }

    this.state.character.xp += deposit.xp;
    this.state.statistics.totalDepositsBroken += 1;
    this.state.statistics.totalOreMined += quantity;
    this.state.statistics.resourceTotals[resource.id] += quantity;

    const nextDeposit = selectWeightedDeposit(this.config, this.state.currentMine, this.random);
    this.state.currentDeposit = {
      id: nextDeposit.id,
      hp: nextDeposit.maxHp,
      maxHp: nextDeposit.maxHp,
    };

    const result = {
      type: 'break',
      damage,
      depositId: deposit.id,
      resourceId: resource.id,
      quantity,
      grossValue,
      wage,
      xp: deposit.xp,
      destination: employeeStage ? 'employer' : 'player',
      nextDepositId: nextDeposit.id,
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
    this.state.statistics.timePlayed += safeDelta;
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

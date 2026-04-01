import { StateManager, GAME_STATES } from './stateManager.js';
import { canWalkTo, distance } from './collision.js';
import { createEnemy, createPlayer } from './entityFactory.js';
import { updateEnemies } from './enemyAI.js';
import { updateAutoAttack } from './combat.js';
import { rollDrops } from './drops.js';
import { applyTileEffect } from './tileEffects.js';
import { getNearbyPortal, getUnlockedPortalLevels } from './portalSystem.js';
import { buyFromShop, sellToShop } from './shops.js';
import { saveGame, loadGame } from './saveSystem.js';
import { updateStatusEffects } from './statusEffects.js';
import { loadDatabase } from './dataLoader.js';
import { Camera } from './camera.js';
import { BattleSystem } from './battleSystem.js';

const GAMEPLAY_STATES = [GAME_STATES.TOWN, GAME_STATES.LEVEL];

export class Game {
  constructor({ renderer, input, debug, audio, ui }) {
    this.renderer = renderer;
    this.input = input;
    this.debug = debug;
    this.audio = audio;
    this.ui = ui;

    this.state = new StateManager(GAME_STATES.MAIN_MENU);
    this.dt = 0;
    this.db = null;
    this.player = null;
    this.currentMap = null;
    this.currentEnemies = [];
    this.currentTownId = null;
    this.camera = new Camera(this.renderer.canvas.width, this.renderer.canvas.height);

    this.showMiniMap = false;   // 👈 ADD THIS LINE

    this.fx = { hitMarkers: [] };
    this.battleSystem = new BattleSystem(this);
    this.randomEncounter = {
      elapsedSeconds: 0,
      nextInSeconds: 0,
      graceRemainingSeconds: 0,
    };
    this.playerMovedThisFrame = false;
  }

  async init() {
    this.db = await loadDatabase();
    this.currentTownId = this.db.world.start.townId;
    this.ui.showMainMenu(this.startNew.bind(this), this.tryLoadSave.bind(this), this.db.classes);
  }

  startNew(classId) {
    const classData = this.db.classesById[classId];
    if (!classData) {
      this.ui.flash(`Unknown class: ${classId}`);
      return;
    }

    this.player = createPlayer(classData, this.db.itemsById, this.db.world.start);
    this.ensureBattleProgressState();
    this.ensurePlayerAnimationState();
    this.loadTown(this.currentTownId);
    this.state.set(GAME_STATES.TOWN);
    this.ui.hideOverlay();
    this.saveCheckpoint();
  }

  tryLoadSave() {
    const save = loadGame();
    if (!save) return this.ui.flash('No save found.');

    this.player = save.player;
    this.ensureBattleProgressState();
    this.ensurePlayerAnimationState();
    this.currentTownId = save.currentTownId || this.db.world.start.townId;
    this.loadTown(this.currentTownId);
    this.state.set(GAME_STATES.TOWN);
    this.ui.hideOverlay();
  }

  loadTown(townId) {
    const town = this.db.townsById[townId];
    if (!town) {
      this.ui.flash(`Town not found: ${townId}`);
      return;
    }

    this.currentMap = structuredClone(town);
    this.currentTownId = townId;
    this.currentEnemies = [];
    this.resetRandomEncounterTimer(true);
    this.player.x = this.currentMap.spawn.x;
    this.player.y = this.currentMap.spawn.y;
  }

  loadLevel(levelId) {
    const level = this.db.levelsById[levelId];
    if (!level) {
      this.ui.flash(`Level not found: ${levelId}`);
      return;
    }

    this.currentMap = structuredClone(level);
    if (this.currentMap.objects.battleTriggers?.length) {
      this.currentEnemies = [];
    } else {
      this.currentEnemies = (this.currentMap.objects.enemySpawns || []).map((spawn) => {
        const template = this.db.enemiesById[spawn.enemyId];
        return createEnemy(template, spawn);
      });
    }
    this.player.x = this.currentMap.spawn.x;
    this.player.y = this.currentMap.spawn.y;
    this.resetRandomEncounterTimer(true);
    this.randomEncounter.graceRemainingSeconds = 5;
    this.state.set(GAME_STATES.LEVEL);
  }

  update(dt, now) {
    this.dt = dt;
    if (!this.player || !this.currentMap) return;

    if (this.input.wasActionPressed('debug')) this.debug.toggle();
    if (this.input.wasActionPressed('pause')) this.togglePause();

    const hasOverlay = this.ui.isOverlayOpen();
    const canSimulate = this.isGameplayState() && !this.state.is(GAME_STATES.PAUSE) && !hasOverlay;
    this.playerMovedThisFrame = false;
    if (this.state.is(GAME_STATES.BATTLE) && !this.state.is(GAME_STATES.PAUSE) && !hasOverlay) {
      this.battleSystem.update();
    }
    if (canSimulate) {
      this.updateMovement(dt);
      this.updateInteraction();
      if (this.state.is(GAME_STATES.LEVEL)) {
        this.tryStartBattleFromTrigger();
        if (!this.state.is(GAME_STATES.BATTLE)) {
          this.updateRandomEncounters(dt);
        }
        if (!this.usesTriggerBattles()) {
          updateEnemies(this, dt, now / 1000);
          updateAutoAttack(this, dt);
        }
      }
      updateStatusEffects(this.player, dt);
      this.applyCurrentTileEffect();
    }

    this.ui.renderHud(this);
    this.renderer.render(this);
    this.input.clearFrameState();
  }

  togglePause() {
    if (this.state.is(GAME_STATES.PAUSE)) {
      this.state.resume(this.currentEnemies.length > 0 ? GAME_STATES.LEVEL : GAME_STATES.TOWN);
      return;
    }

    if (this.isGameplayState()) {
      this.state.pause();
    }
  }

  isGameplayState() {
    return GAMEPLAY_STATES.includes(this.state.current);
  }

  ensureBattleProgressState() {
    if (!Array.isArray(this.player.completedBattleTriggers)) {
      this.player.completedBattleTriggers = [];
    }
  }

  hasCompletedBattleTrigger(mapId, triggerId) {
    return this.player.completedBattleTriggers.includes(`${mapId}:${triggerId}`);
  }

  isPlayerInsideTrigger(trigger) {
    const width = trigger.width ?? 1;
    const height = trigger.height ?? 1;
    return this.player.x >= trigger.x &&
      this.player.x < trigger.x + width &&
      this.player.y >= trigger.y &&
      this.player.y < trigger.y + height;
  }

  tryStartBattleFromTrigger() {
    const triggers = this.currentMap.objects.battleTriggers || [];
    const trigger = triggers.find((entry) => {
      if (!entry.encounterId) return false;
      if (entry.once && this.hasCompletedBattleTrigger(this.currentMap.id, entry.id)) return false;
      return this.isPlayerInsideTrigger(entry);
    });
    if (!trigger) return;

    const started = this.battleSystem.startFromTrigger(trigger);
    if (started) this.state.set(GAME_STATES.BATTLE);
  }

  usesTriggerBattles() {
    return Boolean(this.currentMap?.objects?.battleTriggers?.length);
  }

  applyCurrentTileEffect() {
    const tx = Math.floor(this.player.x);
    const ty = Math.floor(this.player.y);
    const tileId = this.currentMap.tiles[ty]?.[tx];
    const tileDef = this.db.tileDefs[tileId];
    if (!tileDef) return;
    applyTileEffect(this, tileDef);
  }

  updateMovement(dt) {
    this.ensurePlayerAnimationState();
    const prevX = this.player.x;
    const prevY = this.player.y;
    const baseSpeed = this.player.speed * (this.player.speedModifier || 1);
    let nx = this.player.x;
    let ny = this.player.y;
    if (this.input.isActionDown('up')) ny -= baseSpeed * dt;
    if (this.input.isActionDown('down')) ny += baseSpeed * dt;
    if (this.input.isActionDown('left')) nx -= baseSpeed * dt;
    if (this.input.isActionDown('right')) nx += baseSpeed * dt;
    if (canWalkTo(this.currentMap, nx, ny, this.db.tileDefs)) {
      this.player.x = nx;
      this.player.y = ny;
    }
    this.playerMovedThisFrame = Math.abs(this.player.x - prevX) > 0.0001 || Math.abs(this.player.y - prevY) > 0.0001;
    this.updatePlayerAnimation(dt, this.player.x - prevX, this.player.y - prevY);
  }

  updateRandomEncounters(dt) {
    const config = this.currentMap.randomEncounters;
    if (!config?.enabled || !config.tableId) return;
    if (this.randomEncounter.graceRemainingSeconds > 0) {
      this.randomEncounter.graceRemainingSeconds = Math.max(0, this.randomEncounter.graceRemainingSeconds - dt);
      return;
    }
    if (!this.playerMovedThisFrame) return;

    if (!this.randomEncounter.nextInSeconds) {
      this.randomEncounter.nextInSeconds = this.rollRandomEncounterDelay(config.minSeconds, config.maxSeconds);
    }

    this.randomEncounter.elapsedSeconds += dt;
    if (this.randomEncounter.elapsedSeconds < this.randomEncounter.nextInSeconds) return;

    const encounterId = this.chooseEncounterFromTable(config.tableId);
    if (!encounterId) {
      this.resetRandomEncounterTimer(true);
      return;
    }

    const started = this.battleSystem.startRandomEncounter(encounterId);
    if (started) {
      this.state.set(GAME_STATES.BATTLE);
      this.resetRandomEncounterTimer(true);
    }
  }

  rollRandomEncounterDelay(minSeconds = 10, maxSeconds = 60) {
    const min = Math.max(1, Math.min(minSeconds, maxSeconds));
    const max = Math.max(min, Math.max(minSeconds, maxSeconds));
    return min + Math.random() * (max - min);
  }

  chooseEncounterFromTable(tableId) {
    const table = this.db.encounterTablesById[tableId];
    if (!table) {
      console.warn(`[Game] Random encounter table not found: ${tableId}`);
      return null;
    }

    const entries = (table.entries || []).filter((entry) =>
      entry &&
      typeof entry.encounterId === 'string' &&
      Number.isFinite(entry.weight) &&
      entry.weight > 0 &&
      this.db.encountersById[entry.encounterId]
    );
    if (!entries.length) {
      console.warn(`[Game] Random encounter table "${tableId}" has no valid entries.`);
      return null;
    }

    const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = Math.random() * totalWeight;
    for (const entry of entries) {
      roll -= entry.weight;
      if (roll <= 0) return entry.encounterId;
    }
    return entries[entries.length - 1].encounterId;
  }

  resetRandomEncounterTimer(rollNew = false) {
    this.randomEncounter.elapsedSeconds = 0;
    this.randomEncounter.nextInSeconds = 0;
    this.randomEncounter.graceRemainingSeconds = 0;
    if (!rollNew) return;
    const config = this.currentMap?.randomEncounters;
    if (!config?.enabled) return;
    this.randomEncounter.nextInSeconds = this.rollRandomEncounterDelay(config.minSeconds, config.maxSeconds);
  }

  onBattleEnded(_result, sourceType) {
    if (sourceType === 'random') this.resetRandomEncounterTimer(true);
  }

  updateInteraction() {
    if (!this.input.wasActionPressed('interact')) return;

    const nearbyPortal = getNearbyPortal(this.player, this.currentMap);
    if (nearbyPortal) {
      if (nearbyPortal.targetTown) {
        this.loadTown(nearbyPortal.targetTown);
        this.state.set(GAME_STATES.TOWN);
      } else {
        const unlocked = getUnlockedPortalLevels(this.player, nearbyPortal);
        this.ui.showLevelSelect(unlocked, this.player.completedLevels, (levelId) => this.loadLevel(levelId));
      }
      return;
    }

    const shop = (this.currentMap.objects.shops || []).find((s) => distance(s, this.player) <= 1.1);
    if (shop) {
      const shopData = structuredClone(this.db.shopsById[shop.shopId]);
      this.state.set(GAME_STATES.SHOP);
      this.ui.showShop(shopData, this.player, this.db, {
        onBuy: (offer) => buyFromShop(this.player, shopData, offer, this.db),
        onSell: (itemId) => sellToShop(this.player, itemId, shopData, this.db),
        onClose: () => {
          this.state.set(GAME_STATES.TOWN);
          this.saveCheckpoint();
        },
      });
      return;
    }

    const fountain = (this.currentMap.objects.fountains || []).find((f) => distance(f, this.player) <= 1.1);
    if (fountain) {
      this.player.stats.hp = this.player.stats.maxHp;
      this.audio.play('heal');
      this.ui.flash('Health restored at the fountain.');
    }
  }

  onEnemyDefeated(enemy) {
    const result = rollDrops(enemy.template, this.player, this.db.itemsById);
    this.ui.flash(`Defeated ${enemy.template.name}: +${result.gold} gold`);

    const allDead = this.currentEnemies.every((e) => e.dead);
    if (allDead && this.state.is(GAME_STATES.LEVEL)) {
      const levelId = this.currentMap.id;
      if (!this.player.completedLevels.includes(levelId)) {
        this.player.completedLevels.push(levelId);
        this.unlockNextLevels(levelId);
      }
      this.ui.flash(`Level complete: ${this.currentMap.name}`);
      this.saveCheckpoint();
    }
  }

  unlockNextLevels(levelId) {
    const next = this.db.progression.unlocks[levelId] || [];
    next.forEach((id) => {
      if (!this.player.unlocks.levels.includes(id)) this.player.unlocks.levels.push(id);
    });
  }

  onPlayerDefeated() {
    this.state.set(GAME_STATES.GAME_OVER);
    this.ui.showGameOver(() => {
      this.player.stats.hp = this.player.stats.maxHp;
      this.loadTown(this.currentTownId);
      this.state.set(GAME_STATES.TOWN);
    });
  }

  saveCheckpoint() {
    saveGame({ player: this.player, currentTownId: this.currentTownId });
  }

  ensurePlayerAnimationState() {
    if (!this.player) return;
    const anim = this.player.animation || {};
    const sprite = anim.sprite || {};
    this.player.animation = {
      facing: anim.facing || this.player.facing || 'down',
      state: anim.state || 'idle',
      frameIndex: Number.isFinite(anim.frameIndex) ? anim.frameIndex : 0,
      frameTimer: Number.isFinite(anim.frameTimer) ? anim.frameTimer : 0,
      frameDuration: Number.isFinite(anim.frameDuration) ? anim.frameDuration : 0.16,
      sprite: {
        imagePath: sprite.imagePath || 'assets/characters/Warrior_Blue.png',
       frameWidth: Number.isFinite(sprite.frameWidth) ? sprite.frameWidth : 192,
frameHeight: Number.isFinite(sprite.frameHeight) ? sprite.frameHeight : 192,
idleFrames: Array.isArray(sprite.idleFrames) && sprite.idleFrames.length ? sprite.idleFrames : [0, 1, 2],
walkFrames: Array.isArray(sprite.walkFrames) && sprite.walkFrames.length ? sprite.walkFrames : [0, 1, 2],
        rowByFacing: sprite.rowByFacing || {
          down: { idle: 0, walk: 1 },
          left: { idle: 2, walk: 3 },
          right: { idle: 4, walk: 5 },
          up: { idle: 6, walk: 7 },
        },
      },
    };
  }

  updatePlayerAnimation(dt, dx, dy) {
    const anim = this.player.animation;
    const moved = Math.abs(dx) > 0.0001 || Math.abs(dy) > 0.0001;
    if (moved) {
      if (Math.abs(dx) >= Math.abs(dy)) {
        anim.facing = dx >= 0 ? 'right' : 'left';
      } else {
        anim.facing = dy >= 0 ? 'down' : 'up';
      }
      anim.state = 'walk';
      anim.frameTimer += dt;
      const frames = anim.sprite.walkFrames;
      while (anim.frameTimer >= anim.frameDuration) {
        anim.frameTimer -= anim.frameDuration;
        anim.frameIndex = (anim.frameIndex + 1) % frames.length;
      }
      this.player.facing = anim.facing;
      return;
    }

    anim.state = 'idle';
    anim.frameIndex = 0;
    anim.frameTimer = 0;
    this.player.facing = anim.facing;
  }
}

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
    this.fx = { hitMarkers: [] };
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
    this.loadTown(this.currentTownId);
    this.state.set(GAME_STATES.TOWN);
    this.ui.hideOverlay();
    this.saveCheckpoint();
  }

  tryLoadSave() {
    const save = loadGame();
    if (!save) return this.ui.flash('No save found.');

    this.player = save.player;
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
    this.currentEnemies = (this.currentMap.objects.enemySpawns || []).map((spawn) => {
      const template = this.db.enemiesById[spawn.enemyId];
      return createEnemy(template, spawn);
    });
    this.player.x = this.currentMap.spawn.x;
    this.player.y = this.currentMap.spawn.y;
    this.state.set(GAME_STATES.LEVEL);
  }

  update(dt, now) {
    this.dt = dt;
    if (!this.player || !this.currentMap) return;

    if (this.input.wasActionPressed('debug')) this.debug.toggle();
    if (this.input.wasActionPressed('pause')) this.togglePause();

    const hasOverlay = this.ui.isOverlayOpen();
    const canSimulate = this.isGameplayState() && !this.state.is(GAME_STATES.PAUSE) && !hasOverlay;
    if (canSimulate) {
      this.updateMovement(dt);
      this.updateInteraction();
      if (this.state.is(GAME_STATES.LEVEL)) {
        updateEnemies(this, dt, now / 1000);
        updateAutoAttack(this, dt);
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

  applyCurrentTileEffect() {
    const tx = Math.floor(this.player.x);
    const ty = Math.floor(this.player.y);
    const tileId = this.currentMap.tiles[ty]?.[tx];
    const tileDef = this.db.tileDefs[tileId];
    if (!tileDef) return;
    applyTileEffect(this, tileDef);
  }

  updateMovement(dt) {
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
}

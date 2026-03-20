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
    this.currentTownId = 'town_hub';
    this.fx = { hitMarkers: [] };
  }

  async init() {
    this.db = await loadDatabase();
    this.ui.showMainMenu(this.startNew.bind(this), this.tryLoadSave.bind(this));
  }

  startNew(classId) {
    this.player = createPlayer(this.db.classesById[classId], this.db.itemsById);
    this.loadTown(this.currentTownId);
    this.state.set(GAME_STATES.TOWN);
    this.ui.hideOverlay();
  }

  tryLoadSave() {
    const save = loadGame();
    if (!save) return this.ui.flash('No save found.');
    this.player = save.player;
    this.currentTownId = save.currentTownId;
    this.loadTown(this.currentTownId);
    this.state.set(GAME_STATES.TOWN);
    this.ui.hideOverlay();
  }

  loadTown(townId) {
    this.currentMap = structuredClone(this.db.townsById[townId]);
    this.currentTownId = townId;
    this.currentEnemies = [];
    this.player.x = this.currentMap.spawn.x;
    this.player.y = this.currentMap.spawn.y;
  }

  loadLevel(levelId) {
    this.currentMap = structuredClone(this.db.levelsById[levelId]);
    this.currentEnemies = this.currentMap.objects.enemySpawns.map((spawn) => {
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
    if (this.input.wasActionPressed('pause')) {
      this.state.set(this.state.is(GAME_STATES.PAUSE) ? GAME_STATES.LEVEL : GAME_STATES.PAUSE);
    }

    if (!this.state.is(GAME_STATES.PAUSE)) {
      this.updateMovement(dt);
      this.updateInteraction();
      if (this.state.is(GAME_STATES.LEVEL)) {
        updateEnemies(this, dt, now / 1000);
        updateAutoAttack(this, dt);
      }
      updateStatusEffects(this.player, dt);
      const tileDef = this.db.tileDefs[this.currentMap.tiles[Math.floor(this.player.y)][Math.floor(this.player.x)]];
      applyTileEffect(this, tileDef);
    }

    this.ui.renderHud(this);
    this.renderer.render(this);
    this.input.clearFrameState();
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

async function loadJSON(path) {
  const res = await fetch(path);
  return res.json();
}

async function loadDatabase() {
  const [tiles, tileEffects, texturePack, world, classes, items, enemies, shops, progression] = await Promise.all([
    loadJSON('./data/tiles/tiles.json'),
    loadJSON('./data/tiles/effects.json'),
    loadJSON('./data/texturepacks/default-pack.json'),
    loadJSON('./data/world/world.json'),
    loadJSON('./data/classes/classes.json'),
    loadJSON('./data/items/items.json'),
    loadJSON('./data/enemies/enemies.json'),
    loadJSON('./data/shops/shops.json'),
    loadJSON('./data/world/progression.json'),
  ]);

  const townMaps = await Promise.all(world.towns.map((id) => loadJSON(`./data/towns/${id}.json`)));
  const levelMaps = await Promise.all(world.levels.map((id) => loadJSON(`./data/levels/${id}.json`)));

  return {
    tileDefs: Object.fromEntries(tiles.tiles.map((t) => [t.id, t])),
    tileEffects: Object.fromEntries(tileEffects.effects.map((e) => [e.id, e])),
    texturePack: Object.fromEntries(texturePack.textures.map((t) => [t.id, t])),
    classesById: Object.fromEntries(classes.classes.map((c) => [c.id, c])),
    itemsById: Object.fromEntries(items.items.map((i) => [i.id, i])),
    enemiesById: Object.fromEntries(enemies.enemies.map((e) => [e.id, e])),
    shopsById: Object.fromEntries(shops.shops.map((s) => [s.id, s])),
    townsById: Object.fromEntries(townMaps.map((m) => [m.id, m])),
    levelsById: Object.fromEntries(levelMaps.map((m) => [m.id, m])),
    progression,
    world,
  };
}

import { StateManager, GAME_STATES } from './stateManager.js';
import { canWalkTo, distance, isInsideMapBounds } from './collision.js';
import { createEnemy, createPlayer } from './entityFactory.js';
import { updateEnemies } from './enemyAI.js';
import { getEquippedWeapon, tryUseSpecialAttack, updateAutoAttack } from './combat.js';
import { applyTileEffect } from './tileEffects.js';
import { getNearbyPortal, getUnlockedPortalLevels } from './portalSystem.js';
import { buyFromShop, getShopInventory, sellToShop } from './shops.js';
import { saveGame, loadGame } from './saveSystem.js';
import { updateStatusEffects } from './statusEffects.js';
import { equipItemDetailed } from './equipment.js';
import {
  ensureInventoryInstances,
  removeBagSlotAt,
  toggleBagFavorite,
} from './inventory.js';
import {
  canFitRewardPackage,
  completionRewardKey,
  grantRewardPackage,
  normalizeRewardPackage,
  rewardPackageLabels,
  rollEnemyReward,
  rollLootTable,
  selectCompletionReward,
} from './rewardSystem.js';
import { ensurePlayerWeaponState, updateWeaponTimers } from './weaponSystem.js';
import { loadDatabase } from './dataLoader.js';
import { Camera } from './camera.js';
import { BattleSystem } from './battleSystem.js';
import {
  getSceneMode,
  getSceneSystems,
  isAdventureScene as sceneIsAdventure,
  isSafeScene as sceneIsSafe,
  normalizeSceneMap,
  SCENE_MODES,
} from './sceneRuntime.js';
import { isSystemEnabled as configSystemEnabled } from './systemConfig.js';

const GAMEPLAY_STATES = [GAME_STATES.SCENE, GAME_STATES.TOWN, GAME_STATES.LEVEL];

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
    this.currentSceneId = null;
    this.currentSceneType = null;
    this.currentSceneMode = SCENE_MODES.NEUTRAL;
    this.currentTownId = null;
    this.lastSafeSceneId = null;
    this.camera = new Camera(this.renderer.canvas.width, this.renderer.canvas.height);
    this.showMiniMap = false;

    this.fx = { hitMarkers: [], weaponAttacks: [] };
    this.groundLoot = [];
    this.timeSeconds = 0;
    this.combatActiveRemaining = 0;
    this.sceneCompletionAwarded = false;
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
    this.currentTownId = this.db.world.start.townId || null;
    this.lastSafeSceneId = this.currentTownId;
    this.ui.showMainMenu(this.startNew.bind(this), this.tryLoadSave.bind(this), this.db.classes, {
      saveEnabled: this.db.game.saveEnabled !== false,
    });
  }

  startNew(classId) {
    const classData = this.db.classesById[classId];
    if (!classData) {
      this.ui.flash(`Unknown class: ${classId}`);
      return;
    }

    this.player = createPlayer(classData, this.db.itemsById, this.db.world.start);
    this.ensureBattleProgressState();
    this.ensurePlayerRuntimeState();
    this.ensurePlayerAnimationState();

    const startSceneId = this.db.game?.startScene?.id || this.currentTownId;
    if (!this.loadScene(startSceneId)) return;

    this.ui.hideOverlay();
    this.saveCheckpoint();
  }

  tryLoadSave() {
    if (this.db?.game?.saveEnabled === false) return this.ui.flash('Saving is disabled for this game package.');
    const save = loadGame();
    if (!save) return this.ui.flash('No save found.');

    this.player = save.player;
    this.ensureBattleProgressState();
    this.ensurePlayerRuntimeState();
    this.ensurePlayerAnimationState();
    this.currentTownId = save.currentTownId || this.db.world.start.townId || null;
    this.lastSafeSceneId = save.lastSafeSceneId || this.currentTownId;

    const sceneId = save.currentSceneId || this.currentTownId || this.db.game?.startScene?.id;
    if (!this.loadScene(sceneId)) {
      const fallbackSceneId = this.db.game?.startScene?.id || this.db.world.start.townId;
      if (!this.loadScene(fallbackSceneId)) return;
    }

    this.ui.hideOverlay();
  }

  findScene(sceneId) {
    return this.db.scenesById?.[sceneId] ||
      this.db.townsById?.[sceneId] ||
      this.db.levelsById?.[sceneId] ||
      null;
  }

  loadScene(sceneId) {
    const sourceScene = this.findScene(sceneId);
    if (!sourceScene) {
      this.ui.flash(`Scene not found: ${sceneId}`);
      return false;
    }

    const legacyType = this.db.townsById?.[sceneId]
      ? 'town'
      : this.db.levelsById?.[sceneId]
        ? 'level'
        : 'map';
    this.currentMap = normalizeSceneMap(structuredClone(sourceScene), legacyType);
    this.currentSceneId = this.currentMap.id;
    this.currentSceneType = this.currentMap.scene.type;
    this.currentSceneMode = getSceneMode(this.currentMap);

    if (sceneIsSafe(this.currentMap)) {
      this.currentTownId = this.currentMap.id;
      this.lastSafeSceneId = this.currentMap.id;
    }

    this.currentEnemies = [];
    this.groundLoot = [];
    this.fx.weaponAttacks = [];
    this.combatActiveRemaining = 0;
    this.sceneCompletionAwarded = false;
    if (sceneIsAdventure(this.currentMap) && this.isSystemEnabled('combat')) {
      if (!this.currentMap.objects.battleTriggers?.length) {
        this.currentEnemies = (this.currentMap.objects.enemySpawns || [])
          .map((spawn) => {
            const template = this.db.enemiesById[spawn.enemyId];
            return template ? createEnemy(template, spawn) : null;
          })
          .filter(Boolean);
      }
    }

    this.player.x = this.currentMap.spawn.x;
    this.player.y = this.currentMap.spawn.y;
    this.resetRandomEncounterTimer(true);
    if (sceneIsAdventure(this.currentMap)) {
      this.randomEncounter.graceRemainingSeconds = 5;
    }
    this.state.set(this.getCurrentSceneState());
    return true;
  }

  loadTown(townId) {
    if (!this.db.townsById?.[townId]) {
      this.ui.flash(`Town not found: ${townId}`);
      return false;
    }
    return this.loadScene(townId);
  }

  loadLevel(levelId) {
    if (!this.db.levelsById?.[levelId]) {
      this.ui.flash(`Level not found: ${levelId}`);
      return false;
    }
    return this.loadScene(levelId);
  }

  getCurrentSceneState() {
    if (this.currentSceneMode === SCENE_MODES.ADVENTURE) return GAME_STATES.LEVEL;
    if (this.currentSceneMode === SCENE_MODES.SAFE) return GAME_STATES.TOWN;
    return GAME_STATES.SCENE;
  }

  getActiveSystems() {
    return getSceneSystems(this.db?.game?.systems, this.currentMap);
  }

  isSystemEnabled(name) {
    return configSystemEnabled(this.getActiveSystems(), name);
  }

  isAdventureScene() {
    return sceneIsAdventure(this.currentMap);
  }

  update(dt, now) {
    this.dt = dt;
    if (!this.player || !this.currentMap) return;

    this.timeSeconds += dt;
    this.combatActiveRemaining = Math.max(0, this.combatActiveRemaining - dt);
    updateWeaponTimers(this.player, dt, this.db.settings, { safeScene: sceneIsSafe(this.currentMap) });

    if (this.input.wasActionPressed('debug')) this.debug.toggle();
    if (this.input.wasActionPressed('pause')) this.togglePause();
    if (this.input.wasActionPressed('inventory') && this.isGameplayState() && !this.ui.isOverlayOpen()) {
      this.openInventory();
    }

    const hasOverlay = this.ui.isOverlayOpen();
    const canSimulate = this.isGameplayState() && !this.state.is(GAME_STATES.PAUSE) && !hasOverlay;
    this.playerMovedThisFrame = false;

    if (
      this.state.is(GAME_STATES.BATTLE) &&
      this.isSystemEnabled('combat') &&
      !this.state.is(GAME_STATES.PAUSE) &&
      !hasOverlay
    ) {
      this.battleSystem.update();
    }

    if (canSimulate) {
      if (this.isSystemEnabled('movement')) {
        this.updateMovement(dt);
      } else {
        this.ensurePlayerAnimationState();
        this.updatePlayerAnimation(dt, 0, 0);
      }

      this.updateInteraction();

      if (this.isAdventureScene() && this.isSystemEnabled('combat')) {
        this.tryStartBattleFromTrigger();
        if (!this.state.is(GAME_STATES.BATTLE) && this.isSystemEnabled('randomEncounters')) {
          this.updateRandomEncounters(dt);
        }
        if (!this.usesTriggerBattles()) {
          updateEnemies(this, dt, now / 1000);
          updateAutoAttack(this);
          if (this.input.wasActionPressed('special')) tryUseSpecialAttack(this);
          this.updateEnemyStatusEffects(dt);
        }
      }

      updateStatusEffects(this.player, dt);
      this.applyCurrentTileEffect();
      this.updateRewardPickups();
      this.updateGroundLoot();
    }

    this.ui.renderHud(this);
    this.renderer.render(this);
    this.input.clearFrameState();
  }

  togglePause() {
    if (this.state.is(GAME_STATES.PAUSE)) {
      this.state.resume(this.getCurrentSceneState());
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

  ensurePlayerRuntimeState() {
    if (!this.player) return;
    ensureInventoryInstances(this.player, this.db?.itemsById || {});
    ensurePlayerWeaponState(this.player, this.db?.settings || {});
    this.player.completionCounts = this.player.completionCounts && typeof this.player.completionCounts === 'object'
      ? this.player.completionCounts
      : {};
    this.player.pickupState = this.player.pickupState && typeof this.player.pickupState === 'object'
      ? this.player.pickupState
      : {};
    this.player.shopState = this.player.shopState && typeof this.player.shopState === 'object'
      ? this.player.shopState
      : {};
    this.player.equipmentInstances = this.player.equipmentInstances && typeof this.player.equipmentInstances === 'object'
      ? this.player.equipmentInstances
      : {};

    for (const [slotName, itemId] of Object.entries(this.player.equipment || {})) {
      if (!itemId || this.player.equipmentInstances[slotName]) continue;
      const owned = this.player.bag.items.find((slot) => slot.itemId === itemId && slot.instanceId);
      if (owned) this.player.equipmentInstances[slotName] = owned.instanceId;
    }
  }

  markCombatActive(seconds = 3) {
    this.combatActiveRemaining = Math.max(this.combatActiveRemaining, seconds);
  }

  activateSpecialAttack() {
    if (!this.isGameplayState() || this.ui.isOverlayOpen()) return false;
    return tryUseSpecialAttack(this);
  }

  isCombatActive() {
    return this.state.is(GAME_STATES.BATTLE) || this.combatActiveRemaining > 0;
  }

  updateEnemyStatusEffects(dt) {
    for (const enemy of this.currentEnemies) {
      if (enemy.dead) continue;
      updateStatusEffects(enemy, dt);
      if (enemy.hp <= 0) {
        enemy.hp = 0;
        enemy.dead = true;
        this.onEnemyDefeated(enemy);
      }
    }
  }

  openInventory() {
    if (!this.ui.showInventory) return;
    this.ui.showInventory(this.player, this.db, {
      canEquip: () => !this.isCombatActive(),
      onEquip: (slotIndex) => this.equipInventorySlot(slotIndex),
      onFavorite: (slotIndex) => this.favoriteInventorySlot(slotIndex),
      onDrop: (slotIndex, confirmed = false) => this.dropInventorySlot(slotIndex, confirmed),
      onClose: () => {
        this.ui.hideOverlay();
        this.saveCheckpoint();
      },
    });
  }

  equipInventorySlot(slotIndex) {
    if (this.isCombatActive()) return { ok: false, reason: 'Weapons can only be changed outside active combat.' };
    const slot = this.player.bag.items[slotIndex];
    if (!slot) return { ok: false, reason: 'Inventory item not found.' };
    const result = equipItemDetailed(this.player, slot.itemId, this.db.itemsById, { instanceId: slot.instanceId });
    if (result.ok) this.saveCheckpoint();
    return result;
  }

  favoriteInventorySlot(slotIndex) {
    const slot = this.player.bag.items[slotIndex];
    if (!slot?.instanceId) return { ok: false, reason: 'Only individual weapons can be favorited.' };
    const favorite = toggleBagFavorite(this.player, slot.instanceId);
    this.saveCheckpoint();
    return { ok: true, favorite };
  }

  inventoryActionNeedsConfirmation(slot) {
    if (!slot) return false;
    const item = this.db.itemsById[slot.itemId];
    const equippedInstance = Object.values(this.player.equipmentInstances || {}).includes(slot.instanceId);
    const equippedLegacy = !slot.instanceId && Object.values(this.player.equipment || {}).includes(slot.itemId);
    return equippedInstance || equippedLegacy || slot.favorite || ['epic', 'legendary'].includes(item?.rarity);
  }

  dropInventorySlot(slotIndex, confirmed = false) {
    const slot = this.player.bag.items[slotIndex];
    if (!slot) return { ok: false, reason: 'Inventory item not found.' };
    if (this.inventoryActionNeedsConfirmation(slot) && !confirmed) {
      return {
        ok: false,
        requiresConfirmation: true,
        reason: 'This item is equipped, favorited, Epic, or Legendary. Drop it anyway?',
      };
    }

    for (const [equipmentSlot, instanceId] of Object.entries(this.player.equipmentInstances || {})) {
      if (instanceId !== slot.instanceId) continue;
      this.player.equipment[equipmentSlot] = null;
      delete this.player.equipmentInstances[equipmentSlot];
    }
    const removed = removeBagSlotAt(this.player, slotIndex);
    if (!removed) return { ok: false, reason: 'Inventory item could not be removed.' };
    this.saveCheckpoint();
    return { ok: true, removed };
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
    if (!this.isSystemEnabled('combat')) return;
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
    return this.isSystemEnabled('combat') && Boolean(this.currentMap?.objects?.battleTriggers?.length);
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

    const canMove = this.isSystemEnabled('collision')
      ? canWalkTo(this.currentMap, nx, ny, this.db.tileDefs)
      : isInsideMapBounds(this.currentMap, nx, ny);
    if (canMove) {
      this.player.x = nx;
      this.player.y = ny;
    }

    this.playerMovedThisFrame = Math.abs(this.player.x - prevX) > 0.0001 || Math.abs(this.player.y - prevY) > 0.0001;
    this.updatePlayerAnimation(dt, this.player.x - prevX, this.player.y - prevY);
  }

  updateRandomEncounters(dt) {
    if (!this.isSystemEnabled('combat') || !this.isSystemEnabled('randomEncounters')) return;
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
    if (!rollNew || !this.isSystemEnabled('randomEncounters')) return;
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
      if (nearbyPortal.targetScene) {
        this.loadScene(nearbyPortal.targetScene);
      } else if (nearbyPortal.targetTown) {
        this.loadTown(nearbyPortal.targetTown);
      } else if (nearbyPortal.targetLevel) {
        this.loadLevel(nearbyPortal.targetLevel);
      } else if (Array.isArray(nearbyPortal.levels)) {
        const unlocked = getUnlockedPortalLevels(this.player, nearbyPortal);
        this.ui.showLevelSelect(unlocked, this.player.completedLevels, (levelId) => this.loadLevel(levelId));
      }
      return;
    }

    if (this.isSystemEnabled('shops')) {
      const shop = (this.currentMap.objects.shops || []).find((entry) => distance(entry, this.player) <= 1.1);
      if (shop) {
        const sourceShop = this.db.shopsById[shop.shopId];
        if (!sourceShop) {
          this.ui.flash(`Shop not found: ${shop.shopId}`);
          return;
        }
        this.state.set(GAME_STATES.SHOP);
        this.ui.showShop(sourceShop, this.player, this.db, {
          getInventory: () => getShopInventory(sourceShop, this.player, this.db),
          onBuy: (offer) => buyFromShop(this.player, sourceShop, offer, this.db),
          onSell: (itemId, instanceId, confirmed = false) => {
            const slot = this.player.bag.items.find((entry) =>
              entry.itemId === itemId && (!instanceId || entry.instanceId === instanceId)
            );
            if (this.inventoryActionNeedsConfirmation(slot) && !confirmed) {
              return {
                ok: false,
                requiresConfirmation: true,
                reason: 'This item is equipped, favorited, Epic, or Legendary. Sell it anyway?',
              };
            }
            const result = sellToShop(this.player, itemId, sourceShop, this.db, instanceId);
            if (result.ok && slot?.instanceId) {
              for (const [equipmentSlot, equippedId] of Object.entries(this.player.equipmentInstances || {})) {
                if (equippedId !== slot.instanceId) continue;
                this.player.equipment[equipmentSlot] = null;
                delete this.player.equipmentInstances[equipmentSlot];
              }
            }
            return result;
          },
          onClose: () => {
            this.state.set(this.getCurrentSceneState());
            this.saveCheckpoint();
          },
        });
        return;
      }
    }

    const fountain = (this.currentMap.objects.fountains || []).find((entry) => distance(entry, this.player) <= 1.1);
    if (fountain) {
      this.player.stats.hp = this.player.stats.maxHp;
      ensurePlayerWeaponState(this.player, this.db.settings);
      this.player.resources.mana.current = this.player.resources.mana.max;
      this.audio.play('heal');
      this.ui.flash('Health and mana restored at the fountain.');
    }
  }

  onEnemyDefeated(enemy) {
    const rewardPackage = rollEnemyReward(enemy.template, this.db.lootTablesById);
    this.spawnGroundReward(rewardPackage, enemy.x, enemy.y, {
      title: `${enemy.template.name} Loot`,
    });
    const labels = rewardPackageLabels(rewardPackage, this.db.itemsById).join(', ');
    this.ui.flash(`Defeated ${enemy.template.name}. Dropped: ${labels}`);

    const allDead = this.currentEnemies.every((entry) => entry.dead);
    if (allDead && this.isAdventureScene()) this.completeCurrentScene();
  }

  spawnGroundReward(rewardPackage, x, y, options = {}) {
    const normalized = normalizeRewardPackage(rewardPackage, `ground_reward_${Date.now()}`);
    const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random()}`;
    this.groundLoot.push({
      id,
      x,
      y,
      title: options.title || normalized.name || 'Loot',
      rewardPackage: normalized,
      pickupKey: options.pickupKey || null,
      dismissedWhileNear: false,
    });
    return id;
  }

  updateRewardPickups() {
    const now = Date.now();
    for (const pickup of this.currentMap.objects.rewardPickups || []) {
      const pickupKey = `${this.currentMap.id}:${pickup.id}`;
      if (this.groundLoot.some((loot) => loot.pickupKey === pickupKey)) continue;
      const collectedAt = Number(this.player.pickupState[pickupKey]) || 0;
      const respawnMs = Math.max(0, Number(pickup.respawnSeconds) || 0) * 1000;
      if (collectedAt && (!respawnMs || now - collectedAt < respawnMs)) continue;

      const fixed = this.db.rewardPackagesById[pickup.rewardPackageId];
      const table = this.db.lootTablesById[pickup.lootTableId];
      const rewardPackage = fixed || (table ? rollLootTable(table) : null);
      if (!rewardPackage) continue;
      this.spawnGroundReward(rewardPackage, pickup.x, pickup.y, {
        title: pickup.name || rewardPackage.name || 'Map Reward',
        pickupKey,
      });
    }
  }

  updateGroundLoot() {
    for (const loot of [...this.groundLoot]) {
      const nearby = distance(this.player, loot) <= 0.8;
      if (!nearby) {
        loot.dismissedWhileNear = false;
        continue;
      }
      if (loot.dismissedWhileNear || this.ui.isOverlayOpen()) continue;
      if (canFitRewardPackage(this.player, loot.rewardPackage, this.db.itemsById)) {
        this.claimGroundReward(loot.id);
      } else {
        this.presentGroundReward(loot);
      }
    }
  }

  claimGroundReward(lootId) {
    const loot = this.groundLoot.find((entry) => entry.id === lootId);
    if (!loot) return { ok: false, reason: 'That reward is no longer available.' };
    if (!canFitRewardPackage(this.player, loot.rewardPackage, this.db.itemsById)) {
      return { ok: false, reason: 'Inventory is full.' };
    }
    const result = grantRewardPackage(this.player, loot.rewardPackage, this.db.itemsById);
    if (!result.ok) return { ok: false, reason: 'Inventory is full.' };
    this.groundLoot = this.groundLoot.filter((entry) => entry.id !== lootId);
    if (loot.pickupKey) this.player.pickupState[loot.pickupKey] = Date.now();
    this.ui.flash(`Collected ${rewardPackageLabels(loot.rewardPackage, this.db.itemsById).join(', ')}.`);
    this.saveCheckpoint();
    return { ok: true };
  }

  presentGroundReward(loot) {
    if (!this.ui.showRewardOverflow) {
      loot.dismissedWhileNear = true;
      this.ui.flash('Inventory is full. Drop an item or leave this loot on the map.');
      return;
    }
    const render = () => this.ui.showRewardOverflow(loot.title, loot.rewardPackage, this.player, this.db, {
      onDrop: (slotIndex, confirmed = false) => {
        const dropped = this.dropInventorySlot(slotIndex, confirmed);
        if (!dropped.ok) return dropped;
        const claimed = this.claimGroundReward(loot.id);
        if (claimed.ok) this.ui.hideOverlay();
        else render();
        return claimed;
      },
      onLeave: () => {
        loot.dismissedWhileNear = true;
        this.ui.hideOverlay();
      },
    });
    render();
  }

  presentRewardPackage(rewardPackage, options = {}) {
    const normalized = normalizeRewardPackage(rewardPackage);
    const finish = (claimed) => {
      this.ui.hideOverlay();
      options.onComplete?.(claimed);
      if (claimed) this.saveCheckpoint();
    };
    const claim = () => {
      if (!canFitRewardPackage(this.player, normalized, this.db.itemsById)) {
        this.presentRewardOverflow(normalized, options, finish);
        return { ok: false, reason: 'Inventory is full.' };
      }
      grantRewardPackage(this.player, normalized, this.db.itemsById);
      this.ui.flash(`Received ${rewardPackageLabels(normalized, this.db.itemsById).join(', ')}.`);
      finish(true);
      return { ok: true };
    };

    if (!this.ui.showRewardPackage) {
      claim();
      return;
    }
    this.ui.showRewardPackage(options.title || normalized.name || 'Rewards', normalized, this.db, {
      onClaim: claim,
      onLeave: () => finish(false),
      allowLeave: options.allowLeave !== false,
    });
  }

  presentRewardOverflow(rewardPackage, options, finish) {
    if (!this.ui.showRewardOverflow) return finish(false);
    const render = () => this.ui.showRewardOverflow(
      options.title || rewardPackage.name || 'Rewards',
      rewardPackage,
      this.player,
      this.db,
      {
        onDrop: (slotIndex, confirmed = false) => {
          const dropped = this.dropInventorySlot(slotIndex, confirmed);
          if (!dropped.ok) return dropped;
          if (!canFitRewardPackage(this.player, rewardPackage, this.db.itemsById)) {
            render();
            return { ok: false, reason: 'More inventory space is needed.' };
          }
          grantRewardPackage(this.player, rewardPackage, this.db.itemsById);
          this.ui.flash(`Received ${rewardPackageLabels(rewardPackage, this.db.itemsById).join(', ')}.`);
          finish(true);
          return { ok: true };
        },
        onLeave: () => finish(false),
      },
    );
    render();
  }

  presentBattleRewards(rewardPackage, onComplete) {
    this.presentRewardPackage(rewardPackage, {
      title: 'Battle Rewards',
      allowLeave: true,
      onComplete,
    });
  }

  completeCurrentScene() {
    if (this.sceneCompletionAwarded) return;
    this.sceneCompletionAwarded = true;
    const sceneId = this.currentMap.id;
    if (!this.player.completedLevels.includes(sceneId)) {
      this.player.completedLevels.push(sceneId);
      if (this.isSystemEnabled('progression')) this.unlockNextLevels(sceneId);
    }

    const key = completionRewardKey('level', sceneId);
    const completedCount = Math.max(0, Number(this.player.completionCounts[key]) || 0);
    this.player.completionCounts[key] = completedCount + 1;
    const schedule = this.db.completionRewardsBySource[key];
    if (schedule) {
      const selected = selectCompletionReward(schedule, completedCount);
      this.presentRewardPackage(selected.package, {
        title: `${this.currentMap.name} — Tier ${selected.tier} Reward`,
        allowLeave: true,
      });
    }
    this.ui.flash(`Scene complete: ${this.currentMap.name}`);
    this.saveCheckpoint();
  }

  awardQuestCompletion(questId) {
    const key = completionRewardKey('quest', questId);
    const schedule = this.db.completionRewardsBySource[key];
    if (!schedule) return false;
    const completedCount = Math.max(0, Number(this.player.completionCounts[key]) || 0);
    this.player.completionCounts[key] = completedCount + 1;
    const selected = selectCompletionReward(schedule, completedCount);
    this.presentRewardPackage(selected.package, {
      title: `${schedule.name} — Tier ${selected.tier}`,
      allowLeave: true,
    });
    return true;
  }

  unlockNextLevels(levelId) {
    if (!this.isSystemEnabled('progression')) return;
    const next = this.db.progression.unlocks[levelId] || [];
    next.forEach((id) => {
      if (!this.player.unlocks.levels.includes(id)) this.player.unlocks.levels.push(id);
    });
  }

  onPlayerDefeated() {
    this.state.set(GAME_STATES.GAME_OVER);
    this.ui.showGameOver(() => {
      this.player.stats.hp = this.player.stats.maxHp;
      const returnSceneId = this.lastSafeSceneId || this.currentTownId || this.db.game?.startScene?.id;
      this.loadScene(returnSceneId);
    });
  }

  saveCheckpoint() {
    if (this.db?.game?.saveEnabled === false) return true;
    const saved = saveGame({
      player: this.player,
      currentSceneId: this.currentSceneId,
      currentSceneType: this.currentSceneType,
      currentTownId: this.currentTownId,
      lastSafeSceneId: this.lastSafeSceneId,
    });
    if (!saved) this.ui.flash('Game progress could not be saved in this browser. Free storage and try again.');
    return saved;
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

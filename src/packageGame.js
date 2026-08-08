import { canWalkTo, isInsideMapBounds } from './collision.js';
import { createPlayer } from './entityFactory.js';
import { Game } from './game.js';
import {
  findNearbyInteractiveEntity,
  isBlockedBySceneEntity,
  normalizeSceneEntities,
} from './sceneEntityRuntime.js';
import {
  instantiateSceneNpcs,
  loadNpcPackageData,
  nextNpcDialogue,
  updateNpcEntities,
} from './npcRuntime.js';

export class PackageGame extends Game {
  constructor(options) {
    super(options);
    this.currentEntities = [];
    this.npcContentRootUrl = null;
    this.npcTexturesById = {};
  }

  async init() {
    await super.init();
    const npcData = await loadNpcPackageData(this.db.game.manifestUrl);
    this.db.npcs = npcData.npcs;
    this.db.npcsById = npcData.npcsById;
    this.npcTexturesById = npcData.texturesById;
    this.npcContentRootUrl = npcData.contentRootUrl;
    this.ui.showMainMenu(
      this.startNew.bind(this),
      this.tryLoadSave.bind(this),
      this.db.actors,
      { saveEnabled: this.db.game.saveEnabled !== false },
    );
  }

  startNew(actorId) {
    const actorData = this.db.actorsById?.[actorId];
    if (!actorData) {
      this.ui.flash(`Unknown actor: ${actorId}`);
      return;
    }

    this.player = createPlayer(actorData, this.db.itemsById, this.db.world.start);
    this.ensureBattleProgressState();
    this.ensurePlayerRuntimeState();
    this.ensurePlayerAnimationState();

    const startSceneId = this.db.game?.startScene?.id || this.currentTownId;
    if (!this.loadScene(startSceneId)) return;

    this.ui.hideOverlay();
    this.saveCheckpoint();
  }

  loadScene(sceneId, options = {}) {
    const loaded = super.loadScene(sceneId, options);
    if (!loaded) return false;
    const resolved = instantiateSceneNpcs(this.currentMap.entities, this.db.npcsById || {}, {
      texturesById: this.npcTexturesById,
      contentRootUrl: this.npcContentRootUrl,
    });
    this.currentEntities = normalizeSceneEntities(resolved);
    return true;
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

    const mapAllowsMove = this.isSystemEnabled('collision')
      ? canWalkTo(this.currentMap, nx, ny, this.db.tileDefs)
      : isInsideMapBounds(this.currentMap, nx, ny);
    const entityAllowsMove = !this.isSystemEnabled('collision') ||
      !isBlockedBySceneEntity(nx, ny, this.currentEntities);
    if (mapAllowsMove && entityAllowsMove) {
      this.player.x = nx;
      this.player.y = ny;
    }

    this.playerMovedThisFrame = Math.abs(this.player.x - prevX) > 0.0001 ||
      Math.abs(this.player.y - prevY) > 0.0001;
    this.updatePlayerAnimation(dt, this.player.x - prevX, this.player.y - prevY);

    updateNpcEntities(this.currentEntities, dt, {
      canMoveTo: (x, y) => this.isSystemEnabled('collision')
        ? canWalkTo(this.currentMap, x, y, this.db.tileDefs)
        : isInsideMapBounds(this.currentMap, x, y),
    });
  }

  updateInteraction() {
    if (!this.input.wasActionPressed('interact')) return;

    const entity = findNearbyInteractiveEntity(this.player, this.currentEntities);
    const interaction = entity?.components?.interaction;
    if (entity && interaction) {
      if (interaction.action === 'npc') {
        const message = nextNpcDialogue(entity);
        if (message) this.ui.flash(message);
        if (interaction.shopId && this.isSystemEnabled('shops')) {
          this.currentMap.objects ||= {};
          this.currentMap.objects.shops ||= [];
          const transientId = `npc_shop_${entity.id}`;
          const transientShop = { id: transientId, x: entity.x, y: entity.y, shopId: interaction.shopId };
          this.currentMap.objects.shops.unshift(transientShop);
          try {
            super.updateInteraction();
          } finally {
            this.currentMap.objects.shops = this.currentMap.objects.shops.filter((entry) => entry !== transientShop);
          }
        }
        return;
      }
      if (interaction.action === 'scene' && interaction.targetScene) {
        this.loadScene(interaction.targetScene);
      } else if (interaction.message) {
        this.ui.flash(interaction.message);
      }
      return;
    }

    super.updateInteraction();
  }

  ensurePlayerAnimationState() {
    if (!this.player) return;
    const actor = this.db?.actorsById?.[this.player.actorId] ||
      this.db?.actorsById?.[this.player.classId] ||
      null;
    const actorSprite = actor?.components?.render?.sprite || null;
    const actorFallback = actor?.components?.render?.fallback || null;
    const anim = this.player.animation || {};
    const sprite = anim.sprite || actorSprite || {};

    this.player.visual = {
      shape: this.player.visual?.shape || actorFallback?.shape || 'square',
      color: this.player.visual?.color || actorFallback?.color || '#7af0a0',
      size: Number.isFinite(this.player.visual?.size)
        ? this.player.visual.size
        : Number.isFinite(actorFallback?.size)
          ? actorFallback.size
          : 20,
    };
    this.player.animation = {
      facing: anim.facing || this.player.facing || 'down',
      state: anim.state || 'idle',
      frameIndex: Number.isFinite(anim.frameIndex) ? anim.frameIndex : 0,
      frameTimer: Number.isFinite(anim.frameTimer) ? anim.frameTimer : 0,
      frameDuration: Number.isFinite(anim.frameDuration) ? anim.frameDuration : 0.16,
      sprite: {
        imagePath: sprite.imagePath || null,
        frameWidth: Number.isFinite(sprite.frameWidth) ? sprite.frameWidth : 1,
        frameHeight: Number.isFinite(sprite.frameHeight) ? sprite.frameHeight : 1,
        idleFrames: Array.isArray(sprite.idleFrames) && sprite.idleFrames.length ? sprite.idleFrames : [0],
        walkFrames: Array.isArray(sprite.walkFrames) && sprite.walkFrames.length ? sprite.walkFrames : [0],
        rowByFacing: sprite.rowByFacing || {
          down: { idle: 0, walk: 0 },
          left: { idle: 0, walk: 0 },
          right: { idle: 0, walk: 0 },
          up: { idle: 0, walk: 0 },
        },
      },
    };
  }
}

import { drawMiniMap } from './miniMap.js';
import { debugText } from './debug.js';
import { TILE_SIZE } from './camera.js';
import { GAME_STATES } from './stateManager.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.textureImageCache = new Map();
    this.textureImageFailures = new Set();
  }

  render(game) {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!game.currentMap) return;

    if (game.state.is(GAME_STATES.BATTLE)) {
      this.drawBattle(game);
      if (game.debug.enabled) this.drawDebug(game);
      return;
    }

    game.camera.setViewport(this.canvas.width, this.canvas.height);
    game.camera.update(game.player.x, game.player.y, game.currentMap.width, game.currentMap.height);

    this.drawMap(game);
    this.drawObjects(game);
    this.drawEntities(game);
    this.drawFx(game);
    if (game.showMiniMap) drawMiniMap(ctx, game, this.canvas.width - 210, 10, 200, 140);
    if (game.debug.enabled) this.drawDebug(game);
  }

  drawBattle(game) {
    const { ctx } = this;
    const battle = game.battleSystem.activeBattle;
    if (!battle) return;

    const w = this.canvas.width;
    const h = this.canvas.height;
    const panelHeight = 170;
    ctx.fillStyle = battle.background === 'dungeon' ? '#1a1f2f' : '#1f2a3a';
    ctx.fillRect(0, 0, w, h);

    const enemies = battle.enemies.filter((enemy) => !enemy.dead);
    const enemyStartY = Math.max(80, (h - panelHeight - enemies.length * 80) / 2);
    enemies.forEach((enemy, index) => {
      const x = 120 + (index % 2) * 45;
      const y = enemyStartY + index * 80;
      if (!this.drawEnemyBattleSprite(enemy, x, y, 46, 46)) {
        ctx.fillStyle = '#d95f5f';
        ctx.fillRect(x, y, 46, 46);
      }
      ctx.fillStyle = '#fff';
      ctx.fillText(`${enemy.template.name} HP:${Math.max(0, Math.ceil(enemy.hp))}`, x - 20, y - 10);
    });

    const playerX = w - 220;
    const playerY = Math.max(110, h - panelHeight - 150);
    if (!this.drawBattlePlayerSprite(game, playerX, playerY, 54, 54)) {
      ctx.fillStyle = '#67d8a5';
      ctx.fillRect(playerX, playerY, 54, 54);
    }
    const battleArt = this.getEquippedWeaponArt(game, 'equipped');
    const battleWeaponImage = this.getTextureImage(battleArt?.src);
    if (battleWeaponImage) {
      this.drawTransformedWeaponImage(battleWeaponImage, battleArt, playerX + 49, playerY + 37, 30, 'right');
    }
    ctx.fillStyle = '#fff';
    ctx.fillText(`Player HP:${Math.max(0, Math.floor(game.player.stats.hp))}/${game.player.stats.maxHp}`, playerX - 38, playerY - 12);

    ctx.fillStyle = '#0f1726';
    ctx.fillRect(0, h - panelHeight, w, panelHeight);
    ctx.strokeStyle = '#476089';
    ctx.strokeRect(0, h - panelHeight, w, panelHeight);
    ctx.fillStyle = '#fff';
    ctx.fillText(`Encounter: ${battle.encounterId}`, 20, h - 118);
    ctx.fillText(`Turn: ${battle.state === 'player_turn' ? 'Player' : 'Enemies'}`, 20, h - 94);
    ctx.fillText('Actions: 1 Standard | 2 Special | E Confirm', 20, h - 70);
    const options = battle.actionLabels || ['Standard', 'Special'];
    options.forEach((label, index) => {
      ctx.fillStyle = battle.selectedActionIndex === index ? '#8ee3ff' : '#c9d7ee';
      ctx.fillText(`${battle.selectedActionIndex === index ? '>' : ' '} ${index + 1} ${label}`, 360 + index * 240, h - 70);
    });
    ctx.fillStyle = '#fff';
    ctx.fillText(battle.turnMessage, 20, h - 40);
  }

  drawMap(game) {
    const { ctx } = this;
    const pack = game.db.texturePack;
    const map = game.currentMap;

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (!game.camera.isVisible(x, y)) continue;
        const tileId = map.tiles[y][x];
        const tileDef = game.db.tileDefs[tileId];
        if (!tileDef) continue;
        const style = pack[tileDef.texture] || { color: '#ff00ff' };
        const pos = game.camera.worldToScreen(x, y);
        const textureImage = this.getTextureImage(style.image);
        if (textureImage) {
          ctx.drawImage(textureImage, pos.x, pos.y, TILE_SIZE, TILE_SIZE);
        } else {
          ctx.fillStyle = style.color;
          ctx.fillRect(pos.x, pos.y, TILE_SIZE, TILE_SIZE);
        }
      }
    }
  }

  getTextureImage(imagePath) {
    if (!imagePath || this.textureImageFailures.has(imagePath)) return null;
    const cached = this.textureImageCache.get(imagePath);
    if (cached) {
      return cached.loaded ? cached.image : null;
    }

    const image = new Image();
    const entry = { image, loaded: false };
    image.onload = () => {
      entry.loaded = true;
    };
    image.onerror = () => {
      this.textureImageFailures.add(imagePath);
      this.textureImageCache.delete(imagePath);
    };
    image.src = imagePath;
    this.textureImageCache.set(imagePath, entry);
    return null;
  }

  drawObjects(game) {
    const { ctx } = this;
    for (const portal of game.currentMap.objects.portals || []) {
      const pos = game.camera.worldToScreen(portal.x, portal.y);
      ctx.fillStyle = '#8d7bff';
      ctx.fillRect(pos.x + 4, pos.y + 4, 24, 24);
    }
    for (const shop of game.currentMap.objects.shops || []) {
      const pos = game.camera.worldToScreen(shop.x, shop.y);
      ctx.fillStyle = '#f4bd5a';
      ctx.fillRect(pos.x + 6, pos.y + 6, 20, 20);
    }
    for (const fountain of game.currentMap.objects.fountains || []) {
      const pos = game.camera.worldToScreen(fountain.x, fountain.y);
      ctx.fillStyle = '#45d7f5';
      ctx.fillRect(pos.x + 8, pos.y + 8, 16, 16);
    }
    for (const loot of game.groundLoot || []) {
      const pos = game.camera.worldToScreen(loot.x, loot.y);
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.arc(pos.x + 16, pos.y + 16, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff0a8';
      ctx.strokeRect(pos.x + 10, pos.y + 10, 12, 12);
    }
  }

  drawEntities(game) {
    const { ctx } = this;
    const playerPos = game.camera.worldToScreen(game.player.x, game.player.y);
    if (!this.drawPlayerSprite(game, playerPos.x, playerPos.y)) {
      ctx.fillStyle = '#7af0a0';
      ctx.fillRect(playerPos.x + 6, playerPos.y + 6, 20, 20);
    }
    this.drawEquippedWeapon(game, playerPos.x, playerPos.y);

    for (const enemy of game.currentEnemies) {
      if (enemy.dead) continue;
      const pos = game.camera.worldToScreen(enemy.x, enemy.y);
      if (!this.drawEnemyLevelSprite(enemy, pos.x + 6, pos.y + 6, 20, 20)) {
        ctx.fillStyle = '#f06464';
        ctx.fillRect(pos.x + 6, pos.y + 6, 20, 20);
      }
    }
  }

  drawEnemyBattleSprite(enemy, x, y, width, height) {
    const imagePath = enemy?.template?.sprites?.battle;
    const image = this.getTextureImage(imagePath);
    if (!image) return false;
    this.ctx.drawImage(image, x, y, width, height);
    return true;
  }

  drawEnemyLevelSprite(enemy, x, y, width, height) {
    const imagePath = enemy?.template?.sprites?.inLevel;
    const image = this.getTextureImage(imagePath);
    if (!image) return false;
    this.ctx.drawImage(image, x, y, width, height);
    return true;
  }

  drawBattlePlayerSprite(game, x, y, width, height) {
    const anim = game.player?.animation;
    if (!anim?.sprite?.imagePath) return false;
    const image = this.getTextureImage(anim.sprite.imagePath);
    if (!image) return false;

    const idleRow = anim.sprite.rowByFacing?.right?.idle;
    const idleFrame = anim.sprite.idleFrames?.[0];
    if (!Number.isFinite(idleRow) || !Number.isFinite(idleFrame)) return false;

    this.ctx.drawImage(
      image,
      idleFrame * anim.sprite.frameWidth,
      idleRow * anim.sprite.frameHeight,
      anim.sprite.frameWidth,
      anim.sprite.frameHeight,
      x,
      y,
      width,
      height,
    );
    return true;
  }

  drawPlayerSprite(game, screenX, screenY) {
    const { ctx } = this;
    
    const { player } = game;
    const anim = player.animation;
    if (!anim?.sprite?.imagePath) return false;

    const image = this.getTextureImage(anim.sprite.imagePath);
    if (!image) return false;

    const facingRows = anim.sprite.rowByFacing?.[anim.facing];
    if (!facingRows) return false;

    const state = anim.state === 'walk' ? 'walk' : 'idle';
    const rowIndex = facingRows[state];
    if (!Number.isFinite(rowIndex)) return false;

    const frames = state === 'walk' ? anim.sprite.walkFrames : anim.sprite.idleFrames;
    if (!Array.isArray(frames) || !frames.length) return false;
    const frameSlot = frames[anim.frameIndex % frames.length];
    if (!Number.isFinite(frameSlot)) return false;

    const frameW = anim.sprite.frameWidth;
    const frameH = anim.sprite.frameHeight;
    ctx.drawImage(
      image,
      frameSlot * frameW,
      rowIndex * frameH,
      frameW,
      frameH,
      screenX - TILE_SIZE * 0.5,
      screenY - TILE_SIZE * 0.5,
      TILE_SIZE * 2,
      TILE_SIZE * 2,
    );
    return true;
  }

  getEquippedWeaponArt(game, use = 'equipped') {
    const item = game.db?.itemsById?.[game.player?.equipment?.weapon];
    return item?.weapon?.art?.[use] || item?.weapon?.art?.equipped || null;
  }

  drawTransformedWeaponImage(image, art, x, y, size = 20, facing = 'right') {
    const scale = Math.max(0.05, Number(art?.scale) || 1);
    const rotation = ((Number(art?.rotation) || 0) * Math.PI) / 180;
    const crop = art?.crop || {};
    const sx = Math.max(0, Number(crop.left) || 0);
    const sy = Math.max(0, Number(crop.top) || 0);
    const sw = Math.max(1, image.naturalWidth - sx - Math.max(0, Number(crop.right) || 0));
    const sh = Math.max(1, image.naturalHeight - sy - Math.max(0, Number(crop.bottom) || 0));
    this.ctx.save();
    this.ctx.translate(x, y);
    this.ctx.rotate(rotation);
    this.ctx.scale((art?.flipX ? -1 : 1) * (facing === 'left' ? -1 : 1), 1);
    this.ctx.drawImage(image, sx, sy, sw, sh, -size * scale * 0.5, -size * scale * 0.5, size * scale, size * scale);
    this.ctx.restore();
  }

  drawEquippedWeapon(game, screenX, screenY) {
    const item = game.db?.itemsById?.[game.player?.equipment?.weapon];
    if (!item?.weapon) return false;
    const facing = game.player.animation?.facing || game.player.facing || 'down';
    const offsets = {
      up: { x: 9, y: 7 },
      down: { x: 23, y: 23 },
      left: { x: 7, y: 19 },
      right: { x: 25, y: 19 },
    };
    const offset = offsets[facing] || offsets.down;
    const anchorX = screenX + offset.x - 16;
    const anchorY = screenY + offset.y - 16;
    const art = this.getEquippedWeaponArt(game, 'equipped');
    const image = this.getTextureImage(art?.src);
    if (image) {
      this.drawTransformedWeaponImage(image, art, anchorX, anchorY, 19, facing);
      return true;
    }
    this.ctx.save();
    this.ctx.strokeStyle = item.rarity === 'legendary' ? '#f59e0b' : '#dbeafe';
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.moveTo(anchorX - 5, anchorY + 5);
    this.ctx.lineTo(anchorX + 7, anchorY - 7);
    this.ctx.stroke();
    this.ctx.restore();
    return true;
  }

  drawFx(game) {
    const { ctx } = this;
    for (const m of game.fx.hitMarkers) {
      const pos = game.camera.worldToScreen(m.x, m.y);
      ctx.fillStyle = '#fff';
      ctx.fillText(m.text, pos.x, pos.y - 8);
      m.ttl -= game.dt;
    }
    game.fx.hitMarkers = game.fx.hitMarkers.filter((m) => m.ttl > 0);

    for (const fx of game.fx.weaponAttacks || []) {
      fx.elapsed += game.dt;
      const progress = Math.min(1, fx.elapsed / Math.max(0.01, fx.duration));
      const worldX = fx.fromX + (fx.toX - fx.fromX) * progress;
      const worldY = fx.fromY + (fx.toY - fx.fromY) * progress;
      const pos = game.camera.worldToScreen(worldX, worldY);
      const art = fx.art?.projectile || fx.art?.equipped;
      const image = this.getTextureImage(art?.src);
      if (image) {
        this.drawTransformedWeaponImage(image, art, pos.x + 16, pos.y + 16, fx.family === 'melee' ? 24 : 14, 'right');
      } else {
        ctx.strokeStyle = fx.family === 'magic' ? '#b794f4' : fx.family === 'ranged' ? '#f6c453' : '#e2e8f0';
        ctx.lineWidth = fx.family === 'melee' ? 4 : 2;
        ctx.beginPath();
        ctx.moveTo(pos.x + 7, pos.y + 22);
        ctx.lineTo(pos.x + 24, pos.y + 8);
        ctx.stroke();
      }
    }
    game.fx.weaponAttacks = (game.fx.weaponAttacks || []).filter((fx) => fx.elapsed < fx.duration);
  }

  drawDebug(game) {
    const { ctx } = this;
    ctx.strokeStyle = '#ffab4c';
    for (const enemy of game.currentEnemies) {
      if (enemy.dead) continue;
      const ai = enemy.template.ai;
      const pos = game.camera.worldToScreen(enemy.x, enemy.y);
      ctx.beginPath();
      ctx.arc(pos.x + 16, pos.y + 16, ai.aggroRange * TILE_SIZE, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.strokeStyle = '#8d7bff';
    for (const portal of game.currentMap.objects.portals || []) {
      const pos = game.camera.worldToScreen(portal.x, portal.y);
      ctx.strokeRect(pos.x + 4, pos.y + 4, 24, 24);
      const label = portal.targetTown ? `to:${portal.targetTown}` : `levels:${(portal.levels || []).join(',')}`;
      ctx.fillStyle = '#ddd';
      ctx.fillText(label, pos.x - 8, pos.y - 4);
    }

    ctx.strokeStyle = '#6bf7b3';
    const playerPos = game.camera.worldToScreen(game.player.x, game.player.y);
    ctx.strokeRect(playerPos.x + 6, playerPos.y + 6, 20, 20);

    ctx.strokeStyle = '#ffdd66';
    ctx.strokeRect(0, 0, game.camera.viewportWidth, game.camera.viewportHeight);

    ctx.fillStyle = '#111';
    ctx.fillRect(8, 8, 430, 92);
    ctx.fillStyle = '#fff';
    debugText(game).forEach((line, i) => ctx.fillText(line, 14, 28 + i * 16));
  }
}

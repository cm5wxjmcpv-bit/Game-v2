import { TILE_SIZE } from './camera.js';
import { Renderer } from './renderer.js';

function drawFallback(ctx, x, y, visual = {}) {
  const size = Number.isFinite(visual.size) ? visual.size : 20;
  const offset = (TILE_SIZE - size) / 2;
  ctx.fillStyle = visual.color || '#c084fc';
  if (visual.shape === 'circle') {
    ctx.beginPath();
    ctx.arc(x + TILE_SIZE / 2, y + TILE_SIZE / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.fillRect(x + offset, y + offset, size, size);
}

export class PackageRenderer extends Renderer {
  drawEntities(game) {
    const { ctx } = this;

    for (const entity of game.currentEntities || []) {
      if (!entity.active) continue;
      const pos = game.camera.worldToScreen(entity.x, entity.y);
      const render = entity.components?.render || {};
      const image = this.getTextureImage(render.imagePath);
      const size = Number.isFinite(render.size) ? render.size : 18;
      if (image) {
        const offset = (TILE_SIZE - size) / 2;
        ctx.drawImage(image, pos.x + offset, pos.y + offset, size, size);
      } else {
        drawFallback(ctx, pos.x, pos.y, render);
      }
    }

    const playerPos = game.camera.worldToScreen(game.player.x, game.player.y);
    if (!this.drawPlayerSprite(game, playerPos.x, playerPos.y)) {
      drawFallback(ctx, playerPos.x, playerPos.y, game.player.visual);
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
}

import { drawMiniMap } from './miniMap.js';
import { debugText } from './debug.js';

const TILE_SIZE = 32;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  render(game) {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!game.currentMap) return;

    this.drawMap(game);
    this.drawObjects(game);
    this.drawEntities(game);
    this.drawFx(game);
    drawMiniMap(ctx, game, this.canvas.width - 210, 10, 200, 140);
    if (game.debug.enabled) this.drawDebug(game);
  }

  drawMap(game) {
    const { ctx } = this;
    const pack = game.db.texturePack;
    const map = game.currentMap;

    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const tileId = map.tiles[y][x];
        const tileDef = game.db.tileDefs[tileId];
        const style = pack[tileDef.texture] || { color: '#ff00ff' };
        ctx.fillStyle = style.color;
        ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }
  }

  drawObjects(game) {
    const { ctx } = this;
    for (const portal of game.currentMap.objects.portals || []) {
      ctx.fillStyle = '#8d7bff';
      ctx.fillRect(portal.x * TILE_SIZE + 4, portal.y * TILE_SIZE + 4, 24, 24);
    }
    for (const shop of game.currentMap.objects.shops || []) {
      ctx.fillStyle = '#f4bd5a';
      ctx.fillRect(shop.x * TILE_SIZE + 6, shop.y * TILE_SIZE + 6, 20, 20);
    }
    for (const fountain of game.currentMap.objects.fountains || []) {
      ctx.fillStyle = '#45d7f5';
      ctx.fillRect(fountain.x * TILE_SIZE + 8, fountain.y * TILE_SIZE + 8, 16, 16);
    }
  }

  drawEntities(game) {
    const { ctx } = this;
    ctx.fillStyle = '#7af0a0';
    ctx.fillRect(game.player.x * TILE_SIZE + 6, game.player.y * TILE_SIZE + 6, 20, 20);

    for (const enemy of game.currentEnemies) {
      if (enemy.dead) continue;
      ctx.fillStyle = '#f06464';
      ctx.fillRect(enemy.x * TILE_SIZE + 6, enemy.y * TILE_SIZE + 6, 20, 20);
    }
  }

  drawFx(game) {
    const { ctx } = this;
    for (const m of game.fx.hitMarkers) {
      ctx.fillStyle = '#fff';
      ctx.fillText(m.text, m.x * TILE_SIZE, m.y * TILE_SIZE - 8);
      m.ttl -= game.dt;
    }
    game.fx.hitMarkers = game.fx.hitMarkers.filter((m) => m.ttl > 0);
  }

  drawDebug(game) {
    const { ctx } = this;
    ctx.strokeStyle = '#ffab4c';
    for (const enemy of game.currentEnemies) {
      if (enemy.dead) continue;
      const ai = enemy.template.ai;
      ctx.beginPath();
      ctx.arc(enemy.x * TILE_SIZE + 16, enemy.y * TILE_SIZE + 16, ai.aggroRange * TILE_SIZE, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = '#111';
    ctx.fillRect(8, 8, 360, 76);
    ctx.fillStyle = '#fff';
    debugText(game).forEach((line, i) => ctx.fillText(line, 14, 28 + i * 16));
  }
}

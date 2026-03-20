export function drawMiniMap(ctx, game, x, y, w, h) {
  if (!game.currentMap) return;
  const map = game.currentMap;
  const scaleX = w / map.width;
  const scaleY = h / map.height;

  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = '#0f1420';
  ctx.fillRect(x, y, w, h);

  for (let row = 0; row < map.height; row++) {
    for (let col = 0; col < map.width; col++) {
      const tile = game.db.tileDefs[map.tiles[row][col]];
      ctx.fillStyle = tile.minimapColor || '#3f4a60';
      ctx.fillRect(x + col * scaleX, y + row * scaleY, scaleX, scaleY);
    }
  }

  ctx.fillStyle = '#6bf7b3';
  ctx.fillRect(x + game.player.x * scaleX - 1, y + game.player.y * scaleY - 1, 3, 3);
  ctx.restore();
}

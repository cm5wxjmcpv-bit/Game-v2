export function isInsideMapBounds(map, x, y) {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  return tx >= 0 && ty >= 0 && tx < map.width && ty < map.height;
}

export function canWalkTo(map, x, y, tileDefs) {
  if (!isInsideMapBounds(map, x, y)) return false;
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  const tileId = map.tiles[ty]?.[tx];
  const tile = tileDefs[tileId];
  return Boolean(tile) && tile.walkable !== false;
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

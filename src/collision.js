export function canWalkTo(map, x, y, tileDefs) {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return false;
  const tileId = map.tiles[ty][tx];
  const tile = tileDefs[tileId];
  return tile?.walkable !== false;
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

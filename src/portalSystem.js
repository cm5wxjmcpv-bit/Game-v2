import { distance } from './collision.js';

export function getNearbyPortal(player, map) {
  return (map.objects.portals || []).find((p) => distance(player, p) <= 1.1) || null;
}

export function getUnlockedPortalLevels(player, portal) {
  return portal.levels.filter((id) => player.unlocks.levels.includes(id));
}

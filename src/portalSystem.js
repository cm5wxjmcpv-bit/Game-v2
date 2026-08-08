import { distance } from './collision.js';
import './portalRender.js';

export function getPortalTrigger(portal) {
  return portal?.trigger === 'touch' ? 'touch' : 'interact';
}

export function getNearbyPortal(player, map, options = {}) {
  const trigger = options.trigger === 'touch' ? 'touch' : 'interact';
  return (map.objects.portals || []).find((portal) => {
    if (getPortalTrigger(portal) !== trigger) return false;
    const fallbackRange = trigger === 'touch' ? 0.55 : 1.1;
    const range = Number.isFinite(Number(portal.range)) ? Math.max(0.2, Number(portal.range)) : fallbackRange;
    return distance(player, portal) <= range;
  }) || null;
}

export function getUnlockedPortalLevels(player, portal) {
  return (portal.levels || []).filter((id) => player.unlocks.levels.includes(id));
}

export function getPortalLockReason(player, portal) {
  const requirement = portal?.requirement;
  if (!requirement || requirement.type === 'none') return null;
  const id = String(requirement.id || '').trim();
  if (!id) return requirement.message || 'This portal is locked.';
  let allowed = true;
  if (requirement.type === 'level_unlocked') allowed = (player?.unlocks?.levels || []).includes(id);
  else if (requirement.type === 'town_unlocked') allowed = (player?.unlocks?.towns || []).includes(id);
  else if (requirement.type === 'level_completed') allowed = (player?.completedLevels || []).includes(id);
  return allowed ? null : (requirement.message || 'This portal is locked.');
}

export function getPortalTarget(portal) {
  if (portal?.targetScene) return { type: 'scene', id: portal.targetScene };
  if (portal?.targetTown) return { type: 'town', id: portal.targetTown };
  if (portal?.targetLevel) return { type: 'level', id: portal.targetLevel };
  return null;
}

export function getPortalArrival(portal) {
  const x = Number(portal?.arrival?.x);
  const y = Number(portal?.arrival?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

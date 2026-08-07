import { canEquipWeapon, isWeaponItem } from './weaponSystem.js';
import { playerOwnsItem } from './inventory.js';

export function equipItemDetailed(player, itemId, itemsById, options = {}) {
  const item = itemsById[itemId];
  if (!item?.equipSlot) return { ok: false, reason: 'That item cannot be equipped.' };
  if (options.requireOwned !== false && !playerOwnsItem(player, itemId) && player.equipment[item.equipSlot] !== itemId) {
    return { ok: false, reason: 'That item is not in the inventory.' };
  }
  if (isWeaponItem(item)) {
    const allowed = canEquipWeapon(player, item);
    if (!allowed.ok) return allowed;
  }
  player.equipment[item.equipSlot] = itemId;
  if (options.instanceId) {
    player.equipmentInstances = { ...(player.equipmentInstances || {}), [item.equipSlot]: options.instanceId };
  }
  return { ok: true };
}

export function equipItem(player, itemId, itemsById, options = {}) {
  return equipItemDetailed(player, itemId, itemsById, options).ok;
}

export function getStatBlock(player, itemsById) {
  const statMods = { attack: 0, defense: 0, agility: 0, maxHp: 0 };
  Object.values(player.equipment).forEach((itemId) => {
    if (!itemId) return;
    const item = itemsById[itemId];
    if (!item?.mods) return;
    for (const [k, v] of Object.entries(item.mods)) statMods[k] = (statMods[k] || 0) + v;
  });

  return {
    attack: player.stats.attack + statMods.attack,
    defense: player.stats.defense + statMods.defense,
    agility: player.stats.agility + statMods.agility,
    maxHp: player.stats.maxHp + statMods.maxHp,
  };
}

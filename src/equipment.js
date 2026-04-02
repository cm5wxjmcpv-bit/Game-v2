export function equipItem(player, itemId, itemsById) {
  const item = itemsById[itemId];
  if (!item?.equipSlot) return false;
  player.equipment[item.equipSlot] = itemId;
  return true;
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

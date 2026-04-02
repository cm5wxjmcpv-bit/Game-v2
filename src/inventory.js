export function addItemToBag(player, itemId, count = 1, itemsById) {
  const item = itemsById[itemId];
  if (!item) return false;
  if (item.stackable) {
    const slot = player.bag.items.find((it) => it.itemId === itemId && it.count < player.bag.maxStack);
    if (slot) {
      slot.count += count;
      return true;
    }
  }
  if (player.bag.items.length >= player.bag.slots) return false;
  player.bag.items.push({ itemId, count });
  return true;
}

export function removeItemFromBag(player, itemId, count = 1) {
  const slot = player.bag.items.find((it) => it.itemId === itemId);
  if (!slot || slot.count < count) return false;
  slot.count -= count;
  if (slot.count <= 0) player.bag.items = player.bag.items.filter((it) => it !== slot);
  return true;
}

export function expandBag(player, slotsToAdd, cost) {
  if (player.gold < cost) return false;
  player.gold -= cost;
  player.bag.slots += slotsToAdd;
  return true;
}

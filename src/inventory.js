import { isWeaponItem } from './weaponSystem.js';

let fallbackInstanceSequence = 0;

function positiveCount(value, fallback = 1) {
  const count = Math.floor(Number(value));
  return Number.isFinite(count) && count > 0 ? count : fallback;
}

function createInstanceId(itemId) {
  if (globalThis.crypto?.randomUUID) return `${itemId}_${globalThis.crypto.randomUUID().slice(0, 10)}`;
  fallbackInstanceSequence += 1;
  return `${itemId}_instance_${Date.now().toString(36)}_${fallbackInstanceSequence}`;
}

export function isStackableInventoryItem(item) {
  return Boolean(item) && !isWeaponItem(item);
}

export function addItemToBagDetailed(player, itemId, count = 1, itemsById = {}) {
  const item = itemsById[itemId];
  const requested = positiveCount(count);
  if (!item || !player?.bag || !Array.isArray(player.bag.items)) {
    return { ok: false, added: 0, remaining: requested, reason: 'Unknown item or invalid inventory.' };
  }

  const maxStack = Math.max(1, positiveCount(player.bag.maxStack, 99));
  const slotLimit = Math.max(0, Math.floor(Number(player.bag.slots) || 0));
  let remaining = requested;

  if (isStackableInventoryItem(item)) {
    for (const slot of player.bag.items) {
      if (slot.itemId !== itemId || slot.count >= maxStack || remaining <= 0) continue;
      const amount = Math.min(maxStack - slot.count, remaining);
      slot.count += amount;
      remaining -= amount;
    }
    while (remaining > 0 && player.bag.items.length < slotLimit) {
      const amount = Math.min(maxStack, remaining);
      player.bag.items.push({ itemId, count: amount });
      remaining -= amount;
    }
  } else {
    while (remaining > 0 && player.bag.items.length < slotLimit) {
      player.bag.items.push({ itemId, count: 1, instanceId: createInstanceId(itemId), favorite: false });
      remaining -= 1;
    }
  }

  const added = requested - remaining;
  return {
    ok: remaining === 0,
    added,
    remaining,
    reason: remaining ? 'Bag is full.' : '',
  };
}

export function addItemToBag(player, itemId, count = 1, itemsById = {}) {
  return addItemToBagDetailed(player, itemId, count, itemsById).ok;
}

export function removeItemFromBag(player, itemId, count = 1, instanceId = null) {
  const requested = positiveCount(count);
  const matching = (player?.bag?.items || []).filter((slot) =>
    slot.itemId === itemId && (!instanceId || slot.instanceId === instanceId)
  );
  const available = matching.reduce((sum, slot) => sum + positiveCount(slot.count), 0);
  if (available < requested) return false;

  let remaining = requested;
  for (const slot of matching) {
    if (remaining <= 0) break;
    const amount = Math.min(slot.count, remaining);
    slot.count -= amount;
    remaining -= amount;
  }
  player.bag.items = player.bag.items.filter((slot) => slot.count > 0);
  return true;
}

export function removeBagSlot(player, instanceId) {
  const index = (player?.bag?.items || []).findIndex((slot) => slot.instanceId === instanceId);
  if (index < 0) return null;
  const [removed] = player.bag.items.splice(index, 1);
  return removed || null;
}

export function removeBagSlotAt(player, index) {
  if (!Number.isInteger(index) || index < 0 || index >= (player?.bag?.items || []).length) return null;
  const [removed] = player.bag.items.splice(index, 1);
  return removed || null;
}

export function ensureInventoryInstances(player, itemsById = {}) {
  for (const slot of player?.bag?.items || []) {
    const item = itemsById[slot.itemId];
    slot.count = positiveCount(slot.count);
    if (!isStackableInventoryItem(item)) {
      slot.count = 1;
      slot.instanceId ||= createInstanceId(slot.itemId);
      slot.favorite = Boolean(slot.favorite);
    }
  }
  return player;
}

export function playerOwnsItem(player, itemId) {
  return (player?.bag?.items || []).some((slot) => slot.itemId === itemId);
}

export function toggleBagFavorite(player, instanceId) {
  const slot = (player?.bag?.items || []).find((entry) => entry.instanceId === instanceId);
  if (!slot) return false;
  slot.favorite = !slot.favorite;
  return slot.favorite;
}

export function expandBag(player, slotsToAdd, cost) {
  if (player.gold < cost) return false;
  player.gold -= cost;
  player.bag.slots += slotsToAdd;
  return true;
}

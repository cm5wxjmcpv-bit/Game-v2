import { addItemToBag, removeItemFromBag } from './inventory.js';

export function getShopInventory(shopDef) {
  return shopDef.stock;
}

export function buyFromShop(player, shopDef, offer, db) {
  const price = offer.buyPrice;
  if (player.gold < price) return { ok: false, reason: 'Not enough gold.' };
  if (offer.stock !== null && offer.stock <= 0) return { ok: false, reason: 'Out of stock.' };
  const added = addItemToBag(player, offer.itemId, 1, db.itemsById);
  if (!added) return { ok: false, reason: 'Bag is full.' };
  player.gold -= price;
  if (offer.stock !== null) offer.stock -= 1;
  return { ok: true };
}

export function sellToShop(player, itemId, shopDef, db) {
  const offer = shopDef.stock.find((it) => it.itemId === itemId);
  const item = db.itemsById[itemId];
  const sellPrice = offer?.sellPrice ?? item.baseValue ?? 1;
  const removed = removeItemFromBag(player, itemId, 1);
  if (!removed) return { ok: false, reason: 'Item not in bag.' };
  player.gold += sellPrice;
  return { ok: true, sellPrice };
}

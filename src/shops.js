import { addItemToBag, removeItemFromBag } from './inventory.js';
import { getWeaponRaritySettings, isWeaponItem, weaponSellPrice } from './weaponSystem.js';

function finite(value, fallback = 0, minimum = null) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return minimum === null ? number : Math.max(minimum, number);
}

function mergeCatalogStock(catalogStock = [], overrides = []) {
  const byItemId = new Map((catalogStock || []).filter((entry) => entry?.itemId).map((entry) => [entry.itemId, { ...entry }]));
  for (const override of overrides || []) {
    if (!override?.itemId) continue;
    if (override.remove) byItemId.delete(override.itemId);
    else byItemId.set(override.itemId, { ...(byItemId.get(override.itemId) || {}), ...override });
  }
  return [...byItemId.values()];
}

export function buildShopRegistry(shopPayload = {}) {
  const catalogsById = Object.fromEntries((shopPayload.catalogs || [])
    .filter((catalog) => catalog?.id)
    .map((catalog) => [catalog.id, { ...catalog, stock: [...(catalog.stock || [])] }]));
  const shops = (shopPayload.shops || []).filter((shop) => shop?.id).map((shop) => {
    const catalog = catalogsById[shop.catalogId];
    const stock = catalog
      ? mergeCatalogStock(catalog.stock, shop.overrides)
      : [...(shop.stock || [])];
    return { ...shop, catalogId: shop.catalogId || null, stock };
  });
  return {
    catalogsById,
    shopsById: Object.fromEntries(shops.map((shop) => [shop.id, shop])),
  };
}

function defaultBuyPrice(item, settings = {}) {
  const rarity = String(item?.rarity || 'common').toLowerCase();
  const raritySettings = getWeaponRaritySettings(settings)[rarity] || { priceMultiplier: 1 };
  return Math.max(0, Math.floor(finite(item?.baseValue, 0, 0) * finite(raritySettings.priceMultiplier, 1, 0)));
}

function ensureShopState(player, shopDef, now = Date.now()) {
  player.shopState = player.shopState && typeof player.shopState === 'object' ? player.shopState : {};
  const shopState = player.shopState[shopDef.id] && typeof player.shopState[shopDef.id] === 'object'
    ? player.shopState[shopDef.id]
    : { stock: {} };
  shopState.stock = shopState.stock && typeof shopState.stock === 'object' ? shopState.stock : {};

  for (const offer of shopDef.stock || []) {
    if (offer.stock === null || offer.stock === undefined) continue;
    const maximum = Math.max(0, Math.floor(finite(offer.stock, 0, 0)));
    let entry = shopState.stock[offer.itemId];
    if (!entry) entry = { quantity: maximum, nextRestockAt: null };
    const restockSeconds = finite(offer.restockSeconds, 0, 0);
    if (restockSeconds > 0 && Number.isFinite(entry.nextRestockAt) && now >= entry.nextRestockAt) {
      entry.quantity = maximum;
      entry.nextRestockAt = null;
    }
    shopState.stock[offer.itemId] = entry;
  }
  player.shopState[shopDef.id] = shopState;
  return shopState;
}

export function getShopInventory(shopDef, player = null, db = {}, now = Date.now()) {
  const state = player ? ensureShopState(player, shopDef, now) : null;
  return (shopDef.stock || []).map((offer) => {
    const item = db.itemsById?.[offer.itemId];
    const stateEntry = state?.stock?.[offer.itemId];
    return {
      ...offer,
      buyPrice: Number.isFinite(Number(offer.buyPrice)) ? Number(offer.buyPrice) : defaultBuyPrice(item, db.settings),
      sellPrice: Number.isFinite(Number(offer.sellPrice))
        ? Number(offer.sellPrice)
        : isWeaponItem(item)
          ? weaponSellPrice(item, db.settings)
          : Math.max(0, Math.floor(finite(item?.baseValue, 1, 0) * finite(db.settings?.weapons?.sellPricePercent, 0.5, 0))),
      availableStock: offer.stock === null || offer.stock === undefined ? null : stateEntry?.quantity ?? 0,
    };
  });
}

export function buyFromShop(player, shopDef, offer, db, now = Date.now()) {
  const current = getShopInventory(shopDef, player, db, now).find((entry) => entry.itemId === offer.itemId);
  if (!current) return { ok: false, reason: 'That item is not sold here.' };
  if (player.gold < current.buyPrice) return { ok: false, reason: 'Not enough gold.' };
  if (current.availableStock !== null && current.availableStock <= 0) return { ok: false, reason: 'Out of stock.' };
  const added = addItemToBag(player, current.itemId, 1, db.itemsById);
  if (!added) return { ok: false, reason: 'Bag is full.' };
  player.gold -= current.buyPrice;
  if (current.availableStock !== null) {
    const state = ensureShopState(player, shopDef, now);
    const entry = state.stock[current.itemId];
    entry.quantity = Math.max(0, entry.quantity - 1);
    const restockSeconds = finite(current.restockSeconds, 0, 0);
    if (restockSeconds > 0 && entry.quantity < Math.max(0, Math.floor(finite(current.stock, 0, 0)))) {
      entry.nextRestockAt ||= now + restockSeconds * 1000;
    }
  }
  return { ok: true, price: current.buyPrice };
}

export function sellToShop(player, itemId, shopDef, db, instanceId = null) {
  const offer = getShopInventory(shopDef, player, db).find((entry) => entry.itemId === itemId);
  const item = db.itemsById[itemId];
  if (!item) return { ok: false, reason: 'Unknown item.' };
  const sellPrice = offer?.sellPrice ?? (isWeaponItem(item)
    ? weaponSellPrice(item, db.settings)
    : Math.max(0, Math.floor(finite(item.baseValue, 1, 0) * finite(db.settings?.weapons?.sellPricePercent, 0.5, 0))));
  const removed = removeItemFromBag(player, itemId, 1, instanceId);
  if (!removed) return { ok: false, reason: 'Item not in bag.' };
  player.gold += sellPrice;
  return { ok: true, sellPrice };
}

export const WEAPON_FAMILIES = Object.freeze(['melee', 'ranged', 'magic']);
export const WEAPON_SUBTYPES = Object.freeze({
  melee: ['sword', 'axe', 'spear'],
  ranged: ['bow', 'firearm'],
  magic: ['staff', 'wand'],
});

export const WEAPON_RARITIES = Object.freeze(['common', 'uncommon', 'rare', 'epic', 'legendary']);

export const DEFAULT_RARITY_SETTINGS = Object.freeze({
  common: { label: 'Common', color: '#94a3b8', priceMultiplier: 1, statMultiplier: 1 },
  uncommon: { label: 'Uncommon', color: '#4ade80', priceMultiplier: 1.35, statMultiplier: 1.15 },
  rare: { label: 'Rare', color: '#60a5fa', priceMultiplier: 2, statMultiplier: 1.35 },
  epic: { label: 'Epic', color: '#c084fc', priceMultiplier: 3.25, statMultiplier: 1.65 },
  legendary: { label: 'Legendary', color: '#f59e0b', priceMultiplier: 5, statMultiplier: 2 },
});

export const SPECIAL_ATTACK_PRESETS = Object.freeze({
  heavy: { label: 'Heavy single-target attack', multiplier: 1.8, targeting: 'single', hitCount: 1 },
  area: { label: 'Area attack or explosion', multiplier: 1.05, targeting: 'area', radius: 1.75, hitCount: 1 },
  piercing: { label: 'Piercing or multi-target attack', multiplier: 0.9, targeting: 'multi', maxTargets: 3, hitCount: 1 },
  rapid: { label: 'Rapid multi-hit attack', multiplier: 0.55, targeting: 'single', hitCount: 3 },
  status: { label: 'Burn, poison, freeze, or stun', multiplier: 0.7, targeting: 'single', hitCount: 1 },
  support: { label: 'Healing, shield, or stat boost', multiplier: 0, targeting: 'self', hitCount: 1 },
});

const FAMILY_DEFAULTS = Object.freeze({
  melee: { range: 1.35, cooldown: 0.8, projectileSpeed: 0 },
  ranged: { range: 4.5, cooldown: 0.95, projectileSpeed: 10 },
  magic: { range: 4, cooldown: 1.05, projectileSpeed: 8 },
});

const SUBTYPE_TEMPLATES = Object.freeze({
  sword: 'sword-slash',
  axe: 'axe-chop',
  spear: 'spear-thrust',
  bow: 'bow-shot',
  firearm: 'firearm-shot',
  staff: 'staff-cast',
  wand: 'wand-cast',
});

function finite(value, fallback = 0, minimum = null) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return minimum === null ? number : Math.max(minimum, number);
}

function cleanString(value, fallback = '') {
  const cleaned = String(value ?? '').trim();
  return cleaned || fallback;
}

function cleanStringArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => cleanString(entry)).filter(Boolean))];
}

function inferSubtype(item = {}) {
  const haystack = `${item.id || ''} ${item.name || ''}`.toLowerCase();
  if (/\baxe\b/.test(haystack)) return 'axe';
  if (/\bspear\b|\blance\b/.test(haystack)) return 'spear';
  if (/\bbow\b/.test(haystack)) return 'bow';
  if (/\bgun\b|\brifle\b|\bpistol\b|\bfirearm\b/.test(haystack)) return 'firearm';
  if (/\bwand\b/.test(haystack)) return 'wand';
  if (/\bstaff\b|\brod\b/.test(haystack)) return 'staff';
  return 'sword';
}

function familyForSubtype(subtype) {
  return Object.entries(WEAPON_SUBTYPES)
    .find(([, subtypes]) => subtypes.includes(subtype))?.[0] || 'melee';
}

function normalizeResource(resource = {}) {
  const type = ['none', 'ammo', 'mana'].includes(resource.type) ? resource.type : 'none';
  return {
    type,
    itemId: type === 'ammo' ? cleanString(resource.itemId) : '',
    cost: type === 'none' ? 0 : finite(resource.cost, 1, 0),
  };
}

function normalizeAttack(attack = {}, defaults = {}) {
  return {
    power: finite(attack.power, defaults.power ?? 0, 0),
    multiplier: finite(attack.multiplier, defaults.multiplier ?? 1, 0),
    range: finite(attack.range, defaults.range ?? 1.2, 0.1),
    cooldown: finite(attack.cooldown, defaults.cooldown ?? 0.8, 0),
    reloadTime: finite(attack.reloadTime, defaults.reloadTime ?? 0, 0),
    requiresReload: Boolean(attack.requiresReload ?? defaults.requiresReload),
    projectileSpeed: finite(attack.projectileSpeed, defaults.projectileSpeed ?? 0, 0),
    resource: normalizeResource(attack.resource || defaults.resource),
  };
}

function normalizeArtAsset(asset = {}, fallbackSource = '') {
  const crop = asset.crop && typeof asset.crop === 'object' ? asset.crop : {};
  return {
    src: cleanString(asset.src, fallbackSource),
    scale: finite(asset.scale, 1, 0.05),
    rotation: finite(asset.rotation, 0),
    flipX: Boolean(asset.flipX),
    crop: {
      top: finite(crop.top, 0, 0),
      right: finite(crop.right, 0, 0),
      bottom: finite(crop.bottom, 0, 0),
      left: finite(crop.left, 0, 0),
    },
  };
}

export function isWeaponItem(item) {
  const category = String(item?.category || '').toLowerCase().replace(/s$/, '');
  return category === 'weapon' || item?.equipSlot === 'weapon' || Boolean(item?.weapon);
}

export function defaultAnimationTemplate(subtype) {
  return SUBTYPE_TEMPLATES[subtype] || 'sword-slash';
}

export function normalizeWeaponDefinition(item = {}) {
  if (!isWeaponItem(item)) return item;
  const source = item.weapon && typeof item.weapon === 'object' ? item.weapon : {};
  const subtype = WEAPON_SUBTYPES[source.family]?.includes(source.subtype)
    ? source.subtype
    : Object.values(WEAPON_SUBTYPES).flat().includes(source.subtype)
      ? source.subtype
      : inferSubtype(item);
  const family = WEAPON_FAMILIES.includes(source.family) ? source.family : familyForSubtype(subtype);
  const familyDefaults = FAMILY_DEFAULTS[family];
  const legacyPower = finite(item.power, 0, 0);
  const normalAttack = normalizeAttack(source.normalAttack, {
    power: legacyPower,
    range: finite(item.attackRange, familyDefaults.range, 0.1),
    cooldown: finite(item.cooldown, familyDefaults.cooldown, 0),
    projectileSpeed: familyDefaults.projectileSpeed,
  });
  const presetId = SPECIAL_ATTACK_PRESETS[source.specialAttack?.preset]
    ? source.specialAttack.preset
    : 'heavy';
  const preset = SPECIAL_ATTACK_PRESETS[presetId];
  const specialSource = source.specialAttack || {};
  const specialAttack = {
    ...normalizeAttack(specialSource, {
      power: normalAttack.power,
      multiplier: preset.multiplier,
      range: normalAttack.range,
      cooldown: 4,
      projectileSpeed: normalAttack.projectileSpeed,
    }),
    enabled: Boolean(specialSource.enabled),
    preset: presetId,
    targeting: cleanString(specialSource.targeting, preset.targeting),
    radius: finite(specialSource.radius, preset.radius ?? 0, 0),
    maxTargets: Math.max(1, Math.floor(finite(specialSource.maxTargets, preset.maxTargets ?? 1, 1))),
    hitCount: Math.max(1, Math.floor(finite(specialSource.hitCount, preset.hitCount ?? 1, 1))),
    status: {
      type: cleanString(specialSource.status?.type, 'burn'),
      duration: finite(specialSource.status?.duration, 3, 0.1),
      value: finite(specialSource.status?.value, -1),
      tickEvery: finite(specialSource.status?.tickEvery, 1, 0),
    },
    support: {
      type: cleanString(specialSource.support?.type, 'heal'),
      value: finite(specialSource.support?.value, 5),
      duration: finite(specialSource.support?.duration, 3, 0),
    },
  };
  const art = source.art && typeof source.art === 'object' ? source.art : {};
  const equippedArt = normalizeArtAsset(art.equipped || art.world || {}, cleanString(item.image));
  const rarity = WEAPON_RARITIES.includes(String(item.rarity || '').toLowerCase())
    ? String(item.rarity).toLowerCase()
    : 'common';

  return {
    ...item,
    category: 'weapons',
    equipSlot: 'weapon',
    stackable: false,
    rarity,
    power: normalAttack.power,
    attackRange: normalAttack.range,
    cooldown: normalAttack.cooldown,
    weapon: {
      schemaVersion: 1,
      family,
      subtype,
      damageType: cleanString(source.damageType, family === 'magic' ? 'magic' : 'physical'),
      animationTemplate: cleanString(source.animationTemplate, defaultAnimationTemplate(subtype)),
      customAnimation: source.customAnimation && typeof source.customAnimation === 'object'
        ? { ...source.customAnimation }
        : null,
      restrictions: {
        mode: ['none', 'tags', 'characters'].includes(source.restrictions?.mode)
          ? source.restrictions.mode
          : 'none',
        tags: cleanStringArray(source.restrictions?.tags),
        actorIds: cleanStringArray(source.restrictions?.actorIds),
      },
      normalAttack,
      specialAttack,
      art: {
        icon: normalizeArtAsset(art.icon || {}, equippedArt.src),
        equipped: equippedArt,
        projectile: normalizeArtAsset(art.projectile || {}, equippedArt.src),
      },
      futureProgression: {
        enabled: false,
        schemaVersion: 1,
        ...(source.futureProgression && typeof source.futureProgression === 'object'
          ? source.futureProgression
          : {}),
        enabled: false,
      },
    },
  };
}

export function normalizeItemDefinition(item = {}) {
  if (isWeaponItem(item)) return normalizeWeaponDefinition(item);
  return {
    ...item,
    stackable: true,
    rarity: WEAPON_RARITIES.includes(String(item.rarity || '').toLowerCase())
      ? String(item.rarity).toLowerCase()
      : 'common',
  };
}

export function getWeaponRaritySettings(settings = {}) {
  const configured = settings?.weapons?.rarities || {};
  return Object.fromEntries(WEAPON_RARITIES.map((rarity) => [
    rarity,
    { ...DEFAULT_RARITY_SETTINGS[rarity], ...(configured[rarity] || {}) },
  ]));
}

export function canEquipWeapon(player, item) {
  const weapon = normalizeWeaponDefinition(item);
  if (!isWeaponItem(weapon)) return { ok: false, reason: 'That item is not a weapon.' };
  const restrictions = weapon.weapon.restrictions;
  if (restrictions.mode === 'characters' && !restrictions.actorIds.includes(player.actorId)) {
    return { ok: false, reason: 'This weapon is restricted to different characters.' };
  }
  if (restrictions.mode === 'tags') {
    const actorTags = new Set([
      ...(player.components?.tags || []),
      ...(player.components?.combat?.tags || []),
    ]);
    if (!restrictions.tags.some((tag) => actorTags.has(tag))) {
      return { ok: false, reason: 'This character does not have a required weapon tag.' };
    }
  }
  return { ok: true };
}

export function getWeaponAttack(item, attackType = 'normal') {
  const weapon = normalizeWeaponDefinition(item);
  if (!isWeaponItem(weapon)) return null;
  if (attackType === 'special') return weapon.weapon.specialAttack.enabled ? weapon.weapon.specialAttack : null;
  return weapon.weapon.normalAttack;
}

export function ensurePlayerWeaponState(player, settings = {}) {
  const manaSettings = settings?.weapons?.mana || {};
  const configuredMana = player.components?.resources?.mana || {};
  const maxMana = finite(player.resources?.mana?.max, finite(configuredMana.max, finite(manaSettings.defaultMax, 20, 0), 0), 0);
  const currentMana = finite(player.resources?.mana?.current, maxMana, 0);
  player.resources = {
    ...(player.resources || {}),
    mana: {
      max: maxMana,
      current: Math.min(maxMana, currentMana),
      regenPerSecond: finite(configuredMana.regenPerSecond, finite(manaSettings.regenPerSecond, 1, 0), 0),
    },
  };
  player.cooldowns = {
    ...(player.cooldowns || {}),
    autoAttack: finite(player.cooldowns?.autoAttack, 0, 0),
    specialAttack: finite(player.cooldowns?.specialAttack, 0, 0),
    reload: finite(player.cooldowns?.reload, 0, 0),
  };
  return player;
}

export function updateWeaponTimers(player, dt, settings = {}, { safeScene = false } = {}) {
  ensurePlayerWeaponState(player, settings);
  player.cooldowns.autoAttack = Math.max(0, player.cooldowns.autoAttack - dt);
  player.cooldowns.specialAttack = Math.max(0, player.cooldowns.specialAttack - dt);
  player.cooldowns.reload = Math.max(0, player.cooldowns.reload - dt);
  const multiplier = safeScene ? finite(settings?.weapons?.mana?.safeAreaMultiplier, 6, 1) : 1;
  const mana = player.resources.mana;
  mana.current = Math.min(mana.max, mana.current + mana.regenPerSecond * multiplier * dt);
}

export function getBagItemCount(player, itemId) {
  return (player.bag?.items || [])
    .filter((slot) => slot.itemId === itemId)
    .reduce((sum, slot) => sum + finite(slot.count, 0, 0), 0);
}

export function canPayAttackCost(player, attack) {
  const resource = normalizeResource(attack?.resource);
  if (resource.type === 'mana' && finite(player.resources?.mana?.current, 0) < resource.cost) {
    return { ok: false, reason: 'Not enough mana.' };
  }
  if (resource.type === 'ammo') {
    if (!resource.itemId) return { ok: false, reason: 'This weapon has no ammunition type assigned.' };
    if (getBagItemCount(player, resource.itemId) < resource.cost) return { ok: false, reason: 'Out of ammo.' };
  }
  return { ok: true };
}

function removeAmmo(player, itemId, count) {
  let remaining = count;
  for (const slot of player.bag?.items || []) {
    if (slot.itemId !== itemId || remaining <= 0) continue;
    const removed = Math.min(slot.count, remaining);
    slot.count -= removed;
    remaining -= removed;
  }
  player.bag.items = player.bag.items.filter((slot) => slot.count > 0);
  return remaining === 0;
}

export function payAttackCost(player, attack) {
  const affordable = canPayAttackCost(player, attack);
  if (!affordable.ok) return affordable;
  const resource = normalizeResource(attack?.resource);
  if (resource.type === 'mana') player.resources.mana.current -= resource.cost;
  if (resource.type === 'ammo') removeAmmo(player, resource.itemId, resource.cost);
  return { ok: true };
}

export function calculateWeaponDamage({ player, item, attack, target, settings = {} }) {
  const weapon = normalizeWeaponDefinition(item);
  const formula = settings?.weapons?.damageFormula || {};
  const characterWeight = finite(formula.characterAttackWeight, 1, 0);
  const weaponWeight = finite(formula.weaponPowerWeight, 1, 0);
  const defenseWeight = finite(formula.defenseWeight, 1, 0);
  const baseAttack = finite(player?.stats?.attack, 0) * characterWeight;
  const weaponPower = finite(attack?.power, weapon.power, 0) * weaponWeight;
  const multiplier = finite(attack?.multiplier, 1, 0);
  const defense = finite(target?.template?.stats?.defense ?? target?.stats?.defense, 0) * defenseWeight;
  const damageType = weapon.weapon.damageType;
  const resistance = Math.min(0.95, Math.max(-1, finite(target?.template?.resistances?.[damageType], 0)));
  const beforeResistance = Math.max(1, Math.floor((baseAttack + weaponPower) * multiplier - defense));
  return Math.max(1, Math.floor(beforeResistance * (1 - resistance)));
}

export function weaponSellPrice(item, settings = {}) {
  const override = Number(item?.sellPriceOverride);
  if (Number.isFinite(override) && override >= 0) return Math.floor(override);
  const percent = finite(settings?.weapons?.sellPricePercent, 0.5, 0);
  return Math.max(0, Math.floor(finite(item?.baseValue, 0, 0) * percent));
}

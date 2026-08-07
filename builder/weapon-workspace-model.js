import {
  SPECIAL_ATTACK_PRESETS,
  WEAPON_FAMILIES,
  WEAPON_RARITIES,
  WEAPON_SUBTYPES,
  defaultAnimationTemplate,
  isWeaponItem,
  normalizeWeaponDefinition,
} from '../src/weaponSystem.js';

export const WEAPON_PACK_SCHEMA_VERSION = 1;

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function safeId(value, fallback = 'new_weapon') {
  const id = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  return id || fallback;
}

export function weaponSubtypeOptions(family) {
  return [...(WEAPON_SUBTYPES[family] || WEAPON_SUBTYPES.melee)];
}

export function createWeaponDefinition({ family = 'melee', subtype, id = 'new_weapon', name = 'New Weapon' } = {}) {
  const resolvedFamily = WEAPON_FAMILIES.includes(family) ? family : 'melee';
  const resolvedSubtype = WEAPON_SUBTYPES[resolvedFamily].includes(subtype)
    ? subtype
    : WEAPON_SUBTYPES[resolvedFamily][0];
  const defaults = {
    melee: { power: 4, range: 1.35, cooldown: 0.8, projectileSpeed: 0, resource: { type: 'none', itemId: '', cost: 0 } },
    ranged: { power: 4, range: 4.5, cooldown: 0.95, projectileSpeed: 10, resource: { type: 'ammo', itemId: resolvedSubtype === 'bow' ? 'ammo_arrows' : 'ammo_bullets', cost: 1 } },
    magic: { power: 5, range: 4, cooldown: 1.05, projectileSpeed: 8, resource: { type: 'mana', itemId: '', cost: 2 } },
  }[resolvedFamily];
  return normalizeWeaponDefinition({
    id: safeId(id),
    name,
    description: '',
    category: 'weapons',
    equipSlot: 'weapon',
    rarity: 'common',
    baseValue: 20,
    mods: { attack: 0 },
    weapon: {
      family: resolvedFamily,
      subtype: resolvedSubtype,
      damageType: resolvedFamily === 'magic' ? 'magic' : 'physical',
      animationTemplate: defaultAnimationTemplate(resolvedSubtype),
      restrictions: { mode: 'none', tags: [], actorIds: [] },
      normalAttack: { ...defaults, requiresReload: false, reloadTime: 0 },
      specialAttack: {
        enabled: false,
        preset: 'heavy',
        power: defaults.power,
        multiplier: SPECIAL_ATTACK_PRESETS.heavy.multiplier,
        range: defaults.range,
        cooldown: 4,
        projectileSpeed: defaults.projectileSpeed,
        resource: { type: 'none', itemId: '', cost: 0 },
      },
      art: {
        icon: { src: '', scale: 1, rotation: 0, flipX: false, crop: { top: 0, right: 0, bottom: 0, left: 0 } },
        equipped: { src: '', scale: 1, rotation: 0, flipX: false, crop: { top: 0, right: 0, bottom: 0, left: 0 } },
        projectile: { src: '', scale: 1, rotation: 0, flipX: false, crop: { top: 0, right: 0, bottom: 0, left: 0 } },
      },
      customAnimation: null,
      futureProgression: { schemaVersion: 1, enabled: false },
    },
  });
}

export function cloneWeaponDefinition(source, usedIds = []) {
  const weapon = normalizeWeaponDefinition(clone(source));
  const existing = new Set(usedIds);
  const base = safeId(`${weapon.id}_copy`);
  let id = base;
  let index = 2;
  while (existing.has(id)) id = `${base}_${index++}`;
  weapon.id = id;
  weapon.name = `${weapon.name} Copy`;
  return weapon;
}

export function validateWeaponDefinition(source) {
  const weapon = normalizeWeaponDefinition(source);
  const errors = [];
  const warnings = [];
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(String(weapon.id || ''))) errors.push('Weapon ID must use lowercase letters, numbers, underscores, or hyphens.');
  if (!String(weapon.name || '').trim()) errors.push('Weapon name is required.');
  if (!WEAPON_FAMILIES.includes(weapon.weapon.family)) errors.push('Choose a valid weapon family.');
  if (!WEAPON_SUBTYPES[weapon.weapon.family]?.includes(weapon.weapon.subtype)) errors.push('Choose a subtype that belongs to the selected family.');
  if (!WEAPON_RARITIES.includes(weapon.rarity)) errors.push('Choose a valid rarity.');
  const attacks = [['Normal', weapon.weapon.normalAttack]];
  if (weapon.weapon.specialAttack.enabled) attacks.push(['Special', weapon.weapon.specialAttack]);
  for (const [label, attack] of attacks) {
    if (!Number.isFinite(Number(attack.power)) || Number(attack.power) < 0) errors.push(`${label} power must be zero or greater.`);
    if (!Number.isFinite(Number(attack.range)) || Number(attack.range) <= 0) errors.push(`${label} range must be greater than zero.`);
    if (!Number.isFinite(Number(attack.cooldown)) || Number(attack.cooldown) < 0) errors.push(`${label} cooldown must be zero or greater.`);
    if (attack.resource?.type === 'ammo' && !String(attack.resource.itemId || '').trim()) errors.push(`${label} attack needs an ammunition item.`);
    if (attack.resource?.type !== 'none' && Number(attack.resource.cost) <= 0) errors.push(`${label} resource cost must be greater than zero.`);
  }
  if (weapon.weapon.normalAttack.requiresReload && Number(weapon.weapon.normalAttack.reloadTime) <= 0) errors.push('Reload time must be greater than zero when reload is enabled.');
  if (!weapon.weapon.art.icon.src) warnings.push('No inventory artwork is assigned; the game will use a fallback icon.');
  if (Number(weapon.weapon.normalAttack.power) > 100) warnings.push('Normal power is unusually high.');
  if (Number(weapon.weapon.normalAttack.range) > 12) warnings.push('Normal range is unusually large for the current maps.');
  if (Number(weapon.baseValue) > 100000) warnings.push('Base value is unusually high.');
  return { weapon, errors, warnings };
}

function containsWeaponReward(rewards, weaponId) {
  return (rewards || []).some((reward) => reward.type === 'item' && reward.itemId === weaponId);
}

export function scanWeaponReferences(weaponId, workspace = {}) {
  const references = [];
  for (const actor of workspace.actors || []) {
    if (actor.components?.equipment?.starting?.weapon === weaponId) references.push({ kind: 'actor', id: actor.id, label: `Starting weapon for ${actor.name || actor.id}` });
    if ((actor.components?.inventory?.starting || []).some((entry) => entry.itemId === weaponId)) references.push({ kind: 'actor inventory', id: actor.id, label: `Starting inventory for ${actor.name || actor.id}` });
  }
  for (const catalog of workspace.shopPayload?.catalogs || []) {
    if ((catalog.stock || []).some((entry) => entry.itemId === weaponId)) references.push({ kind: 'shop catalog', id: catalog.id, label: catalog.name || catalog.id });
  }
  for (const shop of workspace.shopPayload?.shops || []) {
    if ([...(shop.stock || []), ...(shop.overrides || [])].some((entry) => entry.itemId === weaponId)) references.push({ kind: 'shop', id: shop.id, label: shop.name || shop.id });
  }
  for (const table of workspace.lootTables || []) {
    if ((table.entries || []).some((entry) => containsWeaponReward(entry.rewards, weaponId))) references.push({ kind: 'loot table', id: table.id, label: table.name || table.id });
  }
  for (const rewardPackage of workspace.rewardPackages || []) {
    if (containsWeaponReward(rewardPackage.rewards, weaponId)) references.push({ kind: 'reward package', id: rewardPackage.id, label: rewardPackage.name || rewardPackage.id });
  }
  for (const schedule of workspace.completionRewards || []) {
    if ((schedule.tiers || []).some((tier) => containsWeaponReward(tier.rewards, weaponId))) references.push({ kind: 'completion reward', id: schedule.id, label: schedule.name || schedule.id });
  }
  return references;
}

function removeGeneratedLinks(workspace, weaponId) {
  for (const actor of workspace.actors || []) {
    if (actor.components?.equipment?.starting?.weapon === weaponId && actor.components.equipment.starting._weaponMaker === weaponId) {
      actor.components.equipment.starting.weapon = null;
      delete actor.components.equipment.starting._weaponMaker;
    }
  }
  for (const catalog of workspace.shopPayload?.catalogs || []) {
    catalog.stock = (catalog.stock || []).filter((entry) => entry._weaponMaker !== weaponId);
  }
  for (const table of workspace.lootTables || []) {
    table.entries = (table.entries || []).filter((entry) => entry._weaponMaker !== weaponId);
  }
  for (const schedule of workspace.completionRewards || []) {
    for (const tier of schedule.tiers || []) {
      tier.rewards = (tier.rewards || []).filter((reward) => reward._weaponMaker !== weaponId);
    }
  }
}

export function applyWeaponAvailability(workspace, weaponId, choices = {}) {
  removeGeneratedLinks(workspace, weaponId);
  if (choices.actorId) {
    const actor = (workspace.actors || []).find((entry) => entry.id === choices.actorId);
    if (actor) {
      actor.components ||= {};
      actor.components.equipment ||= { starting: {} };
      actor.components.equipment.starting ||= {};
      actor.components.equipment.starting.weapon = weaponId;
      actor.components.equipment.starting._weaponMaker = weaponId;
    }
  }
  if (choices.catalogId) {
    const catalog = (workspace.shopPayload?.catalogs || []).find((entry) => entry.id === choices.catalogId);
    if (catalog) {
      catalog.stock ||= [];
      if (!catalog.stock.some((entry) => entry.itemId === weaponId)) {
        catalog.stock.push({ itemId: weaponId, stock: null, restockSeconds: 0, _weaponMaker: weaponId });
      }
    }
  }
  if (choices.lootTableId) {
    const table = (workspace.lootTables || []).find((entry) => entry.id === choices.lootTableId);
    if (table) {
      table.entries ||= [];
      table.entries.push({
        id: `${weaponId}_drop`,
        name: `${weaponId} drop`,
        rewards: [{ type: 'item', itemId: weaponId, count: 1 }],
        _weaponMaker: weaponId,
      });
    }
  }
  if (choices.completionRewardId) {
    const schedule = (workspace.completionRewards || []).find((entry) => entry.id === choices.completionRewardId);
    const tierIndex = Math.max(0, Math.min(2, Number(choices.completionTier || 1) - 1));
    const tier = schedule?.tiers?.[tierIndex];
    if (tier) {
      tier.rewards ||= [];
      tier.rewards.push({ type: 'item', itemId: weaponId, count: 1, _weaponMaker: weaponId });
    }
  }
  return workspace;
}

export function exportWeaponPack(source, workspace = {}) {
  const { weapon, errors } = validateWeaponDefinition(source);
  if (errors.length) throw new Error(errors.join(' '));
  const refs = scanWeaponReferences(weapon.id, workspace);
  return {
    schemaVersion: WEAPON_PACK_SCHEMA_VERSION,
    type: 'pixel-engine-weapon-pack',
    exportedAt: new Date().toISOString(),
    weapon: clone(weapon),
    linkedContent: {
      references: refs,
      lootTables: clone((workspace.lootTables || []).filter((table) => refs.some((ref) => ref.kind === 'loot table' && ref.id === table.id))),
      rewardPackages: clone((workspace.rewardPackages || []).filter((entry) => refs.some((ref) => ref.kind === 'reward package' && ref.id === entry.id))),
      completionRewards: clone((workspace.completionRewards || []).filter((entry) => refs.some((ref) => ref.kind === 'completion reward' && ref.id === entry.id))),
    },
  };
}

export function importWeaponPack(pack) {
  if (!pack || pack.schemaVersion !== WEAPON_PACK_SCHEMA_VERSION || pack.type !== 'pixel-engine-weapon-pack') {
    throw new Error('This file is not a supported Pixel Engine weapon pack.');
  }
  const result = validateWeaponDefinition(pack.weapon);
  if (result.errors.length) throw new Error(result.errors.join(' '));
  return { weapon: result.weapon, linkedContent: clone(pack.linkedContent || {}) };
}

export function weaponItems(items = []) {
  return items.filter(isWeaponItem).map(normalizeWeaponDefinition);
}

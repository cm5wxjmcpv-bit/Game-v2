import { actorFromLegacyClass, normalizeActorDefinition } from './actorRuntime.js';
import { addItemToBag } from './inventory.js';

function clone(value) {
  return value && typeof value === 'object' ? structuredClone(value) : value;
}

export function createPlayer(actorData, itemsById, startConfig = {}) {
  const actor = actorData?.components
    ? normalizeActorDefinition(actorData)
    : actorFromLegacyClass(actorData);
  if (!actor) throw new Error('Cannot create player from an invalid actor definition.');

  const components = actor.components;
  const startingEquipment = {
    weapon: null,
    helmet: null,
    armor: null,
    accessory1: null,
    accessory2: null,
    ...(components.equipment.starting || {}),
  };
  const weaponId = startingEquipment.weapon;
  const maxHp = components.health.max;

  const player = {
    id: 'player',
    actorId: actor.id,
    actorName: actor.name,
    classId: actor.legacyClassId,
    type: 'player',
    x: 0,
    y: 0,
    speed: components.movement.speed,
    facing: 'down',
    gold: components.wallet.starting ?? startConfig.gold ?? 0,
    stats: {
      maxHp,
      hp: maxHp,
      attack: components.combat.attack,
      defense: components.combat.defense,
      agility: components.combat.agility,
      xp: 0,
      level: 1,
    },
    growth: clone(components.combat.growth) || {},
    bag: {
      slots: components.inventory.slots,
      maxStack: components.inventory.maxStack,
      items: [],
    },
    equipment: startingEquipment,
    equipmentInstances: {},
    effects: [],
    resources: {
      mana: {
        max: components.resources?.mana?.max ?? 20,
        current: components.resources?.mana?.max ?? 20,
        regenPerSecond: components.resources?.mana?.regenPerSecond ?? 1,
      },
    },
    unlocks: {
      towns: [...(startConfig.unlockedTowns || [])],
      levels: [...(startConfig.unlockedLevels || [])],
    },
    completedLevels: [],
    completionCounts: {},
    pickupState: {},
    shopState: {},
    cooldowns: { autoAttack: 0, specialAttack: 0, reload: 0 },
    baseWeapon: weaponId ? itemsById[weaponId] || null : null,
    questLog: [],
    components: clone(components),
    visual: clone(components.render.fallback),
    animation: {
      facing: 'down',
      state: 'idle',
      frameIndex: 0,
      frameTimer: 0,
      frameDuration: Number.isFinite(components.render.sprite?.frameDuration)
        ? components.render.sprite.frameDuration
        : 0.16,
      sprite: clone(components.render.sprite),
    },
  };

  for (const itemId of Object.values(startingEquipment).filter(Boolean)) {
    addItemToBag(player, itemId, 1, itemsById);
  }
  for (const entry of components.inventory.starting || []) {
    if (entry?.itemId) addItemToBag(player, entry.itemId, entry.count || 1, itemsById);
  }
  return player;
}

export function createEnemy(template, spawn) {
  return {
    id: `${template.id}_${crypto.randomUUID().slice(0, 6)}`,
    templateId: template.id,
    type: 'enemy',
    x: spawn.x,
    y: spawn.y,
    spawnX: spawn.x,
    spawnY: spawn.y,
    hp: template.stats.maxHp,
    dead: false,
    aggroTarget: null,
    aiState: 'idle',
    lastAttackAt: 0,
    template,
    effects: [],
  };
}

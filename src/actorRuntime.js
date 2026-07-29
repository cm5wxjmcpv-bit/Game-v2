const DEFAULT_LEGACY_SPRITE = Object.freeze({
  imagePath: 'assets/characters/Warrior_Blue.png',
  frameWidth: 192,
  frameHeight: 192,
  idleFrames: [0, 1, 2],
  walkFrames: [0, 1, 2],
  rowByFacing: {
    down: { idle: 0, walk: 1 },
    left: { idle: 2, walk: 3 },
    right: { idle: 4, walk: 5 },
    up: { idle: 6, walk: 7 },
  },
});

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function positiveInteger(value, fallback = 0) {
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function clone(value) {
  return value && typeof value === 'object' ? structuredClone(value) : value;
}

export function actorFromLegacyClass(classDef) {
  const stats = classDef?.stats || {};
  const startingGear = classDef?.startingGear || {};
  return normalizeActorDefinition({
    id: classDef?.id,
    name: classDef?.name || classDef?.id,
    legacyClassId: classDef?.id,
    components: {
      movement: { speed: classDef?.movement?.base },
      health: { max: stats.maxHp },
      combat: {
        attack: stats.attack,
        defense: stats.defense,
        agility: stats.agility,
        growth: classDef?.growth || {},
      },
      wallet: { starting: null },
      inventory: { slots: classDef?.bagSlots, maxStack: 99 },
      equipment: {
        starting: {
          weapon: startingGear.weapon ?? null,
          helmet: null,
          armor: startingGear.armor ?? null,
          accessory1: null,
          accessory2: null,
        },
      },
      progression: { enabled: true },
      render: {
        sprite: DEFAULT_LEGACY_SPRITE,
        fallback: { shape: 'square', color: '#7af0a0', size: 20 },
      },
    },
  });
}

export function normalizeActorDefinition(actor) {
  if (!actor || typeof actor !== 'object' || !actor.id) return null;
  const components = actor.components && typeof actor.components === 'object'
    ? actor.components
    : {};
  const movement = components.movement || {};
  const health = components.health || {};
  const combat = components.combat || {};
  const wallet = components.wallet || {};
  const inventory = components.inventory || {};
  const equipment = components.equipment || {};
  const progression = components.progression || {};
  const render = components.render || {};

  return {
    ...actor,
    id: String(actor.id),
    name: String(actor.name || actor.id),
    legacyClassId: actor.legacyClassId ? String(actor.legacyClassId) : null,
    components: {
      ...components,
      movement: { ...movement, speed: finite(movement.speed, 3) },
      health: { ...health, max: Math.max(1, finite(health.max, 10)) },
      combat: {
        ...combat,
        attack: finite(combat.attack, 0),
        defense: finite(combat.defense, 0),
        agility: finite(combat.agility, 0),
        growth: clone(combat.growth) || {},
      },
      wallet: {
        ...wallet,
        starting: Number.isFinite(wallet.starting) ? wallet.starting : null,
      },
      inventory: {
        ...inventory,
        slots: positiveInteger(inventory.slots, 0),
        maxStack: positiveInteger(inventory.maxStack, 99) || 99,
      },
      equipment: {
        ...equipment,
        starting: clone(equipment.starting) || {},
      },
      progression: { ...progression, enabled: progression.enabled !== false },
      render: {
        ...render,
        sprite: render.sprite && typeof render.sprite === 'object' ? clone(render.sprite) : null,
        fallback: {
          shape: String(render.fallback?.shape || 'square'),
          color: String(render.fallback?.color || '#7af0a0'),
          size: Math.max(4, finite(render.fallback?.size, 20)),
        },
      },
    },
  };
}

export function buildActorRegistry(classes = [], actors = []) {
  const registry = {};
  for (const classDef of classes || []) {
    const actor = actorFromLegacyClass(classDef);
    if (actor) registry[actor.id] = actor;
  }
  for (const actorDef of actors || []) {
    const actor = normalizeActorDefinition(actorDef);
    if (actor) registry[actor.id] = actor;
  }
  return registry;
}

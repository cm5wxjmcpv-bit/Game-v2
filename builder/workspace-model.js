const DEFAULT_FALLBACK = Object.freeze({ shape: 'square', color: '#38bdf8', size: 20 });

export function normalizeId(value, fallback = '') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || fallback;
}

function finiteNumber(value, fallback = 0, minimum = null) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return minimum === null ? number : Math.max(minimum, number);
}

function integer(value, fallback = 0, minimum = null) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return minimum === null ? number : Math.max(minimum, number);
}

export function legacyClassToActor(classDef = {}) {
  const id = normalizeId(classDef.id, 'actor');
  const stats = classDef.stats || {};
  const startingGear = classDef.startingGear || {};
  return {
    id,
    name: String(classDef.name || id),
    legacyClassId: classDef.id || id,
    components: {
      movement: { speed: finiteNumber(classDef.movement?.base, 3, 0) },
      health: { max: finiteNumber(stats.maxHp, 10, 1) },
      combat: {
        attack: finiteNumber(stats.attack, 0),
        defense: finiteNumber(stats.defense, 0),
        agility: finiteNumber(stats.agility, 0),
        growth: { ...(classDef.growth || {}) },
      },
      wallet: { starting: 100 },
      inventory: { slots: integer(classDef.bagSlots, 0, 0), maxStack: 99 },
      equipment: { starting: { ...startingGear } },
      progression: { enabled: true },
      render: {
        sprite: {
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
        },
        fallback: { ...DEFAULT_FALLBACK },
      },
    },
  };
}

export function normalizeActor(actor = {}) {
  const id = normalizeId(actor.id, 'actor');
  const components = actor.components || {};
  const fallback = components.render?.fallback || {};
  const sprite = components.render?.sprite || null;
  return {
    ...actor,
    id,
    name: String(actor.name || id),
    components: {
      ...components,
      movement: { speed: finiteNumber(components.movement?.speed, 3, 0) },
      health: { max: finiteNumber(components.health?.max, 10, 1) },
      combat: {
        attack: finiteNumber(components.combat?.attack, 0),
        defense: finiteNumber(components.combat?.defense, 0),
        agility: finiteNumber(components.combat?.agility, 0),
        growth: { ...(components.combat?.growth || {}) },
      },
      wallet: { starting: finiteNumber(components.wallet?.starting, 0) },
      inventory: {
        slots: integer(components.inventory?.slots, 0, 0),
        maxStack: integer(components.inventory?.maxStack, 99, 1),
      },
      equipment: { starting: { ...(components.equipment?.starting || {}) } },
      progression: { enabled: components.progression?.enabled !== false },
      render: {
        sprite: sprite && sprite.imagePath ? { ...sprite } : null,
        fallback: {
          shape: ['square', 'circle', 'diamond'].includes(fallback.shape) ? fallback.shape : DEFAULT_FALLBACK.shape,
          color: /^#[0-9a-f]{6}$/i.test(String(fallback.color || '')) ? String(fallback.color).toLowerCase() : DEFAULT_FALLBACK.color,
          size: finiteNumber(fallback.size, DEFAULT_FALLBACK.size, 4),
        },
      },
    },
  };
}

export function mergeActors(classes = [], directActors = []) {
  const actorsById = {};
  for (const classDef of classes || []) {
    if (!classDef?.id) continue;
    const actor = legacyClassToActor(classDef);
    actorsById[actor.id] = actor;
  }
  for (const actorDef of directActors || []) {
    if (!actorDef?.id) continue;
    const actor = normalizeActor(actorDef);
    actorsById[actor.id] = actor;
  }
  return Object.values(actorsById);
}

export function normalizeEntity(entity = {}, index = 0) {
  const id = normalizeId(entity.id, `entity_${index + 1}`);
  const components = entity.components || {};
  const interaction = components.interaction || {};
  const collision = components.collision || {};
  const render = components.render || {};
  return {
    ...entity,
    id,
    type: normalizeId(entity.type, 'object'),
    x: finiteNumber(entity.x, 0, 0),
    y: finiteNumber(entity.y, 0, 0),
    components: {
      ...components,
      render: {
        shape: ['square', 'circle', 'diamond'].includes(render.shape) ? render.shape : 'square',
        color: /^#[0-9a-f]{6}$/i.test(String(render.color || '')) ? String(render.color).toLowerCase() : '#facc15',
        size: finiteNumber(render.size, 16, 4),
        imagePath: String(render.imagePath || ''),
      },
      interaction: {
        action: ['none', 'message', 'scene'].includes(interaction.action) ? interaction.action : 'none',
        message: String(interaction.message || ''),
        targetScene: normalizeId(interaction.targetScene, ''),
        range: finiteNumber(interaction.range, 1.1, 0.1),
      },
      collision: {
        solid: Boolean(collision.solid),
        radius: finiteNumber(collision.radius, 0.42, 0.05),
      },
    },
  };
}

export function normalizeScene(scene = {}) {
  const width = integer(scene.width, 1, 1);
  const height = integer(scene.height, 1, 1);
  const tiles = Array.from({ length: height }, (_, row) => {
    const source = Array.isArray(scene.tiles?.[row]) ? scene.tiles[row] : [];
    return Array.from({ length: width }, (_, col) => String(source[col] || 'empty'));
  });
  return {
    ...scene,
    id: normalizeId(scene.id, 'scene'),
    name: String(scene.name || scene.id || 'Scene'),
    width,
    height,
    tiles,
    spawn: {
      x: finiteNumber(scene.spawn?.x, 0, 0),
      y: finiteNumber(scene.spawn?.y, 0, 0),
    },
    objects: {
      portals: [...(scene.objects?.portals || [])],
      shops: [...(scene.objects?.shops || [])],
      fountains: [...(scene.objects?.fountains || [])],
      enemySpawns: [...(scene.objects?.enemySpawns || [])],
      battleTriggers: [...(scene.objects?.battleTriggers || [])],
    },
    entities: (scene.entities || []).map(normalizeEntity),
  };
}

export function validateActor(actor) {
  const errors = [];
  if (!normalizeId(actor?.id)) errors.push('Actor ID is required.');
  if (!String(actor?.name || '').trim()) errors.push('Actor name is required.');
  if (finiteNumber(actor?.components?.movement?.speed, -1) < 0) errors.push('Movement speed must be zero or greater.');
  if (finiteNumber(actor?.components?.health?.max, 0) <= 0) errors.push('Maximum health must be greater than zero.');
  return errors;
}

export function validateEntity(entity, scene) {
  const errors = [];
  if (!normalizeId(entity?.id)) errors.push('Entity ID is required.');
  if (!normalizeId(entity?.type)) errors.push('Entity type is required.');
  const x = finiteNumber(entity?.x, -1);
  const y = finiteNumber(entity?.y, -1);
  if (x < 0 || y < 0 || x >= scene.width || y >= scene.height) errors.push('Entity coordinates must be inside the selected scene.');
  const interaction = entity?.components?.interaction || {};
  if (interaction.action === 'message' && !String(interaction.message || '').trim()) errors.push('Message interactions require message text.');
  if (interaction.action === 'scene' && !normalizeId(interaction.targetScene)) errors.push('Scene interactions require a target scene.');
  return errors;
}

export function upsertById(list, entry) {
  const next = [...(list || [])];
  const index = next.findIndex((item) => item.id === entry.id);
  if (index >= 0) next[index] = entry;
  else next.push(entry);
  return next;
}

export function removeById(list, id) {
  return (list || []).filter((entry) => entry.id !== id);
}

import { distance } from './collision.js';

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

export function normalizeSceneEntity(entity, index = 0) {
  if (!entity || typeof entity !== 'object') return null;
  const components = entity.components && typeof entity.components === 'object'
    ? entity.components
    : {};
  const render = components.render || {};
  const interaction = components.interaction || null;
  const collision = components.collision || {};

  return {
    ...entity,
    id: String(entity.id || `entity_${index + 1}`),
    type: String(entity.type || 'entity'),
    x: finite(entity.x, 0),
    y: finite(entity.y, 0),
    active: entity.active !== false,
    tags: Array.isArray(entity.tags) ? [...entity.tags] : [],
    components: {
      ...components,
      render: {
        ...render,
        shape: String(render.shape || 'square'),
        color: String(render.color || '#c084fc'),
        size: Math.max(4, finite(render.size, 18)),
        imagePath: render.imagePath ? String(render.imagePath) : null,
      },
      interaction: interaction && typeof interaction === 'object'
        ? {
            ...interaction,
            action: String(interaction.action || 'message'),
            message: String(interaction.message || ''),
            range: Math.max(0.1, finite(interaction.range, 1.1)),
          }
        : null,
      collision: {
        ...collision,
        solid: collision.solid === true,
        radius: Math.max(0.1, finite(collision.radius, 0.42)),
      },
    },
  };
}

export function normalizeSceneEntities(entities = []) {
  return (Array.isArray(entities) ? entities : [])
    .map((entity, index) => normalizeSceneEntity(entity, index))
    .filter(Boolean);
}

export function findNearbyInteractiveEntity(player, entities = []) {
  return entities.find((entity) => {
    if (!entity.active || !entity.components.interaction) return false;
    return distance(player, entity) <= entity.components.interaction.range;
  }) || null;
}

export function isBlockedBySceneEntity(x, y, entities = []) {
  return entities.some((entity) => {
    if (!entity.active || !entity.components.collision.solid) return false;
    return Math.hypot(x - entity.x, y - entity.y) < entity.components.collision.radius;
  });
}

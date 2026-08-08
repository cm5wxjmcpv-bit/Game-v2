import { normalizeSceneEntity } from './sceneEntityRuntime.js';

export const NPC_ROLES = Object.freeze(['citizen', 'shopkeeper', 'quest_giver', 'guard', 'enemy', 'custom']);
export const NPC_FACTIONS = Object.freeze(['friendly', 'neutral', 'hostile']);
export const NPC_BEHAVIORS = Object.freeze(['stationary', 'wander', 'patrol']);
export const NPC_APPEARANCE_MODES = Object.freeze(['style', 'texture', 'image']);

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function finite(value, fallback = 0, minimum = null, maximum = null) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  let result = minimum === null ? number : Math.max(minimum, number);
  if (maximum !== null) result = Math.min(maximum, result);
  return result;
}

export function safeNpcId(value, fallback = '') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || fallback;
}

function validColor(value, fallback = '#60a5fa') {
  const color = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : fallback;
}

function normalizePoint(value) {
  if (!value || typeof value !== 'object') return null;
  const x = Number(value.x);
  const y = Number(value.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function normalizeDialogue(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(/\r?\n/);
  return source.map((line) => String(line || '').trim()).filter(Boolean);
}

function normalizeSprite(value) {
  if (!value || typeof value !== 'object' || !String(value.imagePath || '').trim()) return null;
  return {
    ...clone(value),
    imagePath: String(value.imagePath || '').trim(),
    frameWidth: Math.max(1, Math.floor(finite(value.frameWidth, 32, 1))),
    frameHeight: Math.max(1, Math.floor(finite(value.frameHeight, 32, 1))),
    idleFrames: Array.isArray(value.idleFrames) && value.idleFrames.length ? [...value.idleFrames] : [0],
    walkFrames: Array.isArray(value.walkFrames) && value.walkFrames.length ? [...value.walkFrames] : [0],
  };
}

export function normalizeNpcTemplate(value = {}) {
  const id = safeNpcId(value.id, 'npc');
  const role = NPC_ROLES.includes(value.role) ? value.role : 'citizen';
  const faction = NPC_FACTIONS.includes(value.faction) ? value.faction : 'neutral';
  const behaviorValue = value.behavior || {};
  const mode = NPC_BEHAVIORS.includes(behaviorValue.mode) ? behaviorValue.mode : 'stationary';
  const renderValue = value.render || {};
  const appearanceMode = NPC_APPEARANCE_MODES.includes(renderValue.mode) ? renderValue.mode : 'style';
  const fallback = renderValue.fallback || {};
  const interaction = value.interaction || {};
  const stats = value.stats || {};
  const combat = value.combat || {};
  const collision = value.collision || {};

  return {
    ...clone(value),
    id,
    name: String(value.name || id),
    role,
    faction,
    behavior: {
      ...clone(behaviorValue),
      mode,
      speed: finite(behaviorValue.speed, mode === 'stationary' ? 0 : 1.2, 0, 10),
      radius: finite(behaviorValue.radius, mode === 'wander' ? 3 : 0, 0, 50),
      pauseSeconds: finite(behaviorValue.pauseSeconds, 1, 0, 30),
      patrol: (Array.isArray(behaviorValue.patrol) ? behaviorValue.patrol : []).map(normalizePoint).filter(Boolean),
    },
    interaction: {
      ...clone(interaction),
      dialogue: normalizeDialogue(interaction.dialogue ?? value.dialogue),
      shopId: safeNpcId(interaction.shopId),
      range: finite(interaction.range, 1.1, 0.1, 5),
    },
    stats: {
      ...clone(stats),
      maxHp: finite(stats.maxHp, 10, 1),
      attack: finite(stats.attack, 0, 0),
      defense: finite(stats.defense, 0, 0),
      agility: finite(stats.agility, 1, 0),
    },
    combat: {
      ...clone(combat),
      enabled: combat.enabled === true,
      weaponId: safeNpcId(combat.weaponId),
    },
    render: {
      ...clone(renderValue),
      mode: appearanceMode,
      textureId: safeNpcId(renderValue.textureId),
      imagePath: String(renderValue.imagePath || '').trim(),
      sprite: normalizeSprite(renderValue.sprite),
      fallback: {
        ...clone(fallback),
        shape: ['square', 'circle', 'diamond'].includes(fallback.shape) ? fallback.shape : 'circle',
        color: validColor(fallback.color),
        size: finite(fallback.size, 20, 4, 64),
      },
    },
    collision: {
      ...clone(collision),
      solid: collision.solid !== false,
      radius: finite(collision.radius, 0.42, 0.05, 2),
    },
    tags: Array.isArray(value.tags) ? value.tags.map((tag) => String(tag)).filter(Boolean) : [],
  };
}

export function buildNpcRegistry(npcs = []) {
  const registry = {};
  for (const value of npcs || []) {
    if (!value?.id) continue;
    const npc = normalizeNpcTemplate(value);
    registry[npc.id] = npc;
  }
  return registry;
}

export function normalizeNpcPlacement(value = {}, index = 0) {
  return {
    ...clone(value),
    id: safeNpcId(value.id, `npc_placement_${index + 1}`),
    type: 'npc',
    npcId: safeNpcId(value.npcId),
    x: finite(value.x, 0, 0),
    y: finite(value.y, 0, 0),
    active: value.active !== false,
  };
}

function resolveAssetPath(path, contentRootUrl) {
  const value = String(path || '').trim();
  if (!value || /^data:image\//i.test(value) || /^https?:\/\//i.test(value)) return value;
  try {
    return new URL(value, contentRootUrl).href;
  } catch {
    return value;
  }
}

function runtimeRender(template, texturesById, contentRootUrl) {
  const render = template.render || {};
  const fallback = { ...(render.fallback || {}) };
  let imagePath = '';
  if (render.mode === 'texture' && render.textureId) {
    const texture = texturesById?.[render.textureId];
    if (texture?.color) fallback.color = texture.color;
    imagePath = texture?.image || '';
  } else if (render.mode === 'image') {
    imagePath = render.imagePath;
  } else if (render.sprite?.imagePath) {
    imagePath = render.sprite.imagePath;
  }
  return {
    ...fallback,
    imagePath: resolveAssetPath(imagePath, contentRootUrl),
  };
}

export function instantiateNpcEntity(placementValue, npcsById = {}, options = {}) {
  const placement = normalizeNpcPlacement(placementValue);
  const template = npcsById[placement.npcId];
  if (!template) {
    return normalizeSceneEntity({
      ...placement,
      components: {
        render: { shape: 'diamond', color: '#ef4444', size: 18 },
        interaction: {
          action: 'npc',
          message: `Missing NPC template: ${placement.npcId || '(none)'}`,
          dialogue: [`Missing NPC template: ${placement.npcId || '(none)'}`],
          range: 1.1,
          npcId: placement.npcId,
        },
        collision: { solid: false, radius: 0.42 },
        npc: { missing: true, npcId: placement.npcId },
      },
    });
  }

  const npc = normalizeNpcTemplate(template);
  const dialogue = [...npc.interaction.dialogue];
  return normalizeSceneEntity({
    ...placement,
    components: {
      render: runtimeRender(npc, options.texturesById || {}, options.contentRootUrl),
      interaction: {
        action: 'npc',
        message: dialogue[0] || '',
        dialogue,
        shopId: npc.interaction.shopId,
        range: npc.interaction.range,
        npcId: npc.id,
      },
      collision: { ...npc.collision },
      npc: {
        npcId: npc.id,
        name: npc.name,
        role: npc.role,
        faction: npc.faction,
        behavior: clone(npc.behavior),
        stats: clone(npc.stats),
        combat: clone(npc.combat),
        sprite: clone(npc.render.sprite),
      },
    },
  });
}

export function instantiateSceneNpcs(entities = [], npcsById = {}, options = {}) {
  return (entities || []).map((entity, index) => {
    if (entity?.type !== 'npc' && !entity?.npcId) return entity;
    return instantiateNpcEntity(normalizeNpcPlacement(entity, index), npcsById, options);
  });
}

export function nextNpcDialogue(entity) {
  const lines = entity?.components?.interaction?.dialogue || [];
  if (!lines.length) return entity?.components?.interaction?.message || '';
  entity._npcRuntime ||= {};
  const index = Number.isInteger(entity._npcRuntime.dialogueIndex) ? entity._npcRuntime.dialogueIndex : 0;
  entity._npcRuntime.dialogueIndex = (index + 1) % lines.length;
  return lines[index];
}

function moveToward(entity, target, distance) {
  const dx = target.x - entity.x;
  const dy = target.y - entity.y;
  const length = Math.hypot(dx, dy);
  if (!length || length <= distance) return { x: target.x, y: target.y, reached: true };
  return { x: entity.x + (dx / length) * distance, y: entity.y + (dy / length) * distance, reached: false };
}

export function updateNpcEntities(entities = [], dt = 0, options = {}) {
  const canMoveTo = typeof options.canMoveTo === 'function' ? options.canMoveTo : () => true;
  for (const entity of entities || []) {
    const npc = entity?.components?.npc;
    const behavior = npc?.behavior;
    if (!entity?.active || !behavior || behavior.mode === 'stationary' || behavior.speed <= 0) continue;
    entity._npcRuntime ||= { originX: entity.x, originY: entity.y, wait: 0, patrolIndex: 0, target: null };
    const runtime = entity._npcRuntime;
    if (!Number.isFinite(runtime.originX)) runtime.originX = entity.x;
    if (!Number.isFinite(runtime.originY)) runtime.originY = entity.y;
    runtime.wait = Math.max(0, Number(runtime.wait) || 0);
    if (runtime.wait > 0) {
      runtime.wait = Math.max(0, runtime.wait - dt);
      continue;
    }

    let target = runtime.target;
    if (behavior.mode === 'patrol') {
      if (!behavior.patrol?.length) continue;
      runtime.patrolIndex = Math.max(0, Number(runtime.patrolIndex) || 0) % behavior.patrol.length;
      target = behavior.patrol[runtime.patrolIndex];
    } else if (behavior.mode === 'wander') {
      if (!target || Math.hypot(entity.x - target.x, entity.y - target.y) < 0.08) {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * behavior.radius;
        target = {
          x: runtime.originX + Math.cos(angle) * radius,
          y: runtime.originY + Math.sin(angle) * radius,
        };
        runtime.target = target;
      }
    }
    if (!target) continue;

    const step = moveToward(entity, target, behavior.speed * Math.max(0, Number(dt) || 0));
    if (canMoveTo(step.x, step.y, entity)) {
      entity.x = step.x;
      entity.y = step.y;
    } else {
      runtime.target = null;
      runtime.wait = behavior.pauseSeconds;
      continue;
    }
    if (step.reached) {
      runtime.wait = behavior.pauseSeconds;
      runtime.target = null;
      if (behavior.mode === 'patrol') runtime.patrolIndex = (runtime.patrolIndex + 1) % behavior.patrol.length;
    }
  }
  return entities;
}

export async function loadNpcPackageData(manifestUrl) {
  try {
    const manifestResponse = await fetch(manifestUrl, { cache: 'no-store' });
    if (!manifestResponse.ok) throw new Error(`manifest ${manifestResponse.status}`);
    const manifest = await manifestResponse.json();
    const contentRootUrl = new URL(manifest.contentRoot || './', manifestUrl);
    const npcPath = manifest.data?.npcs;
    if (!npcPath) return { npcs: [], npcsById: {}, texturesById: {}, contentRootUrl };
    const [npcResponse, textureResponse] = await Promise.all([
      fetch(new URL(npcPath, contentRootUrl), { cache: 'no-store' }),
      manifest.data?.texturePack
        ? fetch(new URL(manifest.data.texturePack, contentRootUrl), { cache: 'no-store' })
        : Promise.resolve(null),
    ]);
    if (!npcResponse.ok) throw new Error(`NPC data ${npcResponse.status}`);
    const payload = await npcResponse.json();
    const texturePayload = textureResponse?.ok ? await textureResponse.json() : { textures: [] };
    const npcs = (payload.npcs || []).map(normalizeNpcTemplate);
    return {
      npcs,
      npcsById: buildNpcRegistry(npcs),
      texturesById: Object.fromEntries((texturePayload.textures || []).filter((entry) => entry?.id).map((entry) => [entry.id, entry])),
      contentRootUrl,
    };
  } catch (error) {
    console.warn(`[NPC] ${error.message}`);
    return { npcs: [], npcsById: {}, texturesById: {}, contentRootUrl: new URL('./', manifestUrl) };
  }
}

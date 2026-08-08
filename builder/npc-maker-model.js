import { normalizeNpcPlacement, normalizeNpcTemplate, safeNpcId } from '../src/npcRuntime.js';

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

export function parsePatrolPoints(value) {
  if (Array.isArray(value)) return value
    .map((point) => ({ x: Number(point?.x), y: Number(point?.y) }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  return String(value || '')
    .split(/\r?\n|;/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(',').map((part) => Number(part.trim())))
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
    .map(([x, y]) => ({ x, y }));
}

export function formatPatrolPoints(points = []) {
  return parsePatrolPoints(points).map((point) => `${point.x}, ${point.y}`).join('\n');
}

export function normalizeNpcForMaker(value = {}) {
  return normalizeNpcTemplate({
    ...value,
    behavior: {
      ...(value.behavior || {}),
      patrol: parsePatrolPoints(value.behavior?.patrol),
    },
  });
}

export function validateNpcTemplate(value, context = {}) {
  const npc = normalizeNpcForMaker(value);
  const errors = [];
  if (!safeNpcId(value?.id)) errors.push('NPC ID is required.');
  if (!String(value?.name || '').trim()) errors.push('NPC name is required.');
  if (npc.behavior.mode === 'patrol' && !npc.behavior.patrol.length) {
    errors.push('Patrol behavior requires at least one X,Y patrol point.');
  }
  if (npc.role === 'shopkeeper' && !npc.interaction.shopId) {
    errors.push('Shopkeeper NPCs require a shop assignment.');
  }
  if (npc.interaction.shopId && Array.isArray(context.shopIds) && !context.shopIds.includes(npc.interaction.shopId)) {
    errors.push(`Shop “${npc.interaction.shopId}” is not available in this game.`);
  }
  if (npc.combat.weaponId && Array.isArray(context.weaponIds) && !context.weaponIds.includes(npc.combat.weaponId)) {
    errors.push(`Weapon “${npc.combat.weaponId}” is not available in this game.`);
  }
  return errors;
}

export function upsertNpcTemplate(list = [], value, previousId = '') {
  const npc = normalizeNpcForMaker(value);
  const next = clone(list || []);
  const prior = safeNpcId(previousId);
  if (prior && prior !== npc.id) {
    const priorIndex = next.findIndex((entry) => entry.id === prior);
    if (priorIndex >= 0) next.splice(priorIndex, 1);
  }
  const index = next.findIndex((entry) => entry.id === npc.id);
  if (index >= 0) next[index] = npc;
  else next.push(npc);
  return next.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export function removeNpcTemplate(list = [], npcId) {
  const id = safeNpcId(npcId);
  return (list || []).filter((entry) => entry.id !== id).map(clone);
}

export function npcPlacements(scene, npcId = '') {
  const id = safeNpcId(npcId);
  return (scene?.entities || [])
    .filter((entity) => entity?.type === 'npc' || entity?.npcId)
    .filter((entity) => !id || safeNpcId(entity.npcId) === id)
    .map((entry, index) => normalizeNpcPlacement(entry, index));
}

export function nextNpcPlacementId(scene, npcId) {
  const base = safeNpcId(npcId, 'npc');
  const existing = new Set((scene?.entities || []).map((entry) => safeNpcId(entry?.id)));
  let index = 1;
  while (existing.has(`${base}_${index}`)) index += 1;
  return `${base}_${index}`;
}

export function placeNpc(scene, npcId, x, y, placementId = '') {
  if (!scene || !Number.isInteger(Number(scene.width)) || !Number.isInteger(Number(scene.height))) {
    throw new Error('A valid destination map is required.');
  }
  const id = safeNpcId(npcId);
  if (!id) throw new Error('Choose an NPC template first.');
  const px = Math.floor(Number(x));
  const py = Math.floor(Number(y));
  if (!Number.isFinite(px) || !Number.isFinite(py) || px < 0 || py < 0 || px >= scene.width || py >= scene.height) {
    throw new Error('NPC placement must be inside the selected map.');
  }
  const entity = normalizeNpcPlacement({
    id: safeNpcId(placementId, nextNpcPlacementId(scene, id)),
    type: 'npc',
    npcId: id,
    x: px,
    y: py,
    active: true,
  });
  const entities = [...(scene.entities || [])];
  const index = entities.findIndex((entry) => entry.id === entity.id);
  if (index >= 0) entities[index] = entity;
  else entities.push(entity);
  return { ...scene, entities };
}

export function removeNpcPlacement(scene, placementId) {
  const id = safeNpcId(placementId);
  return {
    ...scene,
    entities: (scene?.entities || []).filter((entry) => safeNpcId(entry?.id) !== id).map(clone),
  };
}

export function renameNpcPlacements(scenes = [], previousId, nextId) {
  const prior = safeNpcId(previousId);
  const next = safeNpcId(nextId);
  if (!prior || !next || prior === next) return clone(scenes || []);
  return (scenes || []).map((scene) => ({
    ...scene,
    entities: (scene.entities || []).map((entity) => (
      (entity?.type === 'npc' || entity?.npcId) && safeNpcId(entity.npcId) === prior
        ? { ...entity, npcId: next }
        : clone(entity)
    )),
  }));
}

export function removeNpcPlacementsFromScenes(scenes = [], npcId) {
  const id = safeNpcId(npcId);
  return (scenes || []).map((scene) => ({
    ...scene,
    entities: (scene.entities || []).filter((entity) => !(
      (entity?.type === 'npc' || entity?.npcId) && safeNpcId(entity.npcId) === id
    )).map(clone),
  }));
}

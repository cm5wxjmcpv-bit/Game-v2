const TYPE_CONFIG = Object.freeze({
  portals: { label: 'Portals', singular: 'Portal', color: '#a855f7' },
  shops: { label: 'Shops', singular: 'Shop', color: '#22c55e' },
  fountains: { label: 'Fountains', singular: 'Fountain', color: '#06b6d4' },
  enemySpawns: { label: 'Enemy Spawns', singular: 'Enemy Spawn', color: '#ef4444' },
  battleTriggers: { label: 'Battle Triggers', singular: 'Battle Trigger', color: '#f97316' },
});

export const LEGACY_OBJECT_TYPES = Object.freeze(Object.keys(TYPE_CONFIG));

const CORE_KEYS = Object.freeze({
  portals: ['x', 'y', 'targetTown', 'targetScene', 'targetLevel', 'levels'],
  shops: ['x', 'y', 'shopId'],
  fountains: ['x', 'y'],
  enemySpawns: ['x', 'y', 'enemyId'],
  battleTriggers: ['x', 'y', 'width', 'height', 'encounterId', 'enemyId'],
});

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

function cleanString(value) {
  return String(value || '').trim();
}

function cleanStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map(cleanString).filter(Boolean);
}

function assignOptionalString(object, key, value) {
  const cleaned = cleanString(value);
  if (cleaned) object[key] = cleaned;
  else delete object[key];
}

export function legacyObjectConfig(type) {
  return TYPE_CONFIG[type] || null;
}

export function ensureLegacyObjectCollections(scene = {}) {
  const objects = { ...(scene.objects || {}) };
  for (const type of LEGACY_OBJECT_TYPES) objects[type] = Array.isArray(objects[type]) ? objects[type] : [];
  return { ...scene, objects };
}

export function normalizeLegacyObject(type, value = {}) {
  if (!TYPE_CONFIG[type]) throw new Error(`Unsupported legacy object type: ${type}`);
  const object = {
    ...value,
    x: finiteNumber(value.x, 0, 0),
    y: finiteNumber(value.y, 0, 0),
  };

  if (type === 'portals') {
    assignOptionalString(object, 'targetTown', value.targetTown);
    assignOptionalString(object, 'targetScene', value.targetScene);
    assignOptionalString(object, 'targetLevel', value.targetLevel);
    const levels = cleanStringArray(value.levels);
    if (levels.length) object.levels = levels;
    else delete object.levels;
  } else if (type === 'shops') {
    object.shopId = cleanString(value.shopId);
  } else if (type === 'enemySpawns') {
    object.enemyId = cleanString(value.enemyId);
  } else if (type === 'battleTriggers') {
    if (value.width !== undefined && value.width !== '') object.width = integer(value.width, 1, 1);
    else delete object.width;
    if (value.height !== undefined && value.height !== '') object.height = integer(value.height, 1, 1);
    else delete object.height;
    assignOptionalString(object, 'encounterId', value.encounterId);
    assignOptionalString(object, 'enemyId', value.enemyId);
  }

  return object;
}

export function legacyObjectExtras(type, value = {}) {
  const core = new Set(CORE_KEYS[type] || []);
  return Object.fromEntries(Object.entries(value).filter(([key]) => !core.has(key) && !key.startsWith('_workspace')));
}

export function validateLegacyObject(type, value, scene) {
  const errors = [];
  if (!TYPE_CONFIG[type]) return [`Unsupported legacy object type: ${type}`];
  const object = normalizeLegacyObject(type, value);
  const width = Number(scene?.width || 0);
  const height = Number(scene?.height || 0);
  if (object.x < 0 || object.y < 0 || object.x >= width || object.y >= height) {
    errors.push('Object coordinates must be inside the selected scene.');
  }

  if (type === 'portals') {
    const hasDestination = object.targetTown || object.targetScene || object.targetLevel || object.levels?.length;
    if (!hasDestination) errors.push('A portal requires a target town, scene, level, or level list.');
  }
  if (type === 'shops' && !object.shopId) errors.push('A shop requires a shop ID.');
  if (type === 'enemySpawns' && !object.enemyId) errors.push('An enemy spawn requires an enemy ID.');
  if (type === 'battleTriggers') {
    const extras = legacyObjectExtras(type, object);
    const hasBattleSource = object.encounterId || object.enemyId || cleanString(extras.encounterTable)
      || cleanStringArray(extras.enemies).length || cleanStringArray(extras.enemyIds).length;
    if (!hasBattleSource) errors.push('A battle trigger requires an encounter, enemy, encounter table, or enemy list.');
    const triggerWidth = object.width || 1;
    const triggerHeight = object.height || 1;
    if (object.x + triggerWidth > width || object.y + triggerHeight > height) {
      errors.push('The battle trigger area must remain inside the selected scene.');
    }
  }
  return errors;
}

export function applyLegacyObject(scene, type, index, value) {
  const nextScene = ensureLegacyObjectCollections(scene);
  const list = [...nextScene.objects[type]];
  const object = normalizeLegacyObject(type, value);
  if (Number.isInteger(index) && index >= 0 && index < list.length) list[index] = object;
  else list.push(object);
  return { ...nextScene, objects: { ...nextScene.objects, [type]: list } };
}

export function removeLegacyObject(scene, type, index) {
  const nextScene = ensureLegacyObjectCollections(scene);
  const list = nextScene.objects[type].filter((_, itemIndex) => itemIndex !== index);
  return { ...nextScene, objects: { ...nextScene.objects, [type]: list } };
}

export function legacyObjectLabel(type, value = {}, index = 0) {
  const object = normalizeLegacyObject(type, value);
  const prefix = `${TYPE_CONFIG[type]?.singular || 'Object'} ${index + 1}`;
  if (type === 'portals') return `${prefix}: ${object.targetTown || object.targetScene || object.targetLevel || object.levels?.join(', ') || 'unassigned'}`;
  if (type === 'shops') return `${prefix}: ${object.shopId || 'unassigned'}`;
  if (type === 'enemySpawns') return `${prefix}: ${object.enemyId || 'unassigned'}`;
  if (type === 'battleTriggers') return `${prefix}: ${object.encounterId || object.enemyId || 'unassigned'}`;
  return prefix;
}

export function legacyObjectMarkerColor(type) {
  return TYPE_CONFIG[type]?.color || '#f8fafc';
}

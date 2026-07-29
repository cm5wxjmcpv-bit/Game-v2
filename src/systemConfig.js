const DEFAULT_SYSTEMS = Object.freeze({
  movement: true,
  collision: true,
  inventory: true,
  equipment: true,
  shops: true,
  combat: 'realtime',
  randomEncounters: true,
  progression: true,
});

const BOOLEAN_SYSTEMS = new Set([
  'movement',
  'collision',
  'inventory',
  'equipment',
  'shops',
  'randomEncounters',
  'progression',
]);

function normalizeSystemValue(name, value, fallback) {
  if (name === 'combat') {
    if (value === false || value === 'none') return false;
    if (value === true) return 'realtime';
    if (typeof value === 'string' && value.trim()) return value.trim();
    return fallback;
  }

  if (BOOLEAN_SYSTEMS.has(name)) {
    return typeof value === 'boolean' ? value : fallback;
  }

  return value ?? fallback;
}

export function normalizeSystemConfig(rawSystems = {}) {
  const normalized = {};
  for (const [name, fallback] of Object.entries(DEFAULT_SYSTEMS)) {
    normalized[name] = normalizeSystemValue(name, rawSystems?.[name], fallback);
  }
  return normalized;
}

export function mergeSystemConfig(baseSystems = {}, overrides = {}) {
  const base = normalizeSystemConfig(baseSystems);
  const merged = { ...base };

  for (const [name, value] of Object.entries(overrides || {})) {
    if (!(name in DEFAULT_SYSTEMS)) continue;
    merged[name] = normalizeSystemValue(name, value, base[name]);
  }

  return merged;
}

export function isSystemEnabled(systems, name) {
  const value = systems?.[name];
  return value !== false && value !== 'none' && value !== null;
}

export function getDefaultSystemConfig() {
  return { ...DEFAULT_SYSTEMS };
}

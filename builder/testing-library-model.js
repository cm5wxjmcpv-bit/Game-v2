export const TESTING_LEVEL_LIBRARY_KEY = 'pixel_engine_testing_level_library_v1';
export const TESTING_LEVEL_PREVIEW_KEY = 'levelBuilderPreviewMap';
export const CUSTOM_TEXTURE_LIBRARY_KEY = 'levelBuilderCustomTextureLibrary';

const MAX_MAP_SIDE = 200;

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function safeId(value, fallback = 'testing_level') {
  const cleaned = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || fallback;
}

function normalizeLayer(layer, width, height, fallback) {
  if (!Array.isArray(layer) || layer.length !== height) {
    throw new Error('Map layer row count must match height.');
  }
  return layer.map((row) => {
    if (!Array.isArray(row) || row.length !== width) {
      throw new Error('Map layer column count must match width.');
    }
    return row.map((value) => typeof value === 'string' && value ? value : fallback);
  });
}

function normalizeMapType(source) {
  const type = String(source.mapType || source.type || '').toLowerCase();
  if (type === 'building') return 'building';
  if (type === 'town') return 'town';
  return 'level';
}

export function normalizeTestingMap(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Testing level must be a JSON object.');
  }

  const source = payload.map && typeof payload.map === 'object' ? payload.map : payload;
  const width = Number(source.width ?? source.gridSize);
  const height = Number(source.height ?? source.gridSize);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error('Testing level width and height must be positive integers.');
  }
  if (width > MAX_MAP_SIDE || height > MAX_MAP_SIDE) {
    throw new Error(`Testing level size cannot exceed ${MAX_MAP_SIDE} x ${MAX_MAP_SIDE}.`);
  }

  const tileSource = Array.isArray(source.tileLayer) ? source.tileLayer : source.tiles;
  const tileLayer = normalizeLayer(tileSource, width, height, 'empty');
  const objectLayer = Array.isArray(source.objectLayer)
    ? normalizeLayer(source.objectLayer, width, height, 'none')
    : Array.from({ length: height }, () => Array(width).fill('none'));

  return {
    width,
    height,
    mapType: normalizeMapType(source),
    mapId: safeId(source.mapId || source.id || 'testing_level'),
    mapName: String(source.mapName || source.name || 'Testing Level').trim() || 'Testing Level',
    tiles: clone(tileLayer),
    tileLayer,
    objectLayer,
  };
}

export function normalizeTestingLibrary(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.levels)) {
    return { version: 1, levels: [] };
  }

  const seen = new Set();
  const levels = [];
  for (const entry of payload.levels) {
    if (!entry || typeof entry !== 'object') continue;
    const libraryId = safeId(entry.libraryId, '');
    if (!libraryId || seen.has(libraryId)) continue;
    try {
      const map = normalizeTestingMap(entry.map);
      seen.add(libraryId);
      levels.push({
        libraryId,
        name: String(entry.name || map.mapName).trim() || map.mapName,
        map,
        textures: Array.isArray(entry.textures) ? clone(entry.textures) : [],
        createdAt: String(entry.createdAt || entry.updatedAt || new Date(0).toISOString()),
        updatedAt: String(entry.updatedAt || entry.createdAt || new Date(0).toISOString()),
      });
    } catch {
      // Corrupt individual levels are ignored instead of breaking the whole library.
    }
  }

  levels.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return { version: 1, levels };
}

export function createTestingLevelEntry({ map, textures = [], existing = null, now = new Date().toISOString() }) {
  const normalizedMap = normalizeTestingMap(map);
  const timestamp = Number.isFinite(Date.parse(now)) ? Date.parse(now).toString(36) : Date.now().toString(36);
  const libraryId = existing?.libraryId || `testing_${safeId(normalizedMap.mapId)}_${timestamp}`;
  return {
    libraryId,
    name: normalizedMap.mapName,
    map: normalizedMap,
    textures: Array.isArray(textures) ? clone(textures) : [],
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

export function upsertTestingLevel(library, entry) {
  const normalized = normalizeTestingLibrary(library);
  const nextEntry = createTestingLevelEntry({
    map: entry.map,
    textures: entry.textures,
    existing: entry,
    now: entry.updatedAt || new Date().toISOString(),
  });
  return normalizeTestingLibrary({
    version: 1,
    levels: [nextEntry, ...normalized.levels.filter((item) => item.libraryId !== nextEntry.libraryId)],
  });
}

export function deleteTestingLevel(library, libraryId) {
  const normalized = normalizeTestingLibrary(library);
  return {
    version: 1,
    levels: normalized.levels.filter((entry) => entry.libraryId !== libraryId),
  };
}

export function findTestingLevel(library, libraryId) {
  return normalizeTestingLibrary(library).levels.find((entry) => entry.libraryId === libraryId) || null;
}

export function collectUsedCustomTextures(map, textureLibrary) {
  const normalizedMap = normalizeTestingMap(map);
  const usedIds = new Set();
  for (const row of normalizedMap.tileLayer) {
    for (const tileId of row) {
      if (String(tileId).startsWith('custom_texture_')) usedIds.add(tileId);
    }
  }
  const textures = Array.isArray(textureLibrary?.textures) ? textureLibrary.textures : [];
  return textures.filter((texture) => usedIds.has(texture?.id)).map((texture) => clone(texture));
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function cleanId(value) {
  return String(value || '').trim();
}

function validHexColor(value) {
  const color = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : '';
}

export function colorForTileId(value) {
  let hash = 2166136261;
  for (const char of String(value || 'tile')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const r = 72 + ((hash >>> 16) & 0x7f);
  const g = 72 + ((hash >>> 8) & 0x7f);
  const b = 72 + (hash & 0x7f);
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

export function normalizePackageTiles(tilesPayload = {}, texturesPayload = {}) {
  const textures = Object.fromEntries((texturesPayload.textures || [])
    .filter((entry) => cleanId(entry?.id))
    .map((entry) => [cleanId(entry.id), entry]));
  const seen = new Set();
  const tiles = [];
  for (const raw of tilesPayload.tiles || []) {
    const id = cleanId(raw?.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const textureId = cleanId(raw.texture);
    const texture = textures[textureId] || {};
    tiles.push({
      id,
      name: String(raw.name || texture.name || id),
      walkable: raw.walkable !== false,
      textureId,
      color: validHexColor(texture.color) || validHexColor(raw.minimapColor) || colorForTileId(id),
    });
  }
  return tiles;
}

export function usedSceneTileIds(scene = {}) {
  const ids = new Set();
  for (const row of scene.tiles || []) {
    for (const tileId of row || []) {
      const id = cleanId(tileId);
      if (id) ids.add(id);
    }
  }
  return [...ids];
}

export function editorTileSelection(scene = {}, packageTiles = []) {
  const registered = new Set(packageTiles.map((tile) => tile.id));
  const used = usedSceneTileIds(scene);
  const selected = new Set(used);
  for (const tileId of scene._workspaceEditorTileIds || []) {
    const id = cleanId(tileId);
    if (registered.has(id)) selected.add(id);
  }
  return [...selected];
}

export function setEditorTileSelection(scene = {}, tileIds = [], packageTiles = []) {
  const next = clone(scene) || {};
  const registered = new Set(packageTiles.map((tile) => tile.id));
  const used = new Set(usedSceneTileIds(scene));
  const selected = new Set(used);
  for (const tileId of tileIds || []) {
    const id = cleanId(tileId);
    if (registered.has(id)) selected.add(id);
  }
  next._workspaceEditorTileIds = [...selected];
  return next;
}

export function packageTileRows(scene = {}, packageTiles = []) {
  const used = new Set(usedSceneTileIds(scene));
  const selected = new Set(editorTileSelection(scene, packageTiles));
  return packageTiles.map((tile) => ({
    ...tile,
    used: used.has(tile.id),
    enabled: selected.has(tile.id),
  }));
}

async function fetchJson(url, fetchImpl) {
  const response = await fetchImpl(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Unable to load ${url.pathname} (${response.status}).`);
  return response.json();
}

export async function fetchPackageTileLibrary(projectId, pageUrl, fetchImpl = fetch) {
  const safeProjectId = String(projectId || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '');
  if (!safeProjectId) throw new Error('A valid game project is required to load its tile library.');
  const manifestUrl = new URL(`../games/${safeProjectId}/game.json`, pageUrl);
  const manifest = await fetchJson(manifestUrl, fetchImpl);
  const contentRootUrl = new URL(manifest.contentRoot || './', manifestUrl);
  const tilesUrl = new URL(String(manifest.data?.tiles || ''), contentRootUrl);
  const texturesUrl = new URL(String(manifest.data?.texturePack || manifest.data?.tiles || ''), contentRootUrl);
  const cache = new Map();
  const load = async (url) => {
    const key = url.href;
    if (!cache.has(key)) cache.set(key, fetchJson(url, fetchImpl));
    return cache.get(key);
  };
  const [tilesPayload, texturesPayload] = await Promise.all([load(tilesUrl), load(texturesUrl)]);
  return normalizePackageTiles(tilesPayload, texturesPayload);
}

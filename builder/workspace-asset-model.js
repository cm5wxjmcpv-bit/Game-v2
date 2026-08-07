export const WORKSPACE_ASSET_SCHEMA_VERSION = 1;
export const WORKSPACE_ASSET_DRAFT_PREFIX = 'pixel_engine_builder_assets_';
export const CUSTOM_TEXTURE_PREFIX = 'custom_texture_';

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function safeId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function validColor(value, fallback = '#9ca3af') {
  const color = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : fallback;
}

function normalizePixel(pixel) {
  if (!pixel || typeof pixel !== 'object') return null;
  const color = validColor(pixel.color, '');
  if (!color) return null;
  const alpha = Number(pixel.alpha);
  return { color, alpha: Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1 };
}

function normalizePixels(value, size) {
  if (!Array.isArray(value) || value.length !== size) return null;
  const rows = [];
  for (const row of value) {
    if (!Array.isArray(row) || row.length !== size) return null;
    rows.push(row.map(normalizePixel));
  }
  return rows;
}

function safeStagedPath(value) {
  const path = String(value || '').trim().replace(/^\/+/, '');
  if (!path || !path.endsWith('.json') || path.includes('..') || path.startsWith('.github/') || path.includes('/.github/')) return '';
  return path;
}

export function isCustomTextureId(value) {
  return safeId(value).startsWith(CUSTOM_TEXTURE_PREFIX);
}

export function normalizeWorkspaceTextureAsset(value) {
  if (!value || typeof value !== 'object') return null;
  const id = safeId(value.id);
  const size = Number(value.size);
  if (!isCustomTextureId(id) || ![16, 32, 64].includes(size)) return null;
  const pixels = normalizePixels(value.pixels, size);
  if (!pixels) return null;
  const image = String(value.image || '');
  if (image && !/^data:image\/png;base64,/i.test(image)) return null;
  return {
    id,
    name: String(value.name || id),
    size,
    pixels,
    previewColor: validColor(value.previewColor),
    image,
    walkable: value.walkable !== false,
    updatedAt: String(value.updatedAt || new Date().toISOString()),
  };
}

export function normalizeWorkspaceStagedFile(value) {
  if (!value || typeof value !== 'object') return null;
  const path = safeStagedPath(value.path);
  if (!path || !value.baselinePayload || typeof value.baselinePayload !== 'object' || !value.currentPayload || typeof value.currentPayload !== 'object') return null;
  return {
    path,
    kind: String(value.kind || 'project registration'),
    baselinePayload: clone(value.baselinePayload),
    currentPayload: clone(value.currentPayload),
  };
}

export function emptyWorkspaceAssetDraft(projectId) {
  return {
    schemaVersion: WORKSPACE_ASSET_SCHEMA_VERSION,
    projectId: safeId(projectId),
    textures: [],
    files: [],
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeWorkspaceAssetDraft(value, projectId = value?.projectId) {
  const normalizedProjectId = safeId(projectId);
  const draft = emptyWorkspaceAssetDraft(normalizedProjectId);
  if (!value || typeof value !== 'object' || safeId(value.projectId) !== normalizedProjectId) return draft;
  const seen = new Set();
  for (const raw of value.textures || []) {
    const asset = normalizeWorkspaceTextureAsset(raw);
    if (!asset || seen.has(asset.id)) continue;
    seen.add(asset.id);
    draft.textures.push(asset);
  }
  const seenPaths = new Set();
  for (const raw of value.files || []) {
    const file = normalizeWorkspaceStagedFile(raw);
    if (!file || seenPaths.has(file.path)) continue;
    seenPaths.add(file.path);
    draft.files.push(file);
  }
  draft.updatedAt = String(value.updatedAt || draft.updatedAt);
  return draft;
}

export function assetDraftKey(projectId) {
  return `${WORKSPACE_ASSET_DRAFT_PREFIX}${safeId(projectId)}`;
}

export function readWorkspaceAssetDraft(projectId, storage = window.localStorage) {
  const key = assetDraftKey(projectId);
  try {
    const raw = storage.getItem(key);
    return normalizeWorkspaceAssetDraft(raw ? JSON.parse(raw) : null, projectId);
  } catch {
    return emptyWorkspaceAssetDraft(projectId);
  }
}

export function writeWorkspaceAssetDraft(projectId, draft, storage = window.localStorage) {
  const normalized = normalizeWorkspaceAssetDraft(draft, projectId);
  normalized.updatedAt = new Date().toISOString();
  storage.setItem(assetDraftKey(projectId), JSON.stringify(normalized));
  return normalized;
}

export function mergeWorkspaceAssetDraft(projectId, currentDraft, incomingTextures = [], incomingFiles = []) {
  const current = normalizeWorkspaceAssetDraft(currentDraft, projectId);
  const byId = new Map(current.textures.map((asset) => [asset.id, asset]));
  for (const raw of incomingTextures) {
    const asset = normalizeWorkspaceTextureAsset(raw);
    if (asset) byId.set(asset.id, asset);
  }
  const byPath = new Map(current.files.map((file) => [file.path, file]));
  for (const raw of incomingFiles) {
    const file = normalizeWorkspaceStagedFile(raw);
    if (file) byPath.set(file.path, file);
  }
  return {
    schemaVersion: WORKSPACE_ASSET_SCHEMA_VERSION,
    projectId: safeId(projectId),
    textures: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)),
    files: [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path)),
    updatedAt: new Date().toISOString(),
  };
}

export function packageTextureEntryFromAsset(rawAsset) {
  const asset = normalizeWorkspaceTextureAsset(rawAsset);
  if (!asset) throw new Error('A valid custom texture asset is required.');
  return {
    id: asset.id,
    name: asset.name,
    color: asset.previewColor,
    image: asset.image,
    builderSize: asset.size,
    builderPixels: clone(asset.pixels),
  };
}

export function packageTileEntryFromAsset(rawAsset) {
  const asset = normalizeWorkspaceTextureAsset(rawAsset);
  if (!asset) throw new Error('A valid custom texture asset is required.');
  return {
    id: asset.id,
    name: asset.name,
    walkable: asset.walkable,
    texture: asset.id,
    minimapColor: asset.previewColor,
  };
}

export function packageTileLibraryEntryFromAsset(rawAsset) {
  const asset = normalizeWorkspaceTextureAsset(rawAsset);
  if (!asset) throw new Error('A valid custom texture asset is required.');
  return {
    id: asset.id,
    name: asset.name,
    walkable: asset.walkable,
    textureId: asset.id,
    color: asset.previewColor,
    textureImage: asset.image,
    builderSize: asset.size,
    builderPixels: clone(asset.pixels),
  };
}

function upsertEntries(entries, additions) {
  const next = [...(entries || [])].map(clone);
  for (const addition of additions) {
    const index = next.findIndex((entry) => String(entry?.id || '') === addition.id);
    if (index >= 0) next[index] = { ...next[index], ...clone(addition) };
    else next.push(clone(addition));
  }
  return next;
}

export function buildWorkspaceAssetFileChanges({ assetDraft, tilesSource, texturesSource }) {
  const draft = normalizeWorkspaceAssetDraft(assetDraft, assetDraft?.projectId);
  const files = new Map();

  for (const staged of draft.files) {
    files.set(staged.path, {
      path: staged.path,
      baselinePayload: clone(staged.baselinePayload),
      currentPayload: clone(staged.currentPayload),
      kind: staged.kind,
    });
  }

  const ensureFile = (source) => {
    if (!files.has(source.path)) {
      files.set(source.path, {
        path: source.path,
        baselinePayload: clone(source.payload),
        currentPayload: clone(source.payload),
      });
    }
    return files.get(source.path);
  };

  if (draft.textures.length) {
    if (!tilesSource?.path || !tilesSource?.payload || !texturesSource?.path || !texturesSource?.payload) {
      throw new Error('The package tile and texture files are required to publish custom textures.');
    }

    const textureFile = ensureFile(texturesSource);
    textureFile.currentPayload.textures = upsertEntries(
      textureFile.currentPayload.textures,
      draft.textures.map(packageTextureEntryFromAsset),
    );

    const tileFile = ensureFile(tilesSource);
    tileFile.currentPayload.tiles = upsertEntries(
      tileFile.currentPayload.tiles,
      draft.textures.map(packageTileEntryFromAsset),
    );
  }

  return [...files.values()];
}

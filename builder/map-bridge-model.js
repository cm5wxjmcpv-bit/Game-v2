import { colorForTileId, editorTileSelection } from './package-tile-model.js';

export const MAP_BRIDGE_SCHEMA_VERSION = 1;
export const MAP_BRIDGE_HANDOFF_KEY = 'pixel_engine_builder_map_bridge_handoff_v1';
export const MAP_BRIDGE_RESULT_KEY = 'pixel_engine_builder_map_bridge_result_v1';
export const MAP_BRIDGE_NOTICE_KEY = 'pixel_engine_builder_map_bridge_notice_v1';
export const WORKSPACE_DRAFT_PREFIX = 'pixel_engine_builder_workspace_';
export const CUSTOM_TEXTURE_LIBRARY_KEY = 'levelBuilderCustomTextureLibrary';

const MAX_MAP_SIDE = 200;
const EDITOR_NATIVE_TILE_IDS = new Set([
  'floor_grass_a', 'floor_grass_b', 'floor_stone_a', 'floor_stone_b',
  'floor_dirt_a', 'floor_dirt_b', 'floor_sand_a', 'floor_wood_a',
  'floor_marble_a', 'floor_ice_a', 'wall_rock_a', 'wall_rock_b',
  'wall_brick_a', 'wall_brick_b', 'wall_wood_a', 'hazard_lava',
  'hazard_water', 'hazard_swamp', 'hazard_poison', 'special_portal_pad',
]);

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

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > MAX_MAP_SIDE) {
    throw new Error(`${label} must be an integer from 1 to ${MAX_MAP_SIDE}.`);
  }
  return number;
}

function validateTileGrid(tiles, width, height) {
  if (!Array.isArray(tiles) || tiles.length !== height) {
    throw new Error('Tile rows must match the map height.');
  }
  return tiles.map((row) => {
    if (!Array.isArray(row) || row.length !== width) {
      throw new Error('Every tile row must match the map width.');
    }
    return row.map((tileId) => String(tileId || ''));
  });
}

function isEditorNativeTile(tileId) {
  return EDITOR_NATIVE_TILE_IDS.has(tileId);
}

function aliasFor(index) {
  return `custom_texture_bridge_${index + 1}`;
}

function buildAliasData(tiles, scene, packageTiles = []) {
  const originalToAlias = new Map();
  const aliasToOriginal = {};
  const aliasColors = {};
  const tileById = new Map(packageTiles.map((tile) => [String(tile.id || ''), tile]));

  const editorIdFor = (tileId) => {
    if (isEditorNativeTile(tileId) || tileId === 'empty') return tileId;
    if (!originalToAlias.has(tileId)) {
      const alias = aliasFor(originalToAlias.size);
      const tile = tileById.get(tileId) || {};
      originalToAlias.set(tileId, alias);
      aliasToOriginal[alias] = tileId;
      aliasColors[alias] = tile.color || colorForTileId(tileId);
    }
    return originalToAlias.get(tileId);
  };

  const editorTiles = tiles.map((row) => row.map(editorIdFor));
  const allowedTileIds = ['empty'];
  for (const tileId of editorTileSelection(scene, packageTiles)) {
    const editorId = editorIdFor(tileId);
    if (!allowedTileIds.includes(editorId)) allowedTileIds.push(editorId);
  }
  for (const tileId of editorTiles.flat()) {
    if (!allowedTileIds.includes(tileId)) allowedTileIds.push(tileId);
  }

  return { editorTiles, aliasToOriginal, aliasColors, allowedTileIds };
}

function makeLayer(width, height, value) {
  return Array.from({ length: height }, () => Array(width).fill(value));
}

function normalizedSpawn(scene, width, height) {
  const x = Number(scene?.spawn?.x);
  const y = Number(scene?.spawn?.y);
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= width || y >= height) {
    throw new Error('The selected scene must have an integer spawn inside its map bounds.');
  }
  return { x, y };
}

export function createMapBridgeHandoff({ projectId, scene, sceneKind = 'scene', returnUrl, packageTiles = [] }) {
  const normalizedProjectId = safeId(projectId);
  if (!normalizedProjectId) throw new Error('A game project is required.');
  if (!scene || typeof scene !== 'object') throw new Error('A selected scene is required.');
  const sceneId = safeId(scene.id);
  if (!sceneId) throw new Error('The selected scene must have an ID.');
  const width = positiveInteger(scene.width, 'Scene width');
  const height = positiveInteger(scene.height, 'Scene height');
  const tiles = validateTileGrid(scene.tiles, width, height);
  const spawn = normalizedSpawn(scene, width, height);
  const aliases = buildAliasData(tiles, scene, packageTiles);
  const objectLayer = makeLayer(width, height, 'none');
  objectLayer[spawn.y][spawn.x] = 'player_start';
  const originalScene = clone(scene);
  originalScene._workspaceEditorTileIds = editorTileSelection(scene, packageTiles);

  return {
    schemaVersion: MAP_BRIDGE_SCHEMA_VERSION,
    projectId: normalizedProjectId,
    sceneId,
    sceneKind: sceneKind === 'town' ? 'town' : sceneKind === 'level' ? 'level' : 'scene',
    scenePath: String(scene._workspacePath || ''),
    returnUrl: String(returnUrl || ''),
    createdAt: new Date().toISOString(),
    originalScene,
    tileAliases: aliases.aliasToOriginal,
    aliasColors: aliases.aliasColors,
    allowedTileIds: aliases.allowedTileIds,
    editorMap: {
      width,
      height,
      mapType: sceneKind === 'town' ? 'town' : 'level',
      mapId: sceneId,
      mapName: String(scene.name || sceneId),
      tileLayer: aliases.editorTiles,
      objectLayer,
    },
  };
}

export function validateMapBridgeHandoff(value) {
  if (!value || typeof value !== 'object') throw new Error('No valid workspace map handoff was found.');
  if (value.schemaVersion !== MAP_BRIDGE_SCHEMA_VERSION) throw new Error('Unsupported workspace map handoff version.');
  if (!safeId(value.projectId) || !safeId(value.sceneId)) throw new Error('The workspace map handoff is missing its project or scene ID.');
  if (!value.originalScene || !value.editorMap) throw new Error('The workspace map handoff is incomplete.');
  if (safeId(value.originalScene.id) !== safeId(value.sceneId)) throw new Error('The handoff scene identity does not match its original scene.');
  const width = positiveInteger(value.editorMap.width, 'Editor map width');
  const height = positiveInteger(value.editorMap.height, 'Editor map height');
  validateTileGrid(value.editorMap.tileLayer || value.editorMap.tiles, width, height);
  if (value.allowedTileIds !== undefined && !Array.isArray(value.allowedTileIds)) throw new Error('The map handoff tile permission list is invalid.');
  return value;
}

export function buildBridgeTextureEntries(handoff) {
  validateMapBridgeHandoff(handoff);
  return Object.entries(handoff.aliasColors || {}).map(([id, color]) => ({
    id,
    name: `Workspace bridge: ${handoff.tileAliases?.[id] || id}`,
    size: 16,
    pixels: Array.from({ length: 16 }, () => Array.from({ length: 16 }, () => ({ color, alpha: 1 }))),
    previewColor: color,
    createdAt: handoff.createdAt,
    updatedAt: handoff.createdAt,
  }));
}

function decodeTiles(tiles, aliases) {
  return tiles.map((row) => row.map((tileId) => aliases?.[tileId] || tileId));
}

function findSpawn(objectLayer, width, height) {
  if (!Array.isArray(objectLayer) || objectLayer.length !== height) {
    throw new Error('The map editor result is missing its object layer.');
  }
  let spawn = null;
  for (let y = 0; y < height; y += 1) {
    const row = objectLayer[y];
    if (!Array.isArray(row) || row.length !== width) throw new Error('The map editor object layer has invalid dimensions.');
    for (let x = 0; x < width; x += 1) {
      if (row[x] !== 'player_start') continue;
      if (spawn) throw new Error('The map editor result contains more than one player spawn.');
      spawn = { x, y };
    }
  }
  if (!spawn) throw new Error('Place one Player Start marker before returning to the workspace.');
  return spawn;
}

function collectSpatialEntries(scene) {
  const entries = [];
  for (const entity of scene.entities || []) entries.push({ label: `entity ${entity.id || '(unnamed)'}`, value: entity });
  for (const [group, values] of Object.entries(scene.objects || {})) {
    if (!Array.isArray(values)) continue;
    values.forEach((value, index) => entries.push({ label: `${group}[${index}]`, value }));
  }
  return entries;
}

function validatePreservedCoordinates(scene, width, height) {
  const outside = collectSpatialEntries(scene).filter(({ value }) => {
    const x = Number(value?.x);
    const y = Number(value?.y);
    return Number.isFinite(x) && Number.isFinite(y) && (x < 0 || y < 0 || x >= width || y >= height);
  });
  if (outside.length) {
    throw new Error(`The resized map would place preserved content outside its bounds: ${outside.slice(0, 5).map((entry) => entry.label).join(', ')}${outside.length > 5 ? '…' : ''}. Enlarge the map or move/delete that content in the workspace first.`);
  }
}

export function mergeMapBridgeResult(handoffValue, rawMap) {
  const handoff = validateMapBridgeHandoff(handoffValue);
  if (!rawMap || typeof rawMap !== 'object') throw new Error('The map editor did not return a JSON object.');
  const width = positiveInteger(rawMap.width, 'Returned map width');
  const height = positiveInteger(rawMap.height, 'Returned map height');
  const returnedId = safeId(rawMap.mapId || rawMap.id);
  if (returnedId !== safeId(handoff.sceneId)) throw new Error('The returned map ID does not match the selected workspace scene.');
  const encodedTiles = validateTileGrid(rawMap.tileLayer || rawMap.tiles, width, height);
  const allowedTileIds = new Set(handoff.allowedTileIds || handoff.editorMap.tileLayer.flat());
  allowedTileIds.add('empty');
  const disallowed = encodedTiles.flat().find((tileId) => !allowedTileIds.has(tileId));
  if (disallowed) throw new Error(`The returned map contains a tile that was not enabled for this scene: ${disallowed}.`);
  const spawn = findSpawn(rawMap.objectLayer, width, height);
  const original = clone(handoff.originalScene);
  validatePreservedCoordinates(original, width, height);
  original.id = handoff.sceneId;
  original.name = String(rawMap.mapName || rawMap.name || original.name || handoff.sceneId);
  original.width = width;
  original.height = height;
  original.tiles = decodeTiles(encodedTiles, handoff.tileAliases || {});
  original.spawn = spawn;
  return original;
}

export function applyMapBridgeResultToDraft(draftValue, resultValue) {
  if (!draftValue || typeof draftValue !== 'object' || !Array.isArray(draftValue.scenes)) {
    throw new Error('The workspace draft is missing or invalid.');
  }
  if (!resultValue || resultValue.schemaVersion !== MAP_BRIDGE_SCHEMA_VERSION) throw new Error('The returned map result is invalid.');
  if (safeId(draftValue.projectId) !== safeId(resultValue.projectId)) throw new Error('The returned map belongs to a different project.');
  const index = draftValue.scenes.findIndex((scene) => safeId(scene.id) === safeId(resultValue.sceneId));
  if (index < 0) throw new Error('The returned scene was not found in the workspace draft.');
  const next = clone(draftValue);
  next.scenes[index] = clone(resultValue.scene);
  next.savedAt = new Date().toISOString();
  return next;
}

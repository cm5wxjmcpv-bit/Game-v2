import { normalizeTestingMap } from './testing-library-model.js';
import { normalizeWorkspaceTextureAsset } from './workspace-asset-model.js';

export const TESTING_ADD_TO_GAME_SCHEMA_VERSION = 1;
export const TESTING_ADD_TO_GAME_PENDING_KEY = 'pixel_engine_testing_add_to_game_pending_v1';

const PORTAL_OBJECT_IDS = new Set([
  'portal_level', 'portal_town', 'portal_world', 'return_portal',
  'boss_exit', 'locked_portal', 'town_portal', 'exit_marker',
]);
const SHOP_OBJECT_IDS = new Set(['blacksmith', 'armor_shop', 'potion_shop', 'general_shop', 'special_shop']);
const ENEMY_OBJECT_IDS = new Set([
  'enemy_spawn_basic', 'enemy_spawn_ranged', 'enemy_spawn_tank', 'enemy_spawn_swarm',
  'enemy_spawn_runner', 'enemy_spawn_elite', 'enemy_spawn_boss', 'ambush_spawn',
]);

const TILE_ID_TO_ENGINE_ID = Object.freeze({
  empty: 'floor_grass_a',
  floor_stone: 'floor_stone_a',
  floor_wood: 'floor_wood_a',
  floor_grass: 'floor_grass_a',
  floor_sand: 'floor_sand_a',
  floor_dirt: 'floor_dirt_a',
  floor_cobble: 'floor_stone_b',
  floor_tile: 'floor_stone_b',
  floor_moss: 'floor_grass_b',
  floor_snow: 'floor_ice_a',
  floor_ash: 'floor_dirt_b',
  floor_crystal: 'floor_marble_a',
  floor_darkstone: 'floor_stone_b',
  floor_marble: 'floor_marble_a',
  floor_ruins: 'floor_stone_b',
  floor_planks: 'floor_wood_a',
  wall_stone: 'wall_rock_a',
  wall_wood: 'wall_wood_a',
  wall_brick: 'wall_brick_a',
  wall_metal: 'wall_brick_b',
  wall_ruin: 'wall_rock_b',
  cliff: 'wall_rock_a',
  tree_block: 'wall_rock_b',
  rock_block: 'wall_rock_a',
  fence: 'wall_wood_a',
  gate_closed: 'wall_wood_a',
  gate_open: 'floor_wood_a',
  breakable_wall: 'wall_brick_a',
  secret_wall: 'wall_rock_b',
  cave_wall: 'wall_rock_a',
  castle_wall: 'wall_brick_b',
  lava: 'hazard_lava',
  water: 'hazard_water',
  swamp: 'hazard_swamp',
  poison: 'hazard_poison',
  acid: 'hazard_poison',
  spikes: 'floor_stone_a',
  fire_trap: 'floor_stone_a',
  ice: 'floor_ice_a',
  mud: 'floor_dirt_b',
  quicksand: 'floor_sand_a',
  cursed_ground: 'hazard_poison',
  electric_floor: 'floor_stone_b',
  thorn_patch: 'floor_grass_b',
  healing_pool: 'hazard_water',
  slow_field: 'hazard_swamp',
  bridge: 'special_portal_pad',
  stairs_up: 'floor_stone_b',
  stairs_down: 'floor_stone_b',
  ladder: 'floor_wood_a',
  jump_pad: 'special_portal_pad',
  narrow_path: 'floor_dirt_a',
  doorway: 'floor_stone_a',
  tunnel_entry: 'floor_stone_b',
  tunnel_exit: 'floor_stone_b',
  one_way_gate: 'wall_wood_a',
});

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function safeId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function sceneKindForMap(map) {
  if (map.mapType === 'building') return 'building';
  return map.mapType === 'town' ? 'town' : 'level';
}

function directoryForKind(manifest, kind) {
  const data = manifest?.data || {};
  if (kind === 'town') return String(data.townsDirectory || '').replace(/\/$/, '');
  if (kind === 'level') return String(data.levelsDirectory || '').replace(/\/$/, '');
  if (kind === 'building') return String(data.buildingsDirectory || '').replace(/\/$/, '');
  return String(data.scenesDirectory || '').replace(/\/$/, '');
}

function engineTileId(tileId) {
  const id = String(tileId || 'empty');
  if (id.startsWith('custom_texture_')) return id;
  if (Object.hasOwn(TILE_ID_TO_ENGINE_ID, id)) return TILE_ID_TO_ENGINE_ID[id];
  return id;
}

function findPlayerSpawn(map) {
  const found = [];
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      if (map.objectLayer[y][x] === 'player_start') found.push({ x, y });
    }
  }
  if (found.length !== 1) {
    throw new Error(`Add to Game requires exactly one Player Start marker; this map has ${found.length}.`);
  }
  return found[0];
}

function mapShopObjectToEngineShopId(objectId) {
  if (objectId === 'blacksmith' || objectId === 'armor_shop') return 'shop_blacksmith_t1';
  if (objectId === 'special_shop') return 'shop_rare_t2';
  return 'shop_potion_t1';
}

function mapEnemyObjectToEngineEnemyId(objectId) {
  if (objectId === 'enemy_spawn_tank' || objectId === 'enemy_spawn_boss') return 'guardian_golem';
  if (objectId === 'enemy_spawn_ranged' || objectId === 'enemy_spawn_runner' || objectId === 'enemy_spawn_elite') return 'wolf_runner';
  return 'slime_green';
}

function collectObjects(map) {
  const grouped = {
    portals: [],
    shops: [],
    fountains: [],
    enemySpawns: [],
    battleTriggers: [],
  };
  const unsupported = new Set();

  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const objectId = map.objectLayer[y][x];
      if (!objectId || objectId === 'none' || objectId === 'player_start') continue;
      if (PORTAL_OBJECT_IDS.has(objectId)) {
        grouped.portals.push({ x, y, levels: [] });
      } else if (SHOP_OBJECT_IDS.has(objectId)) {
        grouped.shops.push({ x, y, shopId: mapShopObjectToEngineShopId(objectId) });
      } else if (objectId === 'fountain') {
        grouped.fountains.push({ x, y });
      } else if (ENEMY_OBJECT_IDS.has(objectId)) {
        grouped.enemySpawns.push({ x, y, enemyId: mapEnemyObjectToEngineEnemyId(objectId) });
      } else {
        unsupported.add(objectId);
      }
    }
  }

  return { grouped, unsupported: [...unsupported].sort() };
}

export function createTestingAddToGameRequest({ entry, projectId, now = new Date().toISOString() }) {
  if (!entry || typeof entry !== 'object') throw new Error('Choose a saved Testing Space level first.');
  const normalizedProjectId = safeId(projectId);
  if (!normalizedProjectId) throw new Error('Choose a game project first.');
  const map = normalizeTestingMap(entry.map);
  const textures = [];
  const seen = new Set();
  for (const raw of entry.textures || []) {
    const texture = normalizeWorkspaceTextureAsset(raw);
    if (!texture || seen.has(texture.id)) continue;
    seen.add(texture.id);
    textures.push(texture);
  }
  return {
    schemaVersion: TESTING_ADD_TO_GAME_SCHEMA_VERSION,
    projectId: normalizedProjectId,
    libraryId: safeId(entry.libraryId),
    sourceUpdatedAt: String(entry.updatedAt || ''),
    map,
    textures,
    createdAt: now,
  };
}

export function validateTestingAddToGameRequest(value) {
  if (!value || value.schemaVersion !== TESTING_ADD_TO_GAME_SCHEMA_VERSION) {
    throw new Error('The Testing Space game-copy request is missing or unsupported.');
  }
  if (!safeId(value.projectId) || !safeId(value.libraryId)) {
    throw new Error('The Testing Space game-copy request is missing its project or level identity.');
  }
  normalizeTestingMap(value.map);
  if (!Array.isArray(value.textures)) throw new Error('The Testing Space game-copy texture list is invalid.');
  return value;
}

export function buildTestingScene(mapValue) {
  const map = normalizeTestingMap(mapValue);
  const spawn = findPlayerSpawn(map);
  const { grouped, unsupported } = collectObjects(map);
  const tiles = map.tileLayer.map((row) => row.map(engineTileId));
  const requiredCustomTextureIds = [...new Set(tiles.flat().filter((id) => id.startsWith('custom_texture_')))].sort();
  const warnings = [];
  if (unsupported.length) {
    warnings.push(`Unsupported Testing Space marker(s) were left out of the game copy: ${unsupported.join(', ')}.`);
  }
  return {
    scene: {
      id: map.mapId,
      name: map.mapName,
      width: map.width,
      height: map.height,
      mapType: sceneKindForMap(map),
      tiles,
      objects: grouped,
      entities: [],
      spawn,
    },
    requiredCustomTextureIds,
    warnings,
  };
}

export function prepareTestingLevelForWorkspace({ request: rawRequest, workspaceState }) {
  const request = validateTestingAddToGameRequest(rawRequest);
  if (!workspaceState || typeof workspaceState !== 'object') throw new Error('The selected game workspace is unavailable.');
  const projectId = safeId(workspaceState.projectId);
  if (projectId !== safeId(request.projectId)) throw new Error('The Testing Space level was assigned to a different game project.');
  if (!workspaceState.manifest || typeof workspaceState.manifest !== 'object') throw new Error('The selected game manifest is unavailable.');

  const built = buildTestingScene(request.map);
  const sceneId = built.scene.id;
  if ((workspaceState.scenes || []).some((scene) => safeId(scene?.id) === sceneId)) {
    throw new Error(`Scene ID “${sceneId}” already exists in ${projectId}. Rename the Testing Space level before adding it; existing game scenes are never overwritten.`);
  }
  const kind = built.scene.mapType;
  const directory = directoryForKind(workspaceState.manifest, kind);
  if (!directory) throw new Error(`${projectId} does not define a ${kind} directory in its game manifest.`);
  if (directory.includes('..') || directory.startsWith('/')) throw new Error('The game manifest has an unsafe scene directory.');
  const scenePath = `${directory}/${sceneId}.json`;

  const texturesById = new Map(request.textures.map((texture) => [texture.id, texture]));
  const missingTextures = built.requiredCustomTextureIds.filter((id) => !texturesById.has(id));

  return {
    scene: {
      ...built.scene,
      _workspaceKind: kind,
      _workspacePath: scenePath,
      _workspaceEditorTileIds: [...new Set(built.scene.tiles.flat())],
    },
    sceneKind: kind,
    scenePath,
    textures: request.textures.map(clone),
    requiredCustomTextureIds: built.requiredCustomTextureIds,
    missingTextures,
    warnings: built.warnings,
  };
}

export function registerTestingSceneInWorld(worldValue, scene) {
  if (!worldValue || typeof worldValue !== 'object') throw new Error('The game world index is unavailable.');
  if (!scene || typeof scene !== 'object') throw new Error('The new game scene is unavailable.');
  const world = clone(worldValue);
  const kind = scene.mapType === 'building' ? 'building' : scene.mapType === 'town' ? 'town' : 'level';
  const listName = kind === 'building' ? 'buildings' : kind === 'town' ? 'towns' : 'levels';
  const id = safeId(scene.id);
  if (!id) throw new Error('The new game scene has no valid ID.');
  world[listName] = Array.isArray(world[listName]) ? [...world[listName]] : [];
  if (!world[listName].includes(id)) world[listName].push(id);
  return world;
}

import { loadActiveGamePackage, resolveGamePath } from './gameManifest.js';

const DEFAULT_DATA_PATHS = Object.freeze({
  tiles: 'data/tiles/tiles.json',
  tileEffects: 'data/tiles/effects.json',
  texturePack: 'data/texturepacks/default-pack.json',
  world: 'data/world/world.json',
  classes: 'data/classes/classes.json',
  items: 'data/items/items.json',
  enemies: 'data/enemies/enemies.json',
  shops: 'data/shops/shops.json',
  progression: 'data/world/progression.json',
  encounters: 'data/encounters/encounters.json',
  encounterTables: 'data/encounters/tables.json',
  townsDirectory: 'data/towns',
  levelsDirectory: 'data/levels',
});

async function loadJSON(path, fallback = null) {
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Failed to load ${path} (${res.status})`);
    return await res.json();
  } catch (error) {
    console.warn(`[DataLoader] ${error.message}`);
    if (fallback !== null) return fallback;
    throw error;
  }
}

function mapById(list, label) {
  const entries = (list || []).filter((entry) => entry?.id);
  if (entries.length !== (list || []).length) {
    console.warn(`[DataLoader] Some ${label} entries are missing an id.`);
  }
  return Object.fromEntries(entries.map((entry) => [entry.id, entry]));
}

function withWorldDefaults(world, manifest) {
  const start = world.start || {};
  const manifestStartTown = manifest.startScene?.type === 'town'
    ? manifest.startScene.id
    : null;
  const firstTown = world.towns?.[0] || null;
  const startTown = world.startTown || start.townId || manifestStartTown || firstTown;

  return {
    ...world,
    towns: world.towns || [],
    levels: world.levels || [],
    startTown,
    start: {
      townId: startTown,
      unlockedTowns: start.unlockedTowns || [startTown].filter(Boolean),
      unlockedLevels: start.unlockedLevels || [world.levels?.[0]].filter(Boolean),
      gold: start.gold ?? 100,
    },
  };
}

function validateAndNormalizeMap(map, expectedId, kind = 'map') {
  if (!map || typeof map !== 'object') {
    console.warn(`[DataLoader] Invalid ${kind} file for "${expectedId}"`);
    return null;
  }

  if (!map.id) {
    console.warn(`[DataLoader] ${kind} file "${expectedId}" is missing id`);
    return null;
  }

  if (map.id !== expectedId) {
    console.warn(`[DataLoader] ${kind} id mismatch: expected "${expectedId}" but found "${map.id}"`);
  }

  if (!Number.isInteger(map.width) || map.width <= 0) {
    console.warn(`[DataLoader] ${kind} "${map.id}" has invalid width`, map.width);
  }

  if (!Number.isInteger(map.height) || map.height <= 0) {
    console.warn(`[DataLoader] ${kind} "${map.id}" has invalid height`, map.height);
  }

  if (!Array.isArray(map.tiles)) {
    console.warn(`[DataLoader] ${kind} "${map.id}" is missing tiles array`);
  } else {
    if (typeof map.height === 'number' && map.tiles.length !== map.height) {
      console.warn(
        `[DataLoader] ${kind} "${map.id}" tile row count (${map.tiles.length}) does not match height (${map.height})`
      );
    }

    for (let row = 0; row < map.tiles.length; row++) {
      if (!Array.isArray(map.tiles[row])) {
        console.warn(`[DataLoader] ${kind} "${map.id}" row ${row} is not an array`);
        continue;
      }

      if (typeof map.width === 'number' && map.tiles[row].length !== map.width) {
        console.warn(
          `[DataLoader] ${kind} "${map.id}" row ${row} length (${map.tiles[row].length}) does not match width (${map.width})`
        );
      }
    }
  }

  if (!map.objects || typeof map.objects !== 'object') {
    map.objects = {};
  }

  if (!Array.isArray(map.objects.portals)) map.objects.portals = [];
  if (!Array.isArray(map.objects.shops)) map.objects.shops = [];
  if (!Array.isArray(map.objects.fountains)) map.objects.fountains = [];
  if (!Array.isArray(map.objects.enemySpawns)) map.objects.enemySpawns = [];
  if (!Array.isArray(map.objects.battleTriggers)) map.objects.battleTriggers = [];

  map.objects.battleTriggers = map.objects.battleTriggers
    .filter((trigger) => trigger && typeof trigger === 'object' && trigger.id && trigger.encounterId)
    .map((trigger) => ({
      ...trigger,
      width: Number.isFinite(trigger.width) && trigger.width > 0 ? trigger.width : 1,
      height: Number.isFinite(trigger.height) && trigger.height > 0 ? trigger.height : 1,
      once: trigger.once !== false,
    }));

  if (!map.randomEncounters || typeof map.randomEncounters !== 'object') {
    map.randomEncounters = { enabled: false, minSeconds: 10, maxSeconds: 60, tableId: null };
  } else {
    map.randomEncounters = {
      enabled: Boolean(map.randomEncounters.enabled),
      minSeconds: Number.isFinite(map.randomEncounters.minSeconds) ? map.randomEncounters.minSeconds : 10,
      maxSeconds: Number.isFinite(map.randomEncounters.maxSeconds) ? map.randomEncounters.maxSeconds : 60,
      tableId: typeof map.randomEncounters.tableId === 'string' ? map.randomEncounters.tableId : null,
    };
  }

  if (
    !map.spawn ||
    typeof map.spawn !== 'object' ||
    typeof map.spawn.x !== 'number' ||
    typeof map.spawn.y !== 'number'
  ) {
    console.warn(`[DataLoader] ${kind} "${map.id}" has invalid or missing spawn; defaulting to 1,1`);
    map.spawn = { x: 1, y: 1 };
  }

  return map;
}

function getDataPaths(manifest) {
  return {
    ...DEFAULT_DATA_PATHS,
    ...(manifest.data || {}),
  };
}

function fileInside(directory, id) {
  return `${String(directory).replace(/\/$/, '')}/${id}.json`;
}

export async function loadDatabase() {
  const gamePackage = await loadActiveGamePackage();
  const paths = getDataPaths(gamePackage.manifest);
  const gamePath = (path) => resolveGamePath(gamePackage, path);

  const [tiles, tileEffects, texturePack, rawWorld, classes, items, enemies, shops, progression, encounters, encounterTables] = await Promise.all([
    loadJSON(gamePath(paths.tiles), { tiles: [] }),
    loadJSON(gamePath(paths.tileEffects), { effects: [] }),
    loadJSON(gamePath(paths.texturePack), { textures: [] }),
    loadJSON(gamePath(paths.world), {}),
    loadJSON(gamePath(paths.classes), { classes: [] }),
    loadJSON(gamePath(paths.items), { items: [] }),
    loadJSON(gamePath(paths.enemies), { enemies: [] }),
    loadJSON(gamePath(paths.shops), { shops: [] }),
    loadJSON(gamePath(paths.progression), { unlocks: {} }),
    loadJSON(gamePath(paths.encounters), { encounters: [] }),
    loadJSON(gamePath(paths.encounterTables), { tables: [] }),
  ]);

  const world = withWorldDefaults(rawWorld, gamePackage.manifest);
  const townMaps = (
    await Promise.all(
      world.towns.map(async (id) =>
        validateAndNormalizeMap(
          await loadJSON(gamePath(fileInside(paths.townsDirectory, id))),
          id,
          'town'
        )
      )
    )
  ).filter(Boolean);
  const levelMaps = (
    await Promise.all(
      world.levels.map(async (id) =>
        validateAndNormalizeMap(
          await loadJSON(gamePath(fileInside(paths.levelsDirectory, id))),
          id,
          'level'
        )
      )
    )
  ).filter(Boolean);

  return {
    game: {
      id: gamePackage.manifest.id,
      name: gamePackage.manifest.name,
      version: gamePackage.manifest.version,
      engineVersion: gamePackage.manifest.engineVersion,
      systems: gamePackage.manifest.systems,
      manifestUrl: gamePackage.manifestUrl,
    },
    tileDefs: mapById(tiles.tiles, 'tile'),
    tileEffects: mapById(tileEffects.effects, 'tile effect'),
    texturePack: mapById(texturePack.textures, 'texture'),
    classesById: mapById(classes.classes, 'class'),
    classes: classes.classes || [],
    itemsById: mapById(items.items, 'item'),
    enemiesById: mapById(enemies.enemies, 'enemy'),
    shopsById: mapById(shops.shops, 'shop'),
    encountersById: mapById(encounters.encounters, 'encounter'),
    encounterTablesById: mapById(encounterTables.tables, 'encounter table'),
    townsById: Object.fromEntries(townMaps.filter((m) => m?.id).map((m) => [m.id, m])),
    levelsById: Object.fromEntries(levelMaps.filter((m) => m?.id).map((m) => [m.id, m])),
    progression,
    world,
  };
}

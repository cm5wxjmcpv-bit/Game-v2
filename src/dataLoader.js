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

function withWorldDefaults(world) {
  const start = world.start || {};
  return {
    ...world,
    towns: world.towns || [],
    levels: world.levels || [],
    startTown: world.startTown || start.townId || world.towns?.[0] || null,
    start: {
      townId: start.townId || world.startTown || world.towns?.[0] || null,
      unlockedTowns: start.unlockedTowns || [world.startTown || world.towns?.[0]].filter(Boolean),
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

export async function loadDatabase() {
  const [tiles, tileEffects, texturePack, rawWorld, classes, items, enemies, shops, progression, encounters, encounterTables] = await Promise.all([
    loadJSON('./data/tiles/tiles.json', { tiles: [] }),
    loadJSON('./data/tiles/effects.json', { effects: [] }),
    loadJSON('./data/texturepacks/default-pack.json', { textures: [] }),
    loadJSON('./data/world/world.json', {}),
    loadJSON('./data/classes/classes.json', { classes: [] }),
    loadJSON('./data/items/items.json', { items: [] }),
    loadJSON('./data/enemies/enemies.json', { enemies: [] }),
    loadJSON('./data/shops/shops.json', { shops: [] }),
    loadJSON('./data/world/progression.json', { unlocks: {} }),
    loadJSON('./data/encounters/encounters.json', { encounters: [] }),
    loadJSON('./data/encounters/tables.json', { tables: [] }),
  ]);

  const world = withWorldDefaults(rawWorld);
  const townMaps = (
    await Promise.all(
      world.towns.map(async (id) =>
        validateAndNormalizeMap(await loadJSON(`./data/towns/${id}.json`), id, 'town')
      )
    )
  ).filter(Boolean);
  const levelMaps = (
    await Promise.all(
      world.levels.map(async (id) =>
        validateAndNormalizeMap(await loadJSON(`./data/levels/${id}.json`), id, 'level')
      )
    )
  ).filter(Boolean);

  return {
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

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const warnings = [];
const ignoredAuditDirectories = new Set(['.git', 'node_modules', 'test-results', 'playwright-report', 'blob-report']);

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function readJson(file, label = path.relative(repoRoot, file)) {
  if (!existsSync(file)) {
    fail(`${label}: file does not exist`);
    return {};
  }
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`${label}: invalid JSON (${error.message})`);
    return {};
  }
}

function walk(directory, predicate = () => true) {
  if (!existsSync(directory)) return [];
  const output = [];
  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) {
      if (!ignoredAuditDirectories.has(entry)) output.push(...walk(full, predicate));
    }
    else if (predicate(full)) output.push(full);
  }
  return output;
}

function assertUniqueIds(entries, label) {
  const seen = new Set();
  for (const entry of entries) {
    if (!entry || typeof entry.id !== 'string' || !entry.id.trim()) {
      fail(`${label}: entry is missing a non-empty id`);
      continue;
    }
    if (seen.has(entry.id)) fail(`${label}: duplicate id "${entry.id}"`);
    seen.add(entry.id);
  }
  return seen;
}

function list(payload, key) {
  const value = payload?.[key];
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    fail(`${key}: expected an array`);
    return [];
  }
  return value;
}

function resolveContentFile(manifestFile, manifest, relativePath) {
  const contentRoot = path.resolve(path.dirname(manifestFile), String(manifest.contentRoot || './'));
  return path.resolve(contentRoot, String(relativePath || ''));
}

function validateAsset(assetPath, label) {
  if (!assetPath) return;
  if (/^(https?:|data:|blob:)/i.test(assetPath)) return;
  const full = path.resolve(repoRoot, assetPath);
  if (!existsSync(full)) fail(`${label}: missing asset ${assetPath}`);
}

function validateMap(map, kind, file, context) {
  const label = `${context.gameId}:${kind}:${path.basename(file)}`;
  if (!map || typeof map !== 'object') {
    fail(`${label}: map is not an object`);
    return;
  }
  if (!map.id) fail(`${label}: missing id`);
  if (!Number.isInteger(map.width) || map.width <= 0) fail(`${label}: invalid width`);
  if (!Number.isInteger(map.height) || map.height <= 0) fail(`${label}: invalid height`);
  if (!Array.isArray(map.tiles)) {
    fail(`${label}: missing tiles array`);
  } else {
    if (map.tiles.length !== map.height) fail(`${label}: tile row count does not match height`);
    map.tiles.forEach((row, y) => {
      if (!Array.isArray(row)) {
        fail(`${label}: row ${y} is not an array`);
        return;
      }
      if (row.length !== map.width) fail(`${label}: row ${y} width does not match map width`);
      row.forEach((tileId, x) => {
        if (!context.tileIds.has(tileId)) fail(`${label}: unknown tile "${tileId}" at ${x},${y}`);
      });
    });
  }

  if (!map.spawn || !Number.isFinite(map.spawn.x) || !Number.isFinite(map.spawn.y)) {
    fail(`${label}: invalid spawn`);
  } else if (map.spawn.x < 0 || map.spawn.y < 0 || map.spawn.x >= map.width || map.spawn.y >= map.height) {
    fail(`${label}: spawn is outside the map`);
  }

  const objects = map.objects || {};
  const portals = Array.isArray(objects.portals) ? objects.portals : [];
  const shops = Array.isArray(objects.shops) ? objects.shops : [];
  const fountains = Array.isArray(objects.fountains) ? objects.fountains : [];
  const enemySpawns = Array.isArray(objects.enemySpawns) ? objects.enemySpawns : [];
  const battleTriggers = Array.isArray(objects.battleTriggers) ? objects.battleTriggers : [];

  for (const [objectKind, entries] of Object.entries({ portals, shops, fountains, enemySpawns, battleTriggers })) {
    entries.forEach((entry, index) => {
      if (!Number.isFinite(entry?.x) || !Number.isFinite(entry?.y)) {
        fail(`${label}: ${objectKind}[${index}] has invalid coordinates`);
      }
    });
  }

  portals.forEach((portal, index) => {
    if (portal.targetTown && !context.townIds.has(portal.targetTown)) {
      fail(`${label}: portal[${index}] targets missing town "${portal.targetTown}"`);
    }
    for (const levelId of portal.levels || []) {
      if (!context.levelIds.has(levelId)) fail(`${label}: portal[${index}] targets missing level "${levelId}"`);
    }
  });

  shops.forEach((shop, index) => {
    if (!context.shopIds.has(shop.shopId)) fail(`${label}: shop[${index}] references missing shop "${shop.shopId}"`);
  });

  enemySpawns.forEach((spawn, index) => {
    if (!context.enemyIds.has(spawn.enemyId)) fail(`${label}: enemySpawns[${index}] references missing enemy "${spawn.enemyId}"`);
  });

  battleTriggers.forEach((trigger, index) => {
    if (!trigger.id) fail(`${label}: battleTriggers[${index}] is missing id`);
    if (!context.encounterIds.has(trigger.encounterId)) {
      fail(`${label}: battleTriggers[${index}] references missing encounter "${trigger.encounterId}"`);
    }
  });

  if (map.randomEncounters?.enabled) {
    if (!context.tableIds.has(map.randomEncounters.tableId)) {
      fail(`${label}: random encounters reference missing table "${map.randomEncounters.tableId}"`);
    }
    if (!Number.isFinite(map.randomEncounters.minSeconds) || !Number.isFinite(map.randomEncounters.maxSeconds)) {
      fail(`${label}: random encounter timing is invalid`);
    }
  }
}

function auditGamePackage(manifestFile) {
  const manifest = readJson(manifestFile);
  const gameId = String(manifest.id || path.basename(path.dirname(manifestFile)));
  const label = `game:${gameId}`;
  if (manifest.id !== path.basename(path.dirname(manifestFile))) {
    fail(`${label}: manifest id must match its directory name`);
  }
  const gameType = String(manifest.gameType || 'adventure').trim().toLowerCase();
  if (!['adventure', 'incremental'].includes(gameType)) {
    fail(`${label}: unsupported gameType "${gameType || '(empty)'}"`);
    return;
  }
  if (gameType === 'incremental') {
    console.log(`Audited ${gameId}: deferred to incremental data contract audit.`);
    return;
  }
  if (!manifest.data || typeof manifest.data !== 'object') {
    fail(`${label}: manifest is missing data paths`);
    return;
  }

  const loadData = (key, defaultValue = {}) => {
    const relative = manifest.data[key];
    if (!relative) {
      fail(`${label}: manifest.data.${key} is missing`);
      return defaultValue;
    }
    return readJson(resolveContentFile(manifestFile, manifest, relative), `${label}:${key}`);
  };

  const tilesPayload = loadData('tiles');
  const effectsPayload = loadData('tileEffects');
  const texturesPayload = loadData('texturePack');
  const world = loadData('world');
  const classesPayload = loadData('classes');
  const itemsPayload = loadData('items');
  const enemiesPayload = loadData('enemies');
  const shopsPayload = loadData('shops');
  const progression = loadData('progression');
  const encountersPayload = loadData('encounters');
  const tablesPayload = loadData('encounterTables');

  const tiles = list(tilesPayload, 'tiles');
  const effects = list(effectsPayload, 'effects');
  const textures = list(texturesPayload, 'textures');
  const classes = list(classesPayload, 'classes');
  const items = list(itemsPayload, 'items');
  const enemies = list(enemiesPayload, 'enemies');
  const shops = list(shopsPayload, 'shops');
  const encounters = list(encountersPayload, 'encounters');
  const tables = list(tablesPayload, 'tables');

  const tileIds = assertUniqueIds(tiles, `${label}:tiles`);
  const effectIds = assertUniqueIds(effects, `${label}:effects`);
  const textureIds = assertUniqueIds(textures, `${label}:textures`);
  const classIds = assertUniqueIds(classes, `${label}:classes`);
  const itemIds = assertUniqueIds(items, `${label}:items`);
  const enemyIds = assertUniqueIds(enemies, `${label}:enemies`);
  const shopIds = assertUniqueIds(shops, `${label}:shops`);
  const encounterIds = assertUniqueIds(encounters, `${label}:encounters`);
  const tableIds = assertUniqueIds(tables, `${label}:encounterTables`);
  void classIds;

  tiles.forEach((tile) => {
    if (!textureIds.has(tile.texture)) fail(`${label}: tile "${tile.id}" references missing texture "${tile.texture}"`);
    if (tile.effect && !effectIds.has(tile.effect)) fail(`${label}: tile "${tile.id}" references missing effect "${tile.effect}"`);
  });
  textures.forEach((texture) => validateAsset(texture.image, `${label}:texture:${texture.id}`));

  classes.forEach((classDef) => {
    if (!classDef.stats || !Number.isFinite(classDef.stats.maxHp)) fail(`${label}: class "${classDef.id}" has invalid stats`);
    if (!classDef.movement || !Number.isFinite(classDef.movement.base)) fail(`${label}: class "${classDef.id}" has invalid movement`);
    if (!Number.isInteger(classDef.bagSlots) || classDef.bagSlots < 0) fail(`${label}: class "${classDef.id}" has invalid bagSlots`);
    for (const itemId of Object.values(classDef.startingGear || {}).filter(Boolean)) {
      if (!itemIds.has(itemId)) fail(`${label}: class "${classDef.id}" references missing starting item "${itemId}"`);
    }
  });

  enemies.forEach((enemy) => {
    if (!enemy.stats || !Number.isFinite(enemy.stats.maxHp)) fail(`${label}: enemy "${enemy.id}" has invalid stats`);
    validateAsset(enemy.sprites?.battle, `${label}:enemy:${enemy.id}:battleSprite`);
    validateAsset(enemy.sprites?.inLevel, `${label}:enemy:${enemy.id}:levelSprite`);
    for (const drop of [...(enemy.dropTable?.guaranteed || []), ...(enemy.dropTable?.rare || [])]) {
      if (!itemIds.has(drop.itemId)) fail(`${label}: enemy "${enemy.id}" drops missing item "${drop.itemId}"`);
    }
  });

  shops.forEach((shop) => {
    for (const offer of shop.stock || []) {
      if (!itemIds.has(offer.itemId)) fail(`${label}: shop "${shop.id}" stocks missing item "${offer.itemId}"`);
    }
  });

  encounters.forEach((encounter) => {
    for (const enemyId of encounter.enemies || []) {
      if (!enemyIds.has(enemyId)) fail(`${label}: encounter "${encounter.id}" references missing enemy "${enemyId}"`);
    }
  });

  tables.forEach((table) => {
    for (const entry of table.entries || []) {
      if (!encounterIds.has(entry.encounterId)) fail(`${label}: encounter table "${table.id}" references missing encounter "${entry.encounterId}"`);
      if (!Number.isFinite(entry.weight) || entry.weight <= 0) fail(`${label}: encounter table "${table.id}" has invalid weight`);
    }
  });

  const townIds = new Set(Array.isArray(world.towns) ? world.towns : []);
  const levelIds = new Set(Array.isArray(world.levels) ? world.levels : []);
  if (!townIds.size) fail(`${label}: world must include at least one town`);
  if (world.startTown && !townIds.has(world.startTown)) fail(`${label}: world.startTown references a missing town`);
  if (world.start?.townId && !townIds.has(world.start.townId)) fail(`${label}: world.start.townId references a missing town`);
  for (const townId of world.start?.unlockedTowns || []) {
    if (!townIds.has(townId)) fail(`${label}: unlocked town "${townId}" is missing`);
  }
  for (const levelId of world.start?.unlockedLevels || []) {
    if (!levelIds.has(levelId)) fail(`${label}: unlocked level "${levelId}" is missing`);
  }

  const context = { gameId, tileIds, townIds, levelIds, shopIds, enemyIds, encounterIds, tableIds };
  const townsDirectory = resolveContentFile(manifestFile, manifest, manifest.data.townsDirectory);
  const levelsDirectory = resolveContentFile(manifestFile, manifest, manifest.data.levelsDirectory);

  townIds.forEach((id) => {
    const file = path.join(townsDirectory, `${id}.json`);
    const map = readJson(file, `${label}:town:${id}`);
    if (map.id && map.id !== id) fail(`${label}: town file ${id}.json contains id "${map.id}"`);
    validateMap(map, 'town', file, context);
  });
  levelIds.forEach((id) => {
    const file = path.join(levelsDirectory, `${id}.json`);
    const map = readJson(file, `${label}:level:${id}`);
    if (map.id && map.id !== id) fail(`${label}: level file ${id}.json contains id "${map.id}"`);
    validateMap(map, 'level', file, context);
  });

  for (const [sourceLevel, unlocked] of Object.entries(progression.unlocks || {})) {
    if (!levelIds.has(sourceLevel)) fail(`${label}: progression source level "${sourceLevel}" is missing`);
    for (const targetLevel of unlocked || []) {
      if (!levelIds.has(targetLevel)) fail(`${label}: progression target level "${targetLevel}" is missing`);
    }
  }

  console.log(`Audited ${gameId}: ${townIds.size} town(s), ${levelIds.size} level(s), ${tileIds.size} tile(s).`);
}

function auditSourceFiles() {
  const sourceFiles = walk(repoRoot, (file) => /\.(?:js|mjs)$/.test(file) && !file.includes(`${path.sep}node_modules${path.sep}`));
  sourceFiles.forEach((file) => {
    try {
      execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    } catch (error) {
      fail(`${path.relative(repoRoot, file)}: JavaScript syntax check failed\n${error.stderr?.toString() || error.message}`);
    }

    const source = readFileSync(file, 'utf8');
    const importPattern = /(?:from\s+|import\s*)['"](\.{1,2}\/[^'"]+)['"]/g;
    for (const match of source.matchAll(importPattern)) {
      const importPath = path.resolve(path.dirname(file), match[1]);
      if (!existsSync(importPath)) fail(`${path.relative(repoRoot, file)}: unresolved import ${match[1]}`);
    }
  });
}

function auditHtmlReferences() {
  const htmlFiles = walk(repoRoot, (file) => file.endsWith('.html'));
  htmlFiles.forEach((file) => {
    const html = readFileSync(file, 'utf8');
    const references = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map((match) => match[1]);
    references.forEach((reference) => {
      if (!reference || /^(?:https?:|data:|blob:|mailto:|tel:|#)/i.test(reference)) return;
      const clean = reference.split(/[?#]/)[0];
      if (!clean) return;
      const target = path.resolve(path.dirname(file), clean);
      if (!existsSync(target)) fail(`${path.relative(repoRoot, file)}: missing referenced file ${reference}`);
    });
  });
}

const manifestFiles = walk(path.join(repoRoot, 'games'), (file) => file.endsWith(`${path.sep}game.json`));
if (!manifestFiles.length) fail('No game package manifests were found.');
manifestFiles.forEach(auditGamePackage);
validateAsset('assets/characters/Warrior_Blue.png', 'default player sprite');
auditSourceFiles();
auditHtmlReferences();

warnings.forEach((message) => console.warn(`WARNING: ${message}`));
if (failures.length) {
  console.error(`\nAudit failed with ${failures.length} issue(s):`);
  failures.forEach((message, index) => console.error(`${index + 1}. ${message}`));
  process.exit(1);
}

console.log(`\nData and source audit passed for ${manifestFiles.length} game package(s).`);

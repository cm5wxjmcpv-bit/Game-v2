import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

function fail(message) {
  failures.push(message);
}

function readJson(file, label) {
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
    if (statSync(full).isDirectory()) output.push(...walk(full, predicate));
    else if (predicate(full)) output.push(full);
  }
  return output;
}

function contentRootFor(manifestFile, manifest) {
  return path.resolve(path.dirname(manifestFile), String(manifest.contentRoot || './'));
}

function resolveContentFile(contentRoot, relativePath) {
  return path.resolve(contentRoot, String(relativePath || ''));
}

function validateAsset(contentRoot, assetPath, label) {
  if (!assetPath || /^(https?:|data:|blob:)/i.test(assetPath)) return;
  const fromRepo = path.resolve(repoRoot, assetPath);
  const fromContent = path.resolve(contentRoot, assetPath);
  if (!existsSync(fromRepo) && !existsSync(fromContent)) {
    fail(`${label}: missing asset ${assetPath}`);
  }
}

function readPayload(contentRoot, relativePath, label, fallback = {}) {
  if (!relativePath) return fallback;
  return readJson(resolveContentFile(contentRoot, relativePath), label);
}

function validateActor(actor, itemIds, contentRoot, label) {
  if (!actor || typeof actor !== 'object' || !actor.id) {
    fail(`${label}: actor is missing id`);
    return;
  }
  const components = actor.components;
  if (!components || typeof components !== 'object') {
    fail(`${label}:${actor.id}: components object is required`);
    return;
  }
  if (!Number.isFinite(components.movement?.speed) || components.movement.speed <= 0) {
    fail(`${label}:${actor.id}: movement.speed must be positive`);
  }
  if (!Number.isFinite(components.health?.max) || components.health.max <= 0) {
    fail(`${label}:${actor.id}: health.max must be positive`);
  }
  if (components.inventory?.slots !== undefined && (!Number.isInteger(components.inventory.slots) || components.inventory.slots < 0)) {
    fail(`${label}:${actor.id}: inventory.slots must be a non-negative integer`);
  }
  for (const itemId of Object.values(components.equipment?.starting || {}).filter(Boolean)) {
    if (!itemIds.has(itemId)) fail(`${label}:${actor.id}: starting equipment references missing item "${itemId}"`);
  }
  validateAsset(contentRoot, components.render?.sprite?.imagePath, `${label}:${actor.id}:sprite`);
}

function validateEntities(map, sceneIds, contentRoot, label) {
  const entities = map.entities === undefined ? [] : map.entities;
  if (!Array.isArray(entities)) {
    fail(`${label}: entities must be an array`);
    return 0;
  }
  const ids = new Set();
  entities.forEach((entity, index) => {
    const entityLabel = `${label}:entities[${index}]`;
    if (!entity || typeof entity !== 'object') {
      fail(`${entityLabel}: entity must be an object`);
      return;
    }
    if (!entity.id) fail(`${entityLabel}: id is required`);
    else if (ids.has(entity.id)) fail(`${entityLabel}: duplicate id "${entity.id}"`);
    else ids.add(entity.id);
    if (!Number.isFinite(entity.x) || !Number.isFinite(entity.y)) {
      fail(`${entityLabel}: coordinates must be numeric`);
    } else if (entity.x < 0 || entity.y < 0 || entity.x >= map.width || entity.y >= map.height) {
      fail(`${entityLabel}: coordinates are outside the map`);
    }
    if (!entity.components || typeof entity.components !== 'object') {
      fail(`${entityLabel}: components object is required`);
      return;
    }
    validateAsset(contentRoot, entity.components.render?.imagePath, `${entityLabel}:render`);
    const collision = entity.components.collision;
    if (collision?.solid !== undefined && typeof collision.solid !== 'boolean') {
      fail(`${entityLabel}: collision.solid must be boolean`);
    }
    if (collision?.radius !== undefined && (!Number.isFinite(collision.radius) || collision.radius <= 0)) {
      fail(`${entityLabel}: collision.radius must be positive`);
    }
    const interaction = entity.components.interaction;
    if (interaction) {
      const action = interaction.action || 'message';
      if (!['message', 'scene'].includes(action)) fail(`${entityLabel}: unsupported interaction action "${action}"`);
      if (action === 'message' && !String(interaction.message || '').trim()) {
        fail(`${entityLabel}: message interaction requires text`);
      }
      if (action === 'scene' && !sceneIds.has(interaction.targetScene)) {
        fail(`${entityLabel}: scene interaction targets missing scene "${interaction.targetScene}"`);
      }
    }
  });
  return entities.length;
}

function auditPackage(manifestFile) {
  const manifest = readJson(manifestFile, path.relative(repoRoot, manifestFile));
  const gameId = String(manifest.id || path.basename(path.dirname(manifestFile)));
  const label = `game:${gameId}`;
  const contentRoot = contentRootFor(manifestFile, manifest);
  const world = readPayload(contentRoot, manifest.data?.world, `${label}:world`);
  const classPayload = readPayload(contentRoot, manifest.data?.classes, `${label}:classes`, { classes: [] });
  const actorPayload = readPayload(contentRoot, manifest.data?.actors, `${label}:actors`, { actors: [] });
  const itemPayload = readPayload(contentRoot, manifest.data?.items, `${label}:items`, { items: [] });
  const classes = Array.isArray(classPayload.classes) ? classPayload.classes : [];
  const actors = Array.isArray(actorPayload.actors) ? actorPayload.actors : [];
  const itemIds = new Set((Array.isArray(itemPayload.items) ? itemPayload.items : []).map((item) => item?.id).filter(Boolean));
  const actorIds = new Set(classes.map((entry) => entry?.id).filter(Boolean));

  actors.forEach((actor) => {
    validateActor(actor, itemIds, contentRoot, `${label}:actor`);
    if (actor?.id) actorIds.add(actor.id);
  });
  if (!actorIds.size) fail(`${label}: package must provide at least one class or actor`);

  const groups = [
    ['town', world.towns || [], manifest.data?.townsDirectory],
    ['level', world.levels || [], manifest.data?.levelsDirectory],
    ['scene', world.scenes || [], manifest.data?.scenesDirectory],
  ];
  const sceneIds = new Set(groups.flatMap(([, ids]) => Array.isArray(ids) ? ids : []));
  let entityCount = 0;
  for (const [kind, ids, directory] of groups) {
    for (const id of ids || []) {
      const file = resolveContentFile(contentRoot, `${String(directory || '').replace(/\/$/, '')}/${id}.json`);
      const map = readJson(file, `${label}:${kind}:${id}`);
      entityCount += validateEntities(map, sceneIds, contentRoot, `${label}:${kind}:${id}`);
    }
  }

  console.log(`Actor/entity contract ${gameId}: ${actorIds.size} actor(s), ${entityCount} component entity(ies).`);
}

const manifests = walk(path.join(repoRoot, 'games'), (file) => file.endsWith(`${path.sep}game.json`));
manifests.forEach(auditPackage);

if (failures.length) {
  console.error(`\nActor/entity contract audit failed with ${failures.length} issue(s):`);
  failures.forEach((message, index) => console.error(`${index + 1}. ${message}`));
  process.exit(1);
}

console.log(`\nActor and entity contract audit passed for ${manifests.length} game package(s).`);

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const catalogPath = path.join(root, 'games', 'catalog.json');
const errors = [];

function fail(message) {
  errors.push(message);
  console.error(`ERROR: ${message}`);
}

let catalog;
try {
  catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
} catch (error) {
  fail(`games/catalog.json could not be read: ${error.message}`);
  catalog = { games: [] };
}

if (!Array.isArray(catalog.games) || !catalog.games.length) {
  fail('games/catalog.json must contain a non-empty games array.');
}

const seen = new Set();
for (const entry of catalog.games || []) {
  const id = String(entry?.id || '').trim();
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(id)) {
    fail(`Catalog game has invalid id: ${id || '(missing)'}`);
    continue;
  }
  if (seen.has(id)) fail(`Catalog contains duplicate game id: ${id}`);
  seen.add(id);
  if (!String(entry.name || '').trim()) fail(`Catalog game ${id} is missing a name.`);
  const manifestPath = path.join(root, 'games', id, 'game.json');
  if (!fs.existsSync(manifestPath)) {
    fail(`Catalog game ${id} is missing games/${id}/game.json.`);
    continue;
  }
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (manifest.id !== id) fail(`Catalog game ${id} has manifest id ${manifest.id}.`);
    const catalogType = String(entry.gameType || 'adventure');
    const manifestType = String(manifest.gameType || 'adventure');
    if (!['adventure', 'incremental'].includes(catalogType)) fail(`Catalog game ${id} has unsupported gameType ${catalogType}.`);
    if (catalogType !== manifestType) fail(`Catalog game ${id} gameType does not match its manifest.`);
    if (entry.builderSupport !== undefined && typeof entry.builderSupport !== 'boolean') {
      fail(`Catalog game ${id} builderSupport must be boolean when present.`);
    }
    if (manifestType === 'incremental' && entry.builderSupport !== false) {
      fail(`Catalog game ${id} must disable map-builder support until an incremental builder exists.`);
    }
  } catch (error) {
    fail(`Catalog game ${id} manifest could not be read: ${error.message}`);
  }
}

if (!fs.existsSync(path.join(root, 'builder', 'workspace.html'))) fail('Builder workspace HTML is missing.');
if (!fs.existsSync(path.join(root, 'builder', 'workspace.js'))) fail('Builder workspace script is missing.');
if (!fs.existsSync(path.join(root, 'builder', 'workspace-model.js'))) fail('Builder workspace model is missing.');

if (errors.length) process.exit(1);
console.log(`Builder catalog audit passed for ${seen.size} game package(s).`);

import { loadActiveGamePackage, resolveGamePath } from './gameManifest.js';
import { normalizeIncrementalConfig } from './incrementalContent.js';
import { GAME_TYPES } from './runtimeTypes.js';

async function loadJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Unable to load incremental content (${response.status}).`);
  return response.json();
}

export async function loadIncrementalDatabase() {
  const gamePackage = await loadActiveGamePackage();
  if (gamePackage.manifest.gameType !== GAME_TYPES.INCREMENTAL) {
    throw new Error(`Game "${gamePackage.id}" is not an incremental package.`);
  }

  const contentPath = String(gamePackage.manifest.data?.incremental || '').trim();
  if (!contentPath) {
    throw new Error(`Incremental game "${gamePackage.id}" is missing manifest.data.incremental.`);
  }

  const config = normalizeIncrementalConfig(
    await loadJson(resolveGamePath(gamePackage, contentPath)),
    { gameId: gamePackage.id },
  );

  return {
    game: {
      id: gamePackage.id,
      name: gamePackage.manifest.name,
      version: gamePackage.manifest.version,
      engineVersion: gamePackage.manifest.engineVersion,
      gameType: gamePackage.manifest.gameType,
      manifestUrl: gamePackage.manifestUrl,
    },
    config,
  };
}

export const GAME_TYPES = Object.freeze({
  ADVENTURE: 'adventure',
  INCREMENTAL: 'incremental',
});

const SUPPORTED_GAME_TYPES = new Set(Object.values(GAME_TYPES));

export function normalizeGameType(value) {
  const normalized = String(value || GAME_TYPES.ADVENTURE).trim().toLowerCase();
  if (!SUPPORTED_GAME_TYPES.has(normalized)) {
    throw new Error(`Unsupported game type "${normalized || '(empty)'}".`);
  }
  return normalized;
}

export function runtimeModuleForGameType(value) {
  return normalizeGameType(value) === GAME_TYPES.INCREMENTAL
    ? './incrementalMain.js'
    : './adventureMain.js';
}

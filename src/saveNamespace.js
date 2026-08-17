import { getActiveGameId } from './gameManifest.js';

const DEFAULT_SLOT = 1;

export function getSaveStorageKey(slot = DEFAULT_SLOT) {
  const safeSlot = Number.isInteger(slot) && slot > 0 ? slot : DEFAULT_SLOT;
  return `pixel_engine_save_${getActiveGameId()}_slot_${safeSlot}`;
}

import {
  WORKSPACE_DRAFT_PREFIX,
  applyMapBridgeResultToDraft,
} from './map-bridge-model.js';
import {
  assetDraftKey,
  mergeWorkspaceAssetDraft,
  normalizeWorkspaceAssetDraft,
} from './workspace-asset-model.js';

function serialized(value) {
  return JSON.stringify(value);
}

export function buildReturnedMapStorageUpdates({ result, draft, assetDraft }) {
  if (!result || typeof result !== 'object') throw new Error('The returned map result is missing or invalid.');
  const projectId = String(result.projectId || '').trim();
  if (!projectId) throw new Error('The returned map result has no project ID.');

  const nextDraft = applyMapBridgeResultToDraft(draft, result);
  const incomingTextures = Array.isArray(result.customTextures) ? result.customTextures : [];
  const normalizedAssets = normalizeWorkspaceAssetDraft(assetDraft, projectId);
  const nextAssets = incomingTextures.length
    ? mergeWorkspaceAssetDraft(projectId, normalizedAssets, incomingTextures)
    : normalizedAssets;

  const updates = [{
    key: `${WORKSPACE_DRAFT_PREFIX}${projectId}`,
    value: serialized(nextDraft),
  }];
  if (incomingTextures.length) {
    updates.push({
      key: assetDraftKey(projectId),
      value: serialized(nextAssets),
    });
  }

  return { nextDraft, nextAssets, incomingTextures, updates };
}

export function commitStorageUpdates(storage, updates) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
    throw new Error('Browser storage is unavailable.');
  }
  if (!Array.isArray(updates) || !updates.length) throw new Error('No storage updates were provided.');

  const keys = new Set();
  const prepared = updates.map((update) => {
    const key = String(update?.key || '');
    if (!key || keys.has(key)) throw new Error('The storage transaction contains a missing or duplicate key.');
    keys.add(key);
    return { key, value: String(update.value ?? ''), previous: storage.getItem(key) };
  });

  const applied = [];
  try {
    for (const update of prepared) {
      storage.setItem(update.key, update.value);
      applied.push(update);
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const update of applied.reverse()) {
      try {
        if (update.previous === null) storage.removeItem(update.key);
        else storage.setItem(update.key, update.previous);
      } catch (rollbackError) {
        rollbackErrors.push(`${update.key}: ${rollbackError.message}`);
      }
    }
    const rollbackMessage = rollbackErrors.length
      ? ` Rollback also failed for ${rollbackErrors.join('; ')}.`
      : ' All earlier changes were rolled back.';
    throw new Error(`The level and texture draft could not be saved: ${error.message}.${rollbackMessage}`);
  }

  return prepared.map(({ key, value }) => ({ key, value }));
}

import {
  MAP_BRIDGE_HANDOFF_KEY,
  MAP_BRIDGE_NOTICE_KEY,
  MAP_BRIDGE_RESULT_KEY,
  WORKSPACE_DRAFT_PREFIX,
  createMapBridgeHandoff,
} from './map-bridge-model.js';
import { fetchPackageTileLibrary } from './package-tile-model.js';
import {
  assetDraftKey,
  packageTileLibraryEntryFromAsset,
  readWorkspaceAssetDraft,
} from './workspace-asset-model.js';
import {
  buildReturnedMapStorageUpdates,
  commitStorageUpdates,
} from './workspace-return-model.js';
import './workspace-publish-ui.js';
import './testing-add-to-game-workspace.js';
import './portal-builder-launcher.js';

const publishStyles = document.createElement('link');
publishStyles.rel = 'stylesheet';
publishStyles.href = 'workspace-publish.css';
document.head.appendChild(publishStyles);

installProjectLoadGuard();
consumeReturnedMap();

document.addEventListener('DOMContentLoaded', () => {
  installMapEditorButton();
  installAssetDraftCleanup();
  showPendingNotice();
  import('./workspace-object-ui.js')
    .then(() => import('./workspace-tile-ui.js'))
    .catch((error) => showModuleError('Workspace extension', error));
});

function installProjectLoadGuard() {
  let timer = null;
  let pendingProjectId = '';

  const queueLoad = (projectId) => {
    pendingProjectId = projectId;
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      const select = document.getElementById('projectSelect');
      if (!select || !pendingProjectId) return;
      select.value = pendingProjectId;
      const event = new Event('change', { bubbles: true });
      Object.defineProperty(event, 'workspaceProjectGuardApproved', { value: true });
      select.dispatchEvent(event);
    }, 120);
  };

  document.addEventListener('change', (event) => {
    const select = event.target?.closest?.('#projectSelect');
    if (!select || event.workspaceProjectGuardApproved) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    queueLoad(select.value);
  }, true);

  document.addEventListener('click', (event) => {
    const button = event.target?.closest?.('#loadProjectBtn');
    if (!button || event.workspaceProjectGuardApproved) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    queueLoad(document.getElementById('projectSelect')?.value || '');
  }, true);
}

function showModuleError(label, error) {
  const message = document.getElementById('workspaceMessage');
  if (message) {
    message.textContent = `${label} could not load: ${error.message}`;
    message.classList.add('error');
  }
}

function readJson(key) {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  return JSON.parse(raw);
}

function writeNotice(message, isError = false) {
  const payload = JSON.stringify({ message, isError, createdAt: new Date().toISOString() });
  try {
    sessionStorage.removeItem(MAP_BRIDGE_NOTICE_KEY);
  } catch {
    // Session storage is optional.
  }
  try {
    localStorage.setItem(MAP_BRIDGE_NOTICE_KEY, payload);
    return;
  } catch {
    // A full localStorage area is the exact failure this notice may need to report.
  }
  try {
    sessionStorage.setItem(MAP_BRIDGE_NOTICE_KEY, payload);
  } catch {
    // The return payload remains in localStorage for a later retry even if no notice can be stored.
  }
}

function consumeReturnedMap() {
  const rawResult = localStorage.getItem(MAP_BRIDGE_RESULT_KEY);
  if (!rawResult) return;
  try {
    const result = JSON.parse(rawResult);
    const draftKey = `${WORKSPACE_DRAFT_PREFIX}${result.projectId}`;
    const draft = readJson(draftKey);
    const assetDraft = readWorkspaceAssetDraft(result.projectId);
    const transaction = buildReturnedMapStorageUpdates({ result, draft, assetDraft });
    commitStorageUpdates(localStorage, transaction.updates);

    const textureText = transaction.incomingTextures.length
      ? ` ${transaction.incomingTextures.length} used custom texture(s) were registered for publishing.`
      : '';
    writeNotice(`Level returned for “${result.sceneId}”. Tiles, size, name, and spawn were updated; existing objects, entities, and tile permissions were preserved.${textureText} Add enemies in Scene Objects and NPCs or text boxes in Scene & Entities, then publish for testing.`);
    localStorage.removeItem(MAP_BRIDGE_RESULT_KEY);
    localStorage.removeItem(MAP_BRIDGE_HANDOFF_KEY);
  } catch (error) {
    writeNotice(`Level return was not saved: ${error.message} The previous map and texture drafts were restored, and the returned data was kept. Free browser storage if needed, then reload this workspace to retry.`, true);
  }
}

function installMapEditorButton() {
  const exportButton = document.getElementById('exportSceneBtn');
  if (!exportButton || document.getElementById('openMapEditorBtn')) return;
  const button = document.createElement('button');
  button.id = 'openMapEditorBtn';
  button.type = 'button';
  button.className = 'secondary-btn';
  button.textContent = 'Build Level & Textures';
  button.addEventListener('click', openSelectedSceneInMapEditor);
  exportButton.parentElement?.prepend(button);
}

function installAssetDraftCleanup() {
  window.addEventListener('lc-forge-local-draft-cleared', (event) => {
    if (event.detail?.slotId !== 'workspace') return;
    const projectId = event.detail?.packageId || '';
    if (!projectId) return;
    localStorage.removeItem(assetDraftKey(projectId));
    window.dispatchEvent(new CustomEvent('lc-forge-local-draft-cleared', {
      detail: { packageId: projectId, slotId: 'workspace-assets' },
    }));
  });
}

function sceneKindFromSelection() {
  const select = document.getElementById('sceneSelect');
  const text = select?.selectedOptions?.[0]?.textContent || '';
  const match = text.match(/\[(town|level|building|scene)\]\s*$/i);
  return match ? match[1].toLowerCase() : 'scene';
}

function mergePackageTiles(packageTiles, assetDraft) {
  const byId = new Map(packageTiles.map((tile) => [tile.id, tile]));
  for (const asset of assetDraft.textures || []) {
    const tile = packageTileLibraryEntryFromAsset(asset);
    byId.set(tile.id, tile);
  }
  return [...byId.values()];
}

async function openSelectedSceneInMapEditor() {
  const projectSelect = document.getElementById('projectSelect');
  const sceneSelect = document.getElementById('sceneSelect');
  const saveDraftButton = document.getElementById('saveDraftBtn');
  const openButton = document.getElementById('openMapEditorBtn');
  const message = document.getElementById('workspaceMessage');
  const projectId = projectSelect?.value || '';
  const sceneId = sceneSelect?.value || '';

  try {
    if (!projectId || !sceneId) throw new Error('Select a game project and scene first.');
    if (openButton) openButton.disabled = true;
    if (message) {
      message.textContent = 'Preparing the selected scene, package tiles, and staged custom textures…';
      message.classList.remove('error');
    }
    saveDraftButton?.click();
    if (saveDraftButton?.dataset.saveStatus === 'error') {
      throw new Error('The current workspace draft could not be saved in browser storage. Free storage and try again.');
    }
    const draft = readJson(`${WORKSPACE_DRAFT_PREFIX}${projectId}`);
    const scene = draft?.scenes?.find((entry) => entry.id === sceneId);
    if (!scene) throw new Error('The selected scene was not found in the saved local draft.');
    const assetDraft = readWorkspaceAssetDraft(projectId);
    const repositoryTiles = await fetchPackageTileLibrary(projectId, window.location.href);
    const packageTiles = mergePackageTiles(repositoryTiles, assetDraft);
    const returnUrl = new URL(`workspace.html?game=${encodeURIComponent(projectId)}`, window.location.href).href;
    const handoff = createMapBridgeHandoff({
      projectId,
      scene,
      sceneKind: sceneKindFromSelection(),
      returnUrl,
      packageTiles,
      stagedTextures: assetDraft.textures,
    });
    localStorage.setItem(MAP_BRIDGE_HANDOFF_KEY, JSON.stringify(handoff));
    localStorage.removeItem(MAP_BRIDGE_RESULT_KEY);
    window.location.href = 'map-bridge.html';
  } catch (error) {
    if (openButton) openButton.disabled = false;
    if (message) {
      message.textContent = `Unable to open map and texture builder: ${error.message}`;
      message.classList.add('error');
    }
  }
}

function showPendingNotice() {
  let sessionRaw = null;
  let localRaw = null;
  try {
    sessionRaw = sessionStorage.getItem(MAP_BRIDGE_NOTICE_KEY);
  } catch {
    // Session storage is optional.
  }
  try {
    localRaw = localStorage.getItem(MAP_BRIDGE_NOTICE_KEY);
  } catch {
    // Local storage may be unavailable or full.
  }
  const raw = sessionRaw || localRaw;
  if (!raw) return;
  let notice;
  try {
    notice = JSON.parse(raw);
  } catch {
    try { sessionStorage.removeItem(MAP_BRIDGE_NOTICE_KEY); } catch { /* no-op */ }
    try { localStorage.removeItem(MAP_BRIDGE_NOTICE_KEY); } catch { /* no-op */ }
    return;
  }
  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    const message = document.getElementById('workspaceMessage');
    const summary = document.getElementById('projectSummary');
    const ready = message && summary && !/loading/i.test(summary.textContent || '');
    if (!ready && attempts < 120) return;
    window.clearInterval(timer);
    if (message) {
      message.textContent = notice.message || 'Map and texture bridge completed.';
      message.classList.toggle('error', Boolean(notice.isError));
    }
    try { sessionStorage.removeItem(MAP_BRIDGE_NOTICE_KEY); } catch { /* no-op */ }
    try { localStorage.removeItem(MAP_BRIDGE_NOTICE_KEY); } catch { /* no-op */ }
  }, 50);
}

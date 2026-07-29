import {
  MAP_BRIDGE_HANDOFF_KEY,
  MAP_BRIDGE_NOTICE_KEY,
  MAP_BRIDGE_RESULT_KEY,
  WORKSPACE_DRAFT_PREFIX,
  applyMapBridgeResultToDraft,
  createMapBridgeHandoff,
} from './map-bridge-model.js';
import { fetchPackageTileLibrary } from './package-tile-model.js';
import './workspace-publish-ui.js';

const publishStyles = document.createElement('link');
publishStyles.rel = 'stylesheet';
publishStyles.href = 'workspace-publish.css';
document.head.appendChild(publishStyles);

consumeReturnedMap();

document.addEventListener('DOMContentLoaded', () => {
  installMapEditorButton();
  showPendingNotice();
  import('./workspace-object-ui.js')
    .then(() => import('./workspace-tile-ui.js'))
    .catch((error) => showModuleError('Workspace extension', error));
});

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
  localStorage.setItem(MAP_BRIDGE_NOTICE_KEY, JSON.stringify({ message, isError, createdAt: new Date().toISOString() }));
}

function consumeReturnedMap() {
  const rawResult = localStorage.getItem(MAP_BRIDGE_RESULT_KEY);
  if (!rawResult) return;
  try {
    const result = JSON.parse(rawResult);
    const draftKey = `${WORKSPACE_DRAFT_PREFIX}${result.projectId}`;
    const draft = readJson(draftKey);
    const nextDraft = applyMapBridgeResultToDraft(draft, result);
    localStorage.setItem(draftKey, JSON.stringify(nextDraft));
    writeNotice(`Map layout returned for “${result.sceneId}”. Tiles, size, name, and spawn were updated; existing objects, entities, and tile permissions were preserved.`);
  } catch (error) {
    writeNotice(`Map return could not be applied: ${error.message}`, true);
  } finally {
    localStorage.removeItem(MAP_BRIDGE_RESULT_KEY);
    localStorage.removeItem(MAP_BRIDGE_HANDOFF_KEY);
  }
}

function installMapEditorButton() {
  const exportButton = document.getElementById('exportSceneBtn');
  if (!exportButton || document.getElementById('openMapEditorBtn')) return;
  const button = document.createElement('button');
  button.id = 'openMapEditorBtn';
  button.type = 'button';
  button.className = 'secondary-btn';
  button.textContent = 'Edit Tiles & Spawn';
  button.addEventListener('click', openSelectedSceneInMapEditor);
  exportButton.parentElement?.prepend(button);
}

function sceneKindFromSelection() {
  const select = document.getElementById('sceneSelect');
  const text = select?.selectedOptions?.[0]?.textContent || '';
  const match = text.match(/\[(town|level|scene)\]\s*$/i);
  return match ? match[1].toLowerCase() : 'scene';
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
      message.textContent = 'Preparing the selected scene and package tile library…';
      message.classList.remove('error');
    }
    saveDraftButton?.click();
    const draft = readJson(`${WORKSPACE_DRAFT_PREFIX}${projectId}`);
    const scene = draft?.scenes?.find((entry) => entry.id === sceneId);
    if (!scene) throw new Error('The selected scene was not found in the saved local draft.');
    const packageTiles = await fetchPackageTileLibrary(projectId, window.location.href);
    const returnUrl = new URL(`workspace.html?game=${encodeURIComponent(projectId)}`, window.location.href).href;
    const handoff = createMapBridgeHandoff({
      projectId,
      scene,
      sceneKind: sceneKindFromSelection(),
      returnUrl,
      packageTiles,
    });
    localStorage.setItem(MAP_BRIDGE_HANDOFF_KEY, JSON.stringify(handoff));
    localStorage.removeItem(MAP_BRIDGE_RESULT_KEY);
    window.location.href = 'map-bridge.html';
  } catch (error) {
    if (openButton) openButton.disabled = false;
    if (message) {
      message.textContent = `Unable to open map editor: ${error.message}`;
      message.classList.add('error');
    }
  }
}

function showPendingNotice() {
  const raw = localStorage.getItem(MAP_BRIDGE_NOTICE_KEY);
  if (!raw) return;
  let notice;
  try {
    notice = JSON.parse(raw);
  } catch {
    localStorage.removeItem(MAP_BRIDGE_NOTICE_KEY);
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
      message.textContent = notice.message || 'Map bridge completed.';
      message.classList.toggle('error', Boolean(notice.isError));
    }
    localStorage.removeItem(MAP_BRIDGE_NOTICE_KEY);
  }, 50);
}

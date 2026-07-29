import {
  CUSTOM_TEXTURE_LIBRARY_KEY,
  MAP_BRIDGE_HANDOFF_KEY,
  MAP_BRIDGE_RESULT_KEY,
  MAP_BRIDGE_SCHEMA_VERSION,
  buildBridgeTextureEntries,
  mergeMapBridgeResult,
  validateMapBridgeHandoff,
} from './map-bridge-model.js';

const dom = {
  title: document.getElementById('bridgeTitle'),
  status: document.getElementById('bridgeStatus'),
  cancel: document.getElementById('cancelBridgeBtn'),
  returnButton: document.getElementById('returnBridgeBtn'),
  frame: document.getElementById('builderFrame'),
};

let handoff = null;
let originalLibraryRaw = null;
let libraryInstalled = false;
let capturePending = false;
let capturedBlob = null;
let captureTimer = null;

initialize();

function initialize() {
  try {
    handoff = validateMapBridgeHandoff(JSON.parse(localStorage.getItem(MAP_BRIDGE_HANDOFF_KEY) || 'null'));
    dom.title.textContent = `Map Editor • ${handoff.sceneId}`;
    installTemporaryTextureLibrary();
    bindEvents();
    dom.frame.src = `./?workspaceMapBridge=${encodeURIComponent(handoff.sceneId)}`;
  } catch (error) {
    showError(error.message);
    dom.cancel.textContent = 'Back to Workspace';
  }
}

function bindEvents() {
  dom.frame.addEventListener('load', onBuilderLoaded);
  dom.cancel.addEventListener('click', cancelBridge);
  dom.returnButton.addEventListener('click', captureAndReturn);
  window.addEventListener('beforeunload', restoreTextureLibrary);
}

function installTemporaryTextureLibrary() {
  originalLibraryRaw = localStorage.getItem(CUSTOM_TEXTURE_LIBRARY_KEY);
  let existing = { version: 1, textures: [] };
  try {
    const parsed = originalLibraryRaw ? JSON.parse(originalLibraryRaw) : null;
    if (parsed && Array.isArray(parsed.textures)) existing = parsed;
  } catch {
    existing = { version: 1, textures: [] };
  }
  const bridgeEntries = buildBridgeTextureEntries(handoff);
  const bridgeIds = new Set(bridgeEntries.map((entry) => entry.id));
  const textures = (existing.textures || []).filter((entry) => !bridgeIds.has(entry?.id));
  localStorage.setItem(CUSTOM_TEXTURE_LIBRARY_KEY, JSON.stringify({ version: 1, textures: [...bridgeEntries, ...textures] }));
  libraryInstalled = true;
}

function restoreTextureLibrary() {
  if (!libraryInstalled) return;
  if (originalLibraryRaw === null) localStorage.removeItem(CUSTOM_TEXTURE_LIBRARY_KEY);
  else localStorage.setItem(CUSTOM_TEXTURE_LIBRARY_KEY, originalLibraryRaw);
  libraryInstalled = false;
}

function onBuilderLoaded() {
  const frameWindow = dom.frame.contentWindow;
  const frameDocument = dom.frame.contentDocument;
  if (!frameWindow || !frameDocument || frameWindow.location.href === 'about:blank') return;
  restoreTextureLibrary();
  try {
    configureFocusedEditor(frameWindow, frameDocument);
    installDownloadCapture(frameWindow, frameDocument);
    importEditorMap(frameWindow, frameDocument);
  } catch (error) {
    showError(`Map editor setup failed: ${error.message}`);
  }
}

function configureFocusedEditor(frameWindow, frameDocument) {
  ['tabViewerBtn', 'tabItemEditorBtn', 'tabTextureBuilderBtn', 'mapTypeSelect', 'mapIdInput', 'importInput']
    .forEach((id) => {
      const element = frameDocument.getElementById(id);
      if (element) element.disabled = true;
    });

  const header = frameDocument.querySelector('.site-header p');
  if (header) header.textContent = 'Workspace bridge mode: edit tiles, dimensions, name, and the Player Start marker.';

  const restrictPalette = () => {
    const objectMode = /object layer/i.test(frameDocument.getElementById('activeLayerLabel')?.textContent || '');
    frameDocument.querySelectorAll('#palette .tile-btn').forEach((button) => {
      button.disabled = objectMode && button.dataset.tileId !== 'player_start';
      if (button.disabled) button.title = 'Workspace bridge mode preserves legacy objects and component entities outside this editor.';
    });
  };

  const observer = new frameWindow.MutationObserver(restrictPalette);
  const palette = frameDocument.getElementById('palette');
  const layerLabel = frameDocument.getElementById('activeLayerLabel');
  if (palette) observer.observe(palette, { childList: true, subtree: true });
  if (layerLabel) observer.observe(layerLabel, { childList: true, characterData: true, subtree: true });
  frameDocument.getElementById('layerTileBtn')?.addEventListener('click', () => frameWindow.setTimeout(restrictPalette, 0));
  frameDocument.getElementById('layerObjectBtn')?.addEventListener('click', () => frameWindow.setTimeout(restrictPalette, 0));
  restrictPalette();
}

function importEditorMap(frameWindow, frameDocument) {
  const input = frameDocument.getElementById('importInput');
  if (!input) throw new Error('The established builder import control was not found.');
  const file = new frameWindow.File([JSON.stringify(handoff.editorMap)], `${handoff.sceneId}-workspace-map.json`, { type: 'application/json' });
  const transfer = new frameWindow.DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new frameWindow.Event('change', { bubbles: true }));

  let attempts = 0;
  const timer = frameWindow.setInterval(() => {
    attempts += 1;
    const loadedId = frameDocument.getElementById('mapIdInput')?.value;
    if (loadedId === handoff.sceneId) {
      frameWindow.clearInterval(timer);
      dom.status.textContent = `${handoff.sceneId} loaded. Use Tile Layer for layout and Object Layer only for Player Start.`;
      dom.returnButton.disabled = false;
      return;
    }
    if (attempts >= 100) {
      frameWindow.clearInterval(timer);
      showError('The selected scene did not finish loading in the map editor.');
    }
  }, 50);
}

function installDownloadCapture(frameWindow, frameDocument) {
  const originalCreateObjectUrl = frameWindow.URL.createObjectURL.bind(frameWindow.URL);
  frameWindow.URL.createObjectURL = function createObjectURL(blob) {
    if (capturePending && blob instanceof frameWindow.Blob && /json/i.test(blob.type || '')) capturedBlob = blob;
    return originalCreateObjectUrl(blob);
  };

  frameDocument.addEventListener('click', (event) => {
    const anchor = event.target?.closest?.('a[download]');
    if (!capturePending || !anchor || !/_raw\.json$/i.test(anchor.download || '')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const blob = capturedBlob;
    capturePending = false;
    capturedBlob = null;
    if (captureTimer) window.clearTimeout(captureTimer);
    processCapturedMap(blob);
  }, true);
}

function captureAndReturn() {
  if (!handoff || capturePending) return;
  const frameDocument = dom.frame.contentDocument;
  const exportButton = frameDocument?.getElementById('exportBtn');
  if (!exportButton) return showError('The map editor raw export control was not found.');
  capturePending = true;
  capturedBlob = null;
  dom.returnButton.disabled = true;
  dom.status.textContent = 'Validating the edited layout…';
  exportButton.click();
  captureTimer = window.setTimeout(() => {
    if (!capturePending) return;
    capturePending = false;
    dom.returnButton.disabled = false;
    showError('The map editor export could not be captured. No workspace data was changed.');
  }, 2500);
}

async function processCapturedMap(blob) {
  try {
    if (!blob) throw new Error('The map editor did not produce a JSON payload.');
    const rawMap = JSON.parse(await blob.text());
    const scene = mergeMapBridgeResult(handoff, rawMap);
    localStorage.setItem(MAP_BRIDGE_RESULT_KEY, JSON.stringify({
      schemaVersion: MAP_BRIDGE_SCHEMA_VERSION,
      projectId: handoff.projectId,
      sceneId: handoff.sceneId,
      scene,
      returnedAt: new Date().toISOString(),
    }));
    window.location.href = handoff.returnUrl || `workspace.html?game=${encodeURIComponent(handoff.projectId)}`;
  } catch (error) {
    dom.returnButton.disabled = false;
    showError(`Layout was not returned: ${error.message}`);
  }
}

function cancelBridge() {
  restoreTextureLibrary();
  localStorage.removeItem(MAP_BRIDGE_RESULT_KEY);
  localStorage.removeItem(MAP_BRIDGE_HANDOFF_KEY);
  window.location.href = handoff?.returnUrl || 'workspace.html';
}

function showError(message) {
  dom.status.textContent = message;
  dom.status.classList.add('bridge-error');
  dom.returnButton.disabled = true;
}

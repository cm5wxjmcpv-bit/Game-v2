import {
  CUSTOM_TEXTURE_LIBRARY_KEY,
  MAP_BRIDGE_HANDOFF_KEY,
  MAP_BRIDGE_RESULT_KEY,
  MAP_BRIDGE_SCHEMA_VERSION,
  buildBridgeTextureEntries,
  mergeMapBridgeResult,
  validateMapBridgeHandoff,
} from './map-bridge-model.js';
import { isCustomTextureId, normalizeWorkspaceTextureAsset } from './workspace-asset-model.js';

const dom = {
  title: document.getElementById('bridgeTitle'),
  status: document.getElementById('bridgeStatus'),
  cancel: document.getElementById('cancelBridgeBtn'),
  returnButton: document.getElementById('returnBridgeBtn'),
  frame: document.getElementById('builderFrame'),
};

let handoff = null;
let originalLibraryRaw = null;
let capturePending = false;
let capturedBlob = null;
let captureTimer = null;

initialize();

function initialize() {
  try {
    handoff = validateMapBridgeHandoff(JSON.parse(localStorage.getItem(MAP_BRIDGE_HANDOFF_KEY) || 'null'));
    dom.title.textContent = `Level & Texture Builder • ${handoff.sceneId}`;
    dom.frame.style.pointerEvents = 'none';
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
  window.addEventListener('beforeunload', restoreOriginalTextureLibrary);
}

function readTextureLibrary() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CUSTOM_TEXTURE_LIBRARY_KEY) || 'null');
    return parsed && Array.isArray(parsed.textures) ? parsed : { version: 1, textures: [] };
  } catch {
    return { version: 1, textures: [] };
  }
}

function installTemporaryTextureLibrary() {
  originalLibraryRaw = localStorage.getItem(CUSTOM_TEXTURE_LIBRARY_KEY);
  const existing = readTextureLibrary();
  const bridgeEntries = buildBridgeTextureEntries(handoff);
  const bridgeIds = new Set(bridgeEntries.map((entry) => entry.id));
  const textures = (existing.textures || []).filter((entry) => !bridgeIds.has(entry?.id));
  localStorage.setItem(CUSTOM_TEXTURE_LIBRARY_KEY, JSON.stringify({ version: 1, textures: [...bridgeEntries, ...textures] }));
}

function restoreOriginalTextureLibrary() {
  if (originalLibraryRaw === null) localStorage.removeItem(CUSTOM_TEXTURE_LIBRARY_KEY);
  else localStorage.setItem(CUSTOM_TEXTURE_LIBRARY_KEY, originalLibraryRaw);
}

function onBuilderLoaded() {
  const frameWindow = dom.frame.contentWindow;
  const frameDocument = dom.frame.contentDocument;
  if (!frameWindow || !frameDocument || frameWindow.location.href === 'about:blank') return;
  restoreOriginalTextureLibrary();
  try {
    const restrictPalette = configureFocusedEditor(frameWindow, frameDocument);
    installDownloadCapture(frameWindow, frameDocument);
    importEditorMap(frameWindow, frameDocument, restrictPalette);
  } catch (error) {
    showError(`Level editor setup failed: ${error.message}`);
  }
}

function configureFocusedEditor(frameWindow, frameDocument) {
  ['tabViewerBtn', 'tabItemEditorBtn', 'mapTypeSelect', 'mapIdInput', 'importInput']
    .forEach((id) => {
      const element = frameDocument.getElementById(id);
      if (element) element.disabled = true;
    });

  const header = frameDocument.querySelector('.site-header p');
  if (header) header.textContent = 'Build textures, save them to the Custom Texture Library, paint the level, and send the finished level and used textures back to the Game Workspace.';

  const allowedTileIds = new Set(handoff.allowedTileIds || (handoff.editorMap.tileLayer || []).flat());
  const restrictPalette = () => {
    const objectMode = /object layer/i.test(frameDocument.getElementById('activeLayerLabel')?.textContent || '');
    frameDocument.querySelectorAll('#palette .tile-btn').forEach((button) => {
      const tileId = button.dataset.tileId || '';
      const allowed = objectMode
        ? tileId === 'player_start'
        : allowedTileIds.has(tileId) || isCustomTextureId(tileId);
      button.disabled = !allowed;
      if (!allowed) {
        button.title = objectMode
          ? 'Add enemies, portals, shops, and other scene objects after returning to the Game Workspace.'
          : 'Enable this registered package tile from the workspace before opening the level editor.';
      } else {
        button.removeAttribute('title');
      }
    });
    frameDocument.querySelectorAll('#palette details').forEach((section) => {
      section.open = Boolean(section.querySelector('.tile-btn:not(:disabled)'));
    });
  };

  const observer = new frameWindow.MutationObserver(restrictPalette);
  const palette = frameDocument.getElementById('palette');
  const layerLabel = frameDocument.getElementById('activeLayerLabel');
  if (palette) observer.observe(palette, { childList: true, subtree: true });
  if (layerLabel) observer.observe(layerLabel, { childList: true, characterData: true, subtree: true });
  frameDocument.getElementById('layerTileBtn')?.addEventListener('click', () => frameWindow.setTimeout(restrictPalette, 0));
  frameDocument.getElementById('layerObjectBtn')?.addEventListener('click', () => frameWindow.setTimeout(restrictPalette, 0));
  frameDocument.getElementById('textureSaveToLibraryBtn')?.addEventListener('click', () => frameWindow.setTimeout(restrictPalette, 0));
  frameDocument.getElementById('tabMapEditorBtn')?.addEventListener('click', () => frameWindow.setTimeout(restrictPalette, 0));
  restrictPalette();
  return restrictPalette;
}

function importEditorMap(frameWindow, frameDocument, restrictPalette) {
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
      restrictPalette();
      const firstAllowedTile = frameDocument.querySelector('#palette .tile-btn[data-tile-id]:not(:disabled)');
      firstAllowedTile?.click();
      dom.frame.style.pointerEvents = 'auto';
      dom.status.textContent = `${handoff.sceneId} loaded. Create and save textures, paint the level, then send the level and used textures to the workspace.`;
      dom.returnButton.disabled = false;
      return;
    }
    if (attempts >= 100) {
      frameWindow.clearInterval(timer);
      showError('The selected scene did not finish loading in the level editor.');
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
  if (!exportButton) return showError('The level editor raw export control was not found.');
  capturePending = true;
  capturedBlob = null;
  dom.returnButton.disabled = true;
  dom.status.textContent = 'Validating the level and collecting its used custom textures…';
  exportButton.click();
  captureTimer = window.setTimeout(() => {
    if (!capturePending) return;
    capturePending = false;
    dom.returnButton.disabled = false;
    showError('The level editor export could not be captured. No workspace data was changed.');
  }, 2500);
}

function usedCustomTextureIds(rawMap) {
  const aliases = new Set(Object.keys(handoff.tileAliases || {}));
  const used = new Set();
  for (const row of rawMap.tileLayer || rawMap.tiles || []) {
    for (const tileId of row || []) {
      if (isCustomTextureId(tileId) && !aliases.has(tileId)) used.add(tileId);
    }
  }
  return [...used];
}

function parseHex(color) {
  const value = String(color || '#000000').replace('#', '');
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function texturePngDataUrl(texture) {
  const canvas = document.createElement('canvas');
  canvas.width = texture.size;
  canvas.height = texture.size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error(`Could not render custom texture ${texture.id}.`);
  const imageData = context.createImageData(texture.size, texture.size);
  for (let y = 0; y < texture.size; y += 1) {
    for (let x = 0; x < texture.size; x += 1) {
      const pixel = texture.pixels[y][x];
      const offset = (y * texture.size + x) * 4;
      if (!pixel) {
        imageData.data[offset + 3] = 0;
        continue;
      }
      const [r, g, b] = parseHex(pixel.color);
      imageData.data[offset] = r;
      imageData.data[offset + 1] = g;
      imageData.data[offset + 2] = b;
      imageData.data[offset + 3] = Math.round(Math.max(0, Math.min(1, Number(pixel.alpha) || 0)) * 255);
    }
  }
  context.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

function collectUsedCustomTextures(rawMap) {
  const library = readTextureLibrary();
  const byId = new Map();
  for (const raw of [...(handoff.customTextures || []), ...(library.textures || [])]) {
    const asset = normalizeWorkspaceTextureAsset(raw);
    if (asset) byId.set(asset.id, asset);
  }
  return usedCustomTextureIds(rawMap).map((id) => {
    const asset = byId.get(id);
    if (!asset) throw new Error(`Custom texture ${id} is used in the level but was not saved to the Custom Texture Library.`);
    return {
      ...asset,
      image: texturePngDataUrl(asset),
      updatedAt: new Date().toISOString(),
    };
  });
}

async function processCapturedMap(blob) {
  try {
    if (!blob) throw new Error('The level editor did not produce a JSON payload.');
    const rawMap = JSON.parse(await blob.text());
    const customTextures = collectUsedCustomTextures(rawMap);
    const scene = mergeMapBridgeResult(handoff, rawMap, customTextures);
    localStorage.setItem(MAP_BRIDGE_RESULT_KEY, JSON.stringify({
      schemaVersion: MAP_BRIDGE_SCHEMA_VERSION,
      projectId: handoff.projectId,
      sceneId: handoff.sceneId,
      scene,
      customTextures,
      returnedAt: new Date().toISOString(),
    }));
    restoreOriginalTextureLibrary();
    window.location.href = handoff.returnUrl || `workspace.html?game=${encodeURIComponent(handoff.projectId)}`;
  } catch (error) {
    dom.returnButton.disabled = false;
    showError(`Level and textures were not returned: ${error.message}`);
  }
}

function cancelBridge() {
  restoreOriginalTextureLibrary();
  localStorage.removeItem(MAP_BRIDGE_RESULT_KEY);
  localStorage.removeItem(MAP_BRIDGE_HANDOFF_KEY);
  window.location.href = handoff?.returnUrl || 'workspace.html';
}

function showError(message) {
  dom.status.textContent = message;
  dom.status.classList.add('bridge-error');
  dom.returnButton.disabled = true;
}

import { fetchPackageTileLibrary } from './package-tile-model.js';
import {
  assetDraftKey,
  mergeWorkspaceAssetDraft,
  normalizeWorkspaceTextureAsset,
  readWorkspaceAssetDraft,
  writeWorkspaceAssetDraft,
} from './workspace-asset-model.js';
import { canonicalJson, repoPathFromUrl } from './workspace-publish-model.js';
import {
  TESTING_ADD_TO_GAME_PENDING_KEY,
  prepareTestingLevelForWorkspace,
  registerTestingSceneInWorld,
  validateTestingAddToGameRequest,
} from './testing-add-to-game-model.js';

const REPOSITORY_ROOT_URL = new URL('../', window.location.href);
let consuming = false;

window.addEventListener('pixel-engine-workspace-loaded', (event) => {
  const projectId = event.detail?.projectId || '';
  rehydrateTestingSceneMetadata(projectId);
  consumePendingTestingLevel(projectId);
});

function readPendingRequest() {
  const raw = localStorage.getItem(TESTING_ADD_TO_GAME_PENDING_KEY);
  if (!raw) return null;
  return validateTestingAddToGameRequest(JSON.parse(raw));
}

function workspaceApi() {
  const api = window.pixelEngineWorkspace;
  if (!api || typeof api.getState !== 'function') throw new Error('The game workspace API is not ready.');
  return api;
}

function setWorkspaceMessage(text, isError = false) {
  const message = document.getElementById('workspaceMessage');
  if (!message) return;
  message.textContent = text;
  message.classList.toggle('error', isError);
}

function rehydrateTestingSceneMetadata(projectId) {
  try {
    const api = workspaceApi();
    const state = api.getState();
    if (state.projectId !== projectId) return;
    const data = state.manifest?.data || {};
    for (const scene of state.scenes || []) {
      const kind = scene.mapType === 'town' ? 'town' : scene.mapType === 'level' ? 'level' : '';
      if (!kind) continue;
      const directory = kind === 'town' ? data.townsDirectory : data.levelsDirectory;
      if (!directory) continue;
      scene._workspaceKind = kind;
      scene._workspacePath ||= `${String(directory).replace(/\/$/, '')}/${scene.id}.json`;
      const option = document.querySelector(`#sceneSelect option[value="${CSS.escape(scene.id)}"]`);
      if (option) option.textContent = `${scene.name} [${kind}]`;
    }
  } catch {
    // Metadata hydration is best-effort; normal workspace loading remains available.
  }
}

async function consumePendingTestingLevel(projectId) {
  if (consuming) return;
  let request;
  try {
    request = readPendingRequest();
  } catch (error) {
    setWorkspaceMessage(`Testing Space request could not be read: ${error.message}`, true);
    return;
  }
  if (!request || request.projectId !== projectId) return;

  consuming = true;
  const api = workspaceApi();
  const state = api.getState();
  const priorDirty = Boolean(state.dirty);
  const assetKey = assetDraftKey(projectId);
  const priorAssetRaw = localStorage.getItem(assetKey);
  let appendedSceneId = '';

  try {
    setWorkspaceMessage(`Adding “${request.map.mapName}” from the Testing Space to ${projectId}…`);
    const prepared = prepareTestingLevelForWorkspace({ request, workspaceState: state });
    const packageTiles = await fetchPackageTileLibrary(projectId, window.location.href);
    const currentAssets = readWorkspaceAssetDraft(projectId);
    const incomingTextures = prepareIncomingTextures(prepared, packageTiles, currentAssets);
    const worldFile = await buildWorldRegistrationFile(state, currentAssets, prepared.scene);
    const nextAssets = mergeWorkspaceAssetDraft(projectId, currentAssets, incomingTextures, [worldFile]);

    writeWorkspaceAssetDraft(projectId, nextAssets);
    state.scenes.push(prepared.scene);
    appendedSceneId = prepared.scene.id;
    state.selectedSceneId = prepared.scene.id;
    state.selectedEntityId = '';
    api.markDirty(`Added “${prepared.scene.name}” from the Testing Space. Saving the independent game copy…`);
    api.saveDraft();

    const saveButton = document.getElementById('saveDraftBtn');
    if (saveButton?.dataset.saveStatus === 'error') {
      throw new Error('The game workspace draft could not be saved in browser storage.');
    }

    try { localStorage.removeItem(TESTING_ADD_TO_GAME_PENDING_KEY); } catch { /* staged copy is already safe */ }
    cleanTestingImportQuery();
    const textureText = incomingTextures.length
      ? ` ${incomingTextures.length} new custom texture${incomingTextures.length === 1 ? '' : 's'} were staged with it.`
      : '';
    const warningText = prepared.warnings.length ? ` ${prepared.warnings.join(' ')}` : '';
    setWorkspaceMessage(`Added “${prepared.scene.name}” as a new ${prepared.sceneKind} in ${projectId}.${textureText} The Testing Space original is unchanged. Review the scene, then use Publish to create a draft PR.${warningText}`);
  } catch (error) {
    if (appendedSceneId) {
      const index = state.scenes.findIndex((scene) => scene.id === appendedSceneId);
      if (index >= 0) state.scenes.splice(index, 1);
      state.selectedSceneId = state.scenes[0]?.id || '';
      state.selectedEntityId = '';
      api.markDirty('Testing Space add was rolled back.');
      state.dirty = priorDirty;
    }
    try {
      if (priorAssetRaw === null) localStorage.removeItem(assetKey);
      else localStorage.setItem(assetKey, priorAssetRaw);
    } catch (rollbackError) {
      setWorkspaceMessage(`Add to Game failed: ${error.message} Asset rollback also failed: ${rollbackError.message}`, true);
      consuming = false;
      return;
    }
    setWorkspaceMessage(`Add to Game failed: ${error.message} No existing game scene was overwritten.`, true);
  } finally {
    consuming = false;
  }
}

function prepareIncomingTextures(prepared, packageTiles, currentAssets) {
  const packageById = new Map(packageTiles.map((tile) => [tile.id, tile]));
  const stagedById = new Map((currentAssets.textures || []).map((texture) => [texture.id, texture]));
  const requestById = new Map((prepared.textures || []).map((texture) => [texture.id, texture]));
  const incoming = [];

  for (const id of prepared.requiredCustomTextureIds) {
    const requestTexture = requestById.get(id) || null;
    const stagedTexture = stagedById.get(id) || null;
    const packageTile = packageById.get(id) || null;
    const packageTexture = packageTile ? normalizeWorkspaceTextureAsset({
      id: packageTile.id,
      name: packageTile.name,
      size: packageTile.builderSize,
      pixels: packageTile.builderPixels,
      previewColor: packageTile.color,
      image: packageTile.textureImage,
      walkable: packageTile.walkable,
    }) : null;

    if (!requestTexture && !stagedTexture && !packageTile) {
      throw new Error(`Custom texture “${id}” is used by this level but is not bundled with the Testing Space copy or registered in the selected game.`);
    }
    if (requestTexture && stagedTexture && !sameTextureDesign(requestTexture, stagedTexture)) {
      throw new Error(`Custom texture ID “${id}” conflicts with a different texture already staged for this game.`);
    }
    if (requestTexture && packageTile) {
      if (!packageTexture || !sameTextureDesign(requestTexture, packageTexture)) {
        throw new Error(`Custom texture ID “${id}” conflicts with a different texture already registered in this game.`);
      }
      continue;
    }
    if (stagedTexture || !requestTexture) continue;
    incoming.push({
      ...requestTexture,
      image: texturePngDataUrl(requestTexture),
      updatedAt: new Date().toISOString(),
    });
  }
  return incoming;
}

function sameTextureDesign(leftValue, rightValue) {
  const left = normalizeWorkspaceTextureAsset(leftValue);
  const right = normalizeWorkspaceTextureAsset(rightValue);
  if (!left || !right) return false;
  return canonicalJson({ size: left.size, pixels: left.pixels, walkable: left.walkable }) ===
    canonicalJson({ size: right.size, pixels: right.pixels, walkable: right.walkable });
}

function parseHex(color) {
  const value = String(color || '#000000').replace('#', '');
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function texturePngDataUrl(rawTexture) {
  const texture = normalizeWorkspaceTextureAsset(rawTexture);
  if (!texture) throw new Error('A bundled Testing Space texture is invalid.');
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

async function buildWorldRegistrationFile(state, assetDraft, scene) {
  const worldPath = state.manifest?.data?.world;
  if (!worldPath) throw new Error('The selected game manifest does not define a world index.');
  const worldUrl = new URL(worldPath, state.contentRootUrl);
  const repositoryPath = repoPathFromUrl(worldUrl, REPOSITORY_ROOT_URL);
  const response = await fetch(worldUrl, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Unable to load the game world index (${response.status}).`);
  const repositoryWorld = await response.json();
  const existing = (assetDraft.files || []).find((file) => file.path === repositoryPath) || null;

  if (existing && canonicalJson(existing.baselinePayload) !== canonicalJson(repositoryWorld)) {
    throw new Error('The game world index changed on main after an earlier local staging step. Clear/reload the game draft before adding another testing level.');
  }

  const baselinePayload = existing ? existing.baselinePayload : repositoryWorld;
  const currentPayload = existing ? existing.currentPayload : repositoryWorld;
  return {
    path: repositoryPath,
    kind: 'world registration',
    baselinePayload,
    currentPayload: registerTestingSceneInWorld(currentPayload, scene),
  };
}

function cleanTestingImportQuery() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('testingImport');
    window.history.replaceState(null, '', url);
  } catch {
    // URL cleanup is cosmetic only.
  }
}

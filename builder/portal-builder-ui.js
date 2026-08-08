import { WORKSPACE_DRAFT_PREFIX } from './map-bridge-model.js';
import { readWorkspaceAssetDraft } from './workspace-asset-model.js';
import {
  applyPortalLink,
  deletePortalLink,
  nextPortalId,
  normalizePortal,
  normalizePortalAppearance,
  safePortalId,
  validatePortal,
} from './portal-builder-model.js';

const dom = Object.fromEntries([
  'backToWorkspaceLink', 'portalProjectLabel', 'portalStatus', 'newPortalBtn', 'deletePortalBtn',
  'sourceSceneSelect', 'portalList', 'portalForm', 'portalIdInput', 'portalXInput', 'portalYInput',
  'destinationSceneSelect', 'arrivalXInput', 'arrivalYInput', 'useDestinationSpawnBtn', 'twoWayInput',
  'portalTriggerSelect', 'portalRangeInput', 'appearanceModeSelect', 'portalSizeInput', 'styleAppearanceFields',
  'portalShapeSelect', 'portalColorInput', 'textureAppearanceFields', 'portalTextureSelect', 'portalTextureIdInput',
  'imageAppearanceFields', 'portalImagePathInput', 'portalRequirementSelect', 'portalRequirementFields',
  'portalRequirementIdInput', 'portalRequirementMessageInput', 'validatePortalBtn', 'savePortalBtn',
  'portalAppearanceSample', 'sourceMapDimensions', 'sourceMapPreview', 'destinationMapDimensions',
  'destinationMapPreview', 'portalRouteSummary', 'portalValidationList',
].map((id) => [id, document.getElementById(id)]));

const state = {
  projectId: '',
  draftKey: '',
  draft: null,
  sourceSceneId: '',
  selectedPortalId: '',
  previousPortalId: '',
  textureEntries: new Map(),
  tileColors: new Map(),
  contentRootUrl: null,
};

init().catch((error) => setStatus(`Portal Builder could not open: ${error.message}`, true));

async function init() {
  const params = new URL(window.location.href).searchParams;
  state.projectId = safePortalId(params.get('game'));
  state.sourceSceneId = safePortalId(params.get('scene'));
  if (!state.projectId) throw new Error('No game project was selected. Return to the Game Workspace and choose a game.');
  state.draftKey = `${WORKSPACE_DRAFT_PREFIX}${state.projectId}`;
  state.draft = readDraft();
  if (!Array.isArray(state.draft?.scenes) || !state.draft.scenes.length) {
    throw new Error('No saved workspace scenes were found. Open the Game Workspace and save the local draft first.');
  }
  if (!sceneById(state.sourceSceneId)) state.sourceSceneId = state.draft.scenes[0].id;

  dom.backToWorkspaceLink.href = `workspace.html?game=${encodeURIComponent(state.projectId)}`;
  dom.portalProjectLabel.textContent = `${state.projectId} • ${state.draft.scenes.length} map(s) in local workspace draft`;
  bindEvents();
  await loadVisualCatalog();
  renderSceneOptions();
  newPortal(false);
  setStatus('Portal Builder loaded. Changes are saved into the same local workspace draft used by Publish.');
}

function bindEvents() {
  dom.sourceSceneSelect.addEventListener('change', () => {
    state.sourceSceneId = dom.sourceSceneSelect.value;
    state.selectedPortalId = '';
    state.previousPortalId = '';
    newPortal(false);
  });
  dom.portalList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-portal-id]');
    if (button) selectPortal(button.dataset.portalId);
  });
  dom.newPortalBtn.addEventListener('click', () => newPortal(true));
  dom.deletePortalBtn.addEventListener('click', deleteSelectedPortal);
  dom.portalForm.addEventListener('submit', savePortal);
  dom.validatePortalBtn.addEventListener('click', validateCurrentPortal);
  dom.useDestinationSpawnBtn.addEventListener('click', useDestinationSpawn);
  dom.destinationSceneSelect.addEventListener('change', () => {
    useDestinationSpawn();
    renderDestinationMap();
    renderRouteSummary();
  });
  dom.sourceMapPreview.addEventListener('click', (event) => {
    const cell = event.target.closest('[data-map-x]');
    if (!cell) return;
    dom.portalXInput.value = cell.dataset.mapX;
    dom.portalYInput.value = cell.dataset.mapY;
    renderSourceMap();
    renderRouteSummary();
  });
  dom.destinationMapPreview.addEventListener('click', (event) => {
    const cell = event.target.closest('[data-map-x]');
    if (!cell) return;
    dom.arrivalXInput.value = cell.dataset.mapX;
    dom.arrivalYInput.value = cell.dataset.mapY;
    renderDestinationMap();
    renderRouteSummary();
  });
  dom.appearanceModeSelect.addEventListener('change', () => {
    updateAppearanceFields();
    renderAppearanceSample();
    renderSourceMap();
  });
  dom.portalTextureSelect.addEventListener('change', () => {
    if (dom.portalTextureSelect.value) dom.portalTextureIdInput.value = dom.portalTextureSelect.value;
    renderAppearanceSample();
    renderSourceMap();
  });
  [
    dom.portalShapeSelect, dom.portalColorInput, dom.portalSizeInput, dom.portalTextureIdInput,
    dom.portalImagePathInput, dom.portalTriggerSelect, dom.portalRangeInput, dom.twoWayInput,
    dom.portalRequirementSelect, dom.portalRequirementIdInput, dom.portalRequirementMessageInput,
    dom.portalIdInput, dom.portalXInput, dom.portalYInput, dom.arrivalXInput, dom.arrivalYInput,
  ].forEach((element) => {
    element.addEventListener('input', () => {
      updateRequirementFields();
      renderAppearanceSample();
      renderSourceMap();
      renderDestinationMap();
      renderRouteSummary();
    });
    element.addEventListener('change', () => {
      updateRequirementFields();
      renderAppearanceSample();
      renderSourceMap();
      renderDestinationMap();
      renderRouteSummary();
    });
  });
}

function readDraft() {
  const raw = localStorage.getItem(state.draftKey);
  if (!raw) return null;
  const draft = JSON.parse(raw);
  if (safePortalId(draft?.projectId) !== state.projectId) throw new Error('The saved workspace draft belongs to a different game.');
  return draft;
}

function persistScenes(nextScenes, message) {
  const nextDraft = {
    ...state.draft,
    scenes: nextScenes,
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(state.draftKey, JSON.stringify(nextDraft));
  state.draft = nextDraft;
  setStatus(message);
}

function sceneById(id) {
  return state.draft?.scenes?.find((scene) => safePortalId(scene?.id) === safePortalId(id)) || null;
}

function sourceScene() {
  return sceneById(state.sourceSceneId);
}

function destinationScene() {
  return sceneById(dom.destinationSceneSelect.value);
}

function sceneKind(scene) {
  return scene?.mapType || scene?.scene?.type || 'scene';
}

function sceneLabel(scene) {
  return `${scene?.name || scene?.id || 'Scene'} [${sceneKind(scene)}]`;
}

async function fetchJson(url, fallback = null) {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(String(response.status));
    return response.json();
  } catch (error) {
    if (fallback !== null) return fallback;
    throw error;
  }
}

async function loadVisualCatalog() {
  const manifestUrl = new URL(`../games/${state.projectId}/game.json`, window.location.href);
  const manifest = await fetchJson(manifestUrl, {});
  state.contentRootUrl = new URL(manifest.contentRoot || './', manifestUrl);
  const data = manifest.data || {};
  const [texturesPayload, tilesPayload] = await Promise.all([
    data.texturePack ? fetchJson(new URL(data.texturePack, state.contentRootUrl), { textures: [] }) : { textures: [] },
    data.tiles ? fetchJson(new URL(data.tiles, state.contentRootUrl), { tiles: [] }) : { tiles: [] },
  ]);

  for (const texture of texturesPayload.textures || []) {
    if (!texture?.id) continue;
    state.textureEntries.set(texture.id, {
      id: texture.id,
      name: texture.name || texture.id,
      color: texture.color || '#8d7bff',
      image: texture.image || '',
    });
  }
  const assetDraft = readWorkspaceAssetDraft(state.projectId);
  for (const texture of assetDraft.textures || []) {
    state.textureEntries.set(texture.id, {
      id: texture.id,
      name: `${texture.name || texture.id} (staged custom)`,
      color: texture.previewColor || '#8d7bff',
      image: texture.image || '',
    });
  }

  const textureById = state.textureEntries;
  for (const tile of tilesPayload.tiles || []) {
    if (!tile?.id) continue;
    state.tileColors.set(tile.id, tile.minimapColor || textureById.get(tile.texture)?.color || hashColor(tile.id));
  }
  for (const texture of assetDraft.textures || []) state.tileColors.set(texture.id, texture.previewColor || '#8d7bff');

  dom.portalTextureSelect.innerHTML = '';
  const blank = document.createElement('option');
  blank.value = '';
  blank.textContent = 'Choose a texture…';
  dom.portalTextureSelect.appendChild(blank);
  for (const entry of [...state.textureEntries.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    const option = document.createElement('option');
    option.value = entry.id;
    option.textContent = `${entry.name} (${entry.id})`;
    dom.portalTextureSelect.appendChild(option);
  }
}

function renderSceneOptions() {
  dom.sourceSceneSelect.innerHTML = '';
  dom.destinationSceneSelect.innerHTML = '';
  const blankDestination = document.createElement('option');
  blankDestination.value = '';
  blankDestination.textContent = 'Choose destination…';
  dom.destinationSceneSelect.appendChild(blankDestination);
  for (const scene of state.draft.scenes) {
    const sourceOption = document.createElement('option');
    sourceOption.value = scene.id;
    sourceOption.textContent = sceneLabel(scene);
    dom.sourceSceneSelect.appendChild(sourceOption);
    const destinationOption = sourceOption.cloneNode(true);
    dom.destinationSceneSelect.appendChild(destinationOption);
  }
  dom.sourceSceneSelect.value = state.sourceSceneId;
}

function portalsForSource() {
  return (sourceScene()?.objects?.portals || []).map((portal, index) => normalizePortal(portal, index));
}

function renderPortalList() {
  dom.portalList.innerHTML = '';
  const portals = portalsForSource();
  if (!portals.length) {
    const empty = document.createElement('p');
    empty.className = 'small';
    empty.textContent = 'No portals on this map yet.';
    dom.portalList.appendChild(empty);
    return;
  }
  for (const portal of portals) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `secondary-btn portal-list-button${portal.id === state.selectedPortalId ? ' active' : ''}`;
    button.dataset.portalId = portal.id;
    const label = document.createElement('span');
    label.textContent = portal.id;
    const detail = document.createElement('small');
    detail.textContent = portal.targetScene ? `→ ${portal.targetScene}` : 'Unassigned';
    button.append(label, detail);
    dom.portalList.appendChild(button);
  }
}

function selectPortal(id, announce = true) {
  const portal = portalsForSource().find((entry) => entry.id === id);
  if (!portal) return;
  state.selectedPortalId = portal.id;
  state.previousPortalId = portal.id;
  populateForm(portal);
  renderAllVisuals();
  if (announce) setStatus(`Editing ${portal.id}.`);
}

function newPortal(announce = true) {
  const scene = sourceScene();
  if (!scene) return;
  state.selectedPortalId = '';
  state.previousPortalId = '';
  const defaultDestination = state.draft.scenes.find((entry) => entry.id !== scene.id) || scene;
  const spawn = scene.spawn || { x: 0, y: 0 };
  const destinationSpawn = defaultDestination?.spawn || { x: 0, y: 0 };
  populateForm(normalizePortal({
    id: nextPortalId(scene),
    x: Math.floor(Number(spawn.x) || 0),
    y: Math.floor(Number(spawn.y) || 0),
    targetScene: defaultDestination?.id || '',
    targetKind: sceneKind(defaultDestination),
    arrival: { x: Math.floor(Number(destinationSpawn.x) || 0), y: Math.floor(Number(destinationSpawn.y) || 0) },
    appearance: { mode: 'style', shape: 'ring', color: '#8d7bff', size: 24 },
  }));
  renderAllVisuals();
  if (announce) setStatus('New portal ready. Click the maps to choose source and arrival tiles, then save.');
}

function populateForm(portalValue) {
  const portal = normalizePortal(portalValue);
  dom.portalIdInput.value = portal.id;
  dom.portalXInput.value = String(Math.floor(portal.x));
  dom.portalYInput.value = String(Math.floor(portal.y));
  dom.destinationSceneSelect.value = portal.targetScene && sceneById(portal.targetScene) ? portal.targetScene : '';
  const destination = sceneById(dom.destinationSceneSelect.value);
  const arrival = portal.arrival || destination?.spawn || { x: 0, y: 0 };
  dom.arrivalXInput.value = String(Math.floor(Number(arrival.x) || 0));
  dom.arrivalYInput.value = String(Math.floor(Number(arrival.y) || 0));
  dom.twoWayInput.checked = portal.linkMode === 'two-way';
  dom.portalTriggerSelect.value = portal.trigger;
  dom.portalRangeInput.value = String(portal.range);
  dom.appearanceModeSelect.value = portal.appearance.mode;
  dom.portalSizeInput.value = String(portal.appearance.size);
  dom.portalShapeSelect.value = portal.appearance.shape;
  dom.portalColorInput.value = portal.appearance.color;
  dom.portalTextureIdInput.value = portal.appearance.textureId;
  dom.portalTextureSelect.value = state.textureEntries.has(portal.appearance.textureId) ? portal.appearance.textureId : '';
  dom.portalImagePathInput.value = portal.appearance.imagePath;
  dom.portalRequirementSelect.value = portal.requirement.type;
  dom.portalRequirementIdInput.value = portal.requirement.id;
  dom.portalRequirementMessageInput.value = portal.requirement.message;
  updateAppearanceFields();
  updateRequirementFields();
}

function currentPortalFromForm() {
  const destination = destinationScene();
  return normalizePortal({
    id: dom.portalIdInput.value,
    x: Number(dom.portalXInput.value),
    y: Number(dom.portalYInput.value),
    targetScene: dom.destinationSceneSelect.value,
    targetKind: sceneKind(destination),
    arrival: {
      x: Number(dom.arrivalXInput.value),
      y: Number(dom.arrivalYInput.value),
    },
    trigger: dom.portalTriggerSelect.value,
    range: Number(dom.portalRangeInput.value),
    appearance: currentAppearance(),
    requirement: {
      type: dom.portalRequirementSelect.value,
      id: dom.portalRequirementIdInput.value,
      message: dom.portalRequirementMessageInput.value,
    },
    linkMode: dom.twoWayInput.checked ? 'two-way' : 'one-way',
    pairedPortalId: portalsForSource().find((entry) => entry.id === state.previousPortalId)?.pairedPortalId || '',
  });
}

function currentAppearance() {
  return normalizePortalAppearance({
    mode: dom.appearanceModeSelect.value,
    shape: dom.portalShapeSelect.value,
    color: dom.portalColorInput.value,
    size: Number(dom.portalSizeInput.value),
    textureId: dom.portalTextureIdInput.value || dom.portalTextureSelect.value,
    imagePath: dom.portalImagePathInput.value,
  });
}

function validateCurrentPortal() {
  const portal = currentPortalFromForm();
  const errors = validatePortal(portal, sourceScene(), state.draft.scenes);
  renderValidation(errors);
  if (errors.length) setStatus(errors.join(' '), true);
  else setStatus('Portal link is valid. Save it to apply the connection to the workspace draft.');
}

function savePortal(event) {
  event.preventDefault();
  try {
    const portal = currentPortalFromForm();
    const source = sourceScene();
    const duplicate = portalsForSource().find((entry) => entry.id === portal.id && entry.id !== state.previousPortalId);
    if (duplicate) throw new Error(`Portal ID “${portal.id}” already exists on this source map.`);
    const result = applyPortalLink({
      scenes: state.draft.scenes,
      sourceSceneId: source.id,
      portal,
      previousPortalId: state.previousPortalId,
      twoWay: dom.twoWayInput.checked,
    });
    persistScenes(result.scenes, result.returnPortal
      ? `Portal “${result.portal.id}” saved with automatic return portal “${result.returnPortal.id}”.`
      : `Portal “${result.portal.id}” saved to the local workspace draft.`);
    state.selectedPortalId = result.portal.id;
    state.previousPortalId = result.portal.id;
    renderSceneOptions();
    dom.sourceSceneSelect.value = state.sourceSceneId;
    selectPortal(result.portal.id, false);
    renderValidation([]);
  } catch (error) {
    renderValidation([error.message]);
    setStatus(`Portal was not saved: ${error.message}`, true);
  }
}

function deleteSelectedPortal() {
  if (!state.selectedPortalId) return setStatus('Choose a saved portal to delete.', true);
  const id = state.selectedPortalId;
  if (!window.confirm(`Delete portal “${id}”${dom.twoWayInput.checked ? ' and its paired return portal' : ''}?`)) return;
  try {
    const nextScenes = deletePortalLink({ scenes: state.draft.scenes, sourceSceneId: state.sourceSceneId, portalId: id });
    persistScenes(nextScenes, `Portal “${id}” deleted from the local workspace draft.`);
    state.selectedPortalId = '';
    state.previousPortalId = '';
    renderSceneOptions();
    dom.sourceSceneSelect.value = state.sourceSceneId;
    newPortal(false);
  } catch (error) {
    setStatus(`Portal was not deleted: ${error.message}`, true);
  }
}

function useDestinationSpawn() {
  const scene = destinationScene();
  if (!scene) return;
  dom.arrivalXInput.value = String(Math.floor(Number(scene.spawn?.x) || 0));
  dom.arrivalYInput.value = String(Math.floor(Number(scene.spawn?.y) || 0));
  renderDestinationMap();
  renderRouteSummary();
}

function updateAppearanceFields() {
  const mode = dom.appearanceModeSelect.value;
  dom.styleAppearanceFields.hidden = mode !== 'style';
  dom.textureAppearanceFields.hidden = mode !== 'texture';
  dom.imageAppearanceFields.hidden = mode !== 'image';
}

function updateRequirementFields() {
  dom.portalRequirementFields.hidden = dom.portalRequirementSelect.value === 'none';
}

function renderAllVisuals() {
  renderPortalList();
  renderSourceMap();
  renderDestinationMap();
  renderAppearanceSample();
  renderRouteSummary();
  renderValidation([]);
}

function renderSourceMap() {
  renderMap(dom.sourceMapPreview, sourceScene(), {
    dimensions: dom.sourceMapDimensions,
    mode: 'source',
    selectedX: Number(dom.portalXInput.value),
    selectedY: Number(dom.portalYInput.value),
  });
}

function renderDestinationMap() {
  renderMap(dom.destinationMapPreview, destinationScene(), {
    dimensions: dom.destinationMapDimensions,
    mode: 'destination',
    selectedX: Number(dom.arrivalXInput.value),
    selectedY: Number(dom.arrivalYInput.value),
  });
}

function renderMap(container, scene, { dimensions, mode, selectedX, selectedY }) {
  container.innerHTML = '';
  if (!scene) {
    dimensions.textContent = '';
    const empty = document.createElement('p');
    empty.className = 'small';
    empty.textContent = 'Choose a map.';
    container.appendChild(empty);
    return;
  }
  dimensions.textContent = `${scene.width} × ${scene.height}`;
  container.style.setProperty('--portal-grid-width', String(scene.width));
  const portals = mode === 'source'
    ? (scene.objects?.portals || []).map((entry, index) => normalizePortal(entry, index))
    : [];
  for (let y = 0; y < scene.height; y += 1) {
    for (let x = 0; x < scene.width; x += 1) {
      const cell = document.createElement('div');
      cell.className = 'portal-map-cell';
      cell.dataset.mapX = String(x);
      cell.dataset.mapY = String(y);
      const tileId = scene.tiles?.[y]?.[x] || 'empty';
      cell.style.background = state.tileColors.get(tileId) || hashColor(tileId);
      cell.title = `${x}, ${y} • ${tileId}`;

      if (Math.floor(Number(scene.spawn?.x)) === x && Math.floor(Number(scene.spawn?.y)) === y) {
        const spawn = document.createElement('span');
        spawn.className = 'spawn-marker';
        spawn.title = 'Map spawn';
        cell.appendChild(spawn);
      }

      if (mode === 'source') {
        for (const portal of portals.filter((entry) => Math.floor(entry.x) === x && Math.floor(entry.y) === y)) {
          const marker = document.createElement('span');
          marker.className = 'portal-marker';
          marker.title = portal.id;
          applyAppearance(marker, portal.id === state.selectedPortalId ? currentAppearance() : portal.appearance, true);
          cell.appendChild(marker);
        }
        if (!state.selectedPortalId && Math.floor(selectedX) === x && Math.floor(selectedY) === y) {
          const marker = document.createElement('span');
          marker.className = 'portal-marker';
          marker.title = 'New portal';
          applyAppearance(marker, currentAppearance(), true);
          cell.appendChild(marker);
        }
      } else if (Math.floor(selectedX) === x && Math.floor(selectedY) === y) {
        const arrival = document.createElement('span');
        arrival.className = 'arrival-marker';
        arrival.title = 'Portal arrival';
        cell.appendChild(arrival);
      }
      container.appendChild(cell);
    }
  }
}

function renderAppearanceSample() {
  dom.portalAppearanceSample.innerHTML = '';
  const visual = document.createElement('div');
  visual.className = 'portal-shape';
  visual.style.width = `${Math.min(56, Math.max(12, currentAppearance().size * 1.6))}px`;
  visual.style.height = visual.style.width;
  applyAppearance(visual, currentAppearance(), false);
  dom.portalAppearanceSample.appendChild(visual);
}

function applyAppearance(element, appearanceValue, mapMarker) {
  const appearance = normalizePortalAppearance(appearanceValue);
  const baseClass = mapMarker ? 'portal-marker' : 'portal-shape';
  element.className = `${baseClass} ${appearance.shape}`;
  element.style.backgroundImage = '';
  element.style.backgroundSize = '';
  element.style.backgroundPosition = '';
  element.style.backgroundRepeat = '';
  element.style.backgroundColor = '';
  element.style.color = appearance.color;
  element.style.borderColor = '';

  let image = '';
  let color = appearance.color;
  if (appearance.mode === 'texture') {
    const entry = state.textureEntries.get(appearance.textureId);
    image = entry?.image || '';
    color = entry?.color || color;
  } else if (appearance.mode === 'image') {
    image = appearance.imagePath;
  }

  if (image) {
    const previewUrl = previewImageUrl(image);
    element.style.backgroundImage = `url("${previewUrl.replace(/"/g, '%22')}")`;
    element.style.backgroundSize = 'contain';
    element.style.backgroundPosition = 'center';
    element.style.backgroundRepeat = 'no-repeat';
    element.style.backgroundColor = 'transparent';
    if (appearance.shape === 'ring') element.style.borderColor = color;
    return;
  }
  element.style.backgroundColor = appearance.shape === 'ring' ? 'transparent' : color;
  element.style.color = color;
  if (appearance.shape === 'ring') element.style.borderColor = color;
}

function previewImageUrl(path) {
  if (/^data:image\//i.test(path) || /^https?:\/\//i.test(path)) return path;
  try {
    return new URL(path, state.contentRootUrl || window.location.href).href;
  } catch {
    return path;
  }
}

function renderRouteSummary() {
  const source = sourceScene();
  const destination = destinationScene();
  if (!source || !destination) {
    dom.portalRouteSummary.textContent = 'Choose a destination map to complete this portal route.';
    return;
  }
  const mode = dom.twoWayInput.checked ? 'two-way' : 'one-way';
  const trigger = dom.portalTriggerSelect.value === 'touch' ? 'walk into it' : 'press Interact';
  const lock = dom.portalRequirementSelect.value === 'none' ? 'no lock' : dom.portalRequirementSelect.selectedOptions[0]?.textContent || 'locked';
  dom.portalRouteSummary.textContent = `${source.name || source.id} (${dom.portalXInput.value}, ${dom.portalYInput.value}) → ${destination.name || destination.id} (${dom.arrivalXInput.value}, ${dom.arrivalYInput.value}) • ${mode} • ${trigger} • ${lock}`;
}

function renderValidation(errors) {
  dom.portalValidationList.innerHTML = '';
  const items = errors.length ? errors : ['Source position, destination, arrival tile, appearance, and lock settings are ready for validation.'];
  for (const text of items) {
    const item = document.createElement('div');
    item.className = `portal-validation-item ${errors.length ? 'error' : 'ok'}`;
    item.textContent = text;
    dom.portalValidationList.appendChild(item);
  }
}

function hashColor(value) {
  let hash = 0;
  for (const char of String(value || 'tile')) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 28% 48%)`;
}

function setStatus(message, isError = false) {
  dom.portalStatus.textContent = message;
  dom.portalStatus.classList.toggle('error', isError);
}
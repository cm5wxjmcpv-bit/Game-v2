import {
  LEGACY_OBJECT_TYPES,
  applyLegacyObject,
  ensureLegacyObjectCollections,
  legacyObjectConfig,
  legacyObjectExtras,
  legacyObjectLabel,
  legacyObjectMarkerColor,
  normalizeLegacyObject,
  removeLegacyObject,
  validateLegacyObject,
} from './workspace-object-model.js';
import { activateWorkspaceTab, deactivateWorkspaceTab } from './workspace-tabs.js';

const DRAFT_PREFIX = 'pixel_engine_builder_workspace_';

const state = {
  projectId: '',
  draft: null,
  sceneId: '',
  type: 'portals',
  selectedIndex: -1,
};

const dom = {};

installStyles();
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
else install();

function installStyles() {
  if (document.querySelector('link[href="workspace-objects.css"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'workspace-objects.css';
  document.head.appendChild(link);
}

function install() {
  const tabBar = document.querySelector('.workspace-tabs');
  const publishButton = document.getElementById('workspacePublishTabBtn');
  const publishTab = document.getElementById('workspacePublishTab');
  if (!tabBar || !publishButton || !publishTab || document.getElementById('workspaceObjectsTabBtn')) return;

  const button = document.createElement('button');
  button.id = 'workspaceObjectsTabBtn';
  button.type = 'button';
  button.className = 'tab-btn';
  button.textContent = 'Scene Objects';
  button.setAttribute('role', 'tab');
  button.setAttribute('aria-selected', 'false');
  button.setAttribute('aria-controls', 'workspaceObjectsTab');
  tabBar.insertBefore(button, publishButton);

  const section = document.createElement('section');
  section.id = 'workspaceObjectsTab';
  section.className = 'workspace-object-grid workspace-tab';
  section.setAttribute('role', 'tabpanel');
  section.setAttribute('aria-labelledby', 'workspaceObjectsTabBtn');
  section.setAttribute('aria-hidden', 'true');
  section.innerHTML = objectEditorMarkup();
  publishTab.parentElement.insertBefore(section, publishTab);

  Object.assign(dom, Object.fromEntries([
    'workspaceObjectsTabBtn', 'workspaceObjectsTab', 'objectSceneSelect', 'objectTypeSelect',
    'newLegacyObjectBtn', 'deleteLegacyObjectBtn', 'legacyObjectList', 'objectSceneHeading',
    'objectSceneDimensions', 'objectScenePreview', 'legacyObjectForm', 'objectXInput',
    'objectYInput', 'portalFields', 'portalTargetTownInput', 'portalTargetSceneInput',
    'portalTargetLevelInput', 'portalLevelsInput', 'shopFields', 'objectShopIdInput',
    'enemySpawnFields', 'objectEnemyIdInput', 'battleTriggerFields',
    'objectEncounterIdInput', 'objectBattleEnemyIdInput', 'objectTriggerWidthInput',
    'objectTriggerHeightInput', 'objectExtraJsonInput', 'saveLegacyObjectBtn',
    'rewardPickupFields', 'objectPickupIdInput', 'objectPickupNameInput',
    'objectRewardPackageIdInput', 'objectLootTableIdInput', 'objectRespawnSecondsInput',
    'objectStatus', 'saveDraftBtn', 'clearDraftBtn', 'exportSceneBtn', 'exportBundleBtn',
    'projectSelect', 'sceneSelect', 'workspaceSceneTabBtn', 'workspaceActorTabBtn',
    'workspaceWeaponTabBtn',
    'workspacePublishTabBtn', 'workspaceSceneTab', 'workspaceActorTab', 'workspacePublishTab',
  ].map((id) => [id, document.getElementById(id)])));

  bindEvents();
  window.addEventListener('pixel-engine-workspace-content-changed', syncFromWorkspaceState);
}

function objectEditorMarkup() {
  const typeOptions = LEGACY_OBJECT_TYPES
    .map((type) => `<option value="${type}">${legacyObjectConfig(type).label}</option>`)
    .join('');
  const legend = LEGACY_OBJECT_TYPES
    .map((type) => `<span><i style="background:${legacyObjectMarkerColor(type)}"></i>${legacyObjectConfig(type).label}</span>`)
    .join('');

  return `
    <aside class="panel workspace-object-panel">
      <h2>Scene Objects</h2>
      <label class="field-label" for="objectSceneSelect">Selected Scene</label>
      <select id="objectSceneSelect" class="text-input"></select>
      <label class="field-label" for="objectTypeSelect">Object Type</label>
      <select id="objectTypeSelect" class="text-input">${typeOptions}</select>
      <div class="workspace-inline-actions">
        <button id="newLegacyObjectBtn" type="button">New Object</button>
        <button id="deleteLegacyObjectBtn" type="button" class="danger-btn">Delete</button>
      </div>
      <div id="legacyObjectList" class="item-list workspace-object-list"></div>
    </aside>

    <section class="panel workspace-object-panel">
      <div class="workspace-preview-heading">
        <div>
          <h2 id="objectSceneHeading">Object Preview</h2>
          <p class="small">Click a cell to set the selected object's coordinates. Click a colored marker to select it.</p>
        </div>
        <span id="objectSceneDimensions" class="workspace-chip"></span>
      </div>
      <div id="objectScenePreview" class="workspace-object-preview" aria-label="Legacy scene object preview"></div>
      <div class="workspace-object-legend"><span><i style="background:#38bdf8"></i>Player spawn</span>${legend}</div>
    </section>

    <section class="panel workspace-object-panel">
      <h2>Object Editor</h2>
      <form id="legacyObjectForm" class="item-form" novalidate>
        <div class="workspace-two-column">
          <div><label class="field-label" for="objectXInput">X</label><input id="objectXInput" class="text-input" type="number" step="1" min="0" /></div>
          <div><label class="field-label" for="objectYInput">Y</label><input id="objectYInput" class="text-input" type="number" step="1" min="0" /></div>
        </div>

        <div id="portalFields" class="workspace-object-fields">
          <h3>Portal Destination</h3>
          <label class="field-label" for="portalTargetTownInput">Target Town</label>
          <input id="portalTargetTownInput" class="text-input" type="text" />
          <label class="field-label" for="portalTargetSceneInput">Target Scene</label>
          <input id="portalTargetSceneInput" class="text-input" type="text" />
          <label class="field-label" for="portalTargetLevelInput">Target Level</label>
          <input id="portalTargetLevelInput" class="text-input" type="text" />
          <label class="field-label" for="portalLevelsInput">Level Choices</label>
          <textarea id="portalLevelsInput" class="text-input" rows="3" placeholder="level_one, level_two"></textarea>
        </div>

        <div id="shopFields" class="workspace-object-fields" hidden>
          <h3>Shop</h3>
          <label class="field-label" for="objectShopIdInput">Shop ID</label>
          <input id="objectShopIdInput" class="text-input" type="text" />
        </div>

        <div id="enemySpawnFields" class="workspace-object-fields" hidden>
          <h3>Enemy Spawn</h3>
          <label class="field-label" for="objectEnemyIdInput">Enemy ID</label>
          <input id="objectEnemyIdInput" class="text-input" type="text" />
        </div>

        <div id="battleTriggerFields" class="workspace-object-fields" hidden>
          <h3>Battle Trigger</h3>
          <label class="field-label" for="objectEncounterIdInput">Encounter ID</label>
          <input id="objectEncounterIdInput" class="text-input" type="text" />
          <label class="field-label" for="objectBattleEnemyIdInput">Enemy ID</label>
          <input id="objectBattleEnemyIdInput" class="text-input" type="text" />
          <div class="workspace-two-column">
            <div><label class="field-label" for="objectTriggerWidthInput">Area Width</label><input id="objectTriggerWidthInput" class="text-input" type="number" step="1" min="1" /></div>
            <div><label class="field-label" for="objectTriggerHeightInput">Area Height</label><input id="objectTriggerHeightInput" class="text-input" type="number" step="1" min="1" /></div>
          </div>
        </div>

        <div id="rewardPickupFields" class="workspace-object-fields" hidden>
          <h3>Chest / Map Pickup Reward</h3>
          <label class="field-label" for="objectPickupIdInput">Pickup ID</label>
          <input id="objectPickupIdInput" class="text-input" type="text" placeholder="treasure_1" />
          <label class="field-label" for="objectPickupNameInput">Display Name</label>
          <input id="objectPickupNameInput" class="text-input" type="text" />
          <label class="field-label" for="objectRewardPackageIdInput">Fixed Reward Package ID</label>
          <input id="objectRewardPackageIdInput" class="text-input" type="text" />
          <label class="field-label" for="objectLootTableIdInput">Or Reusable Loot Table ID</label>
          <input id="objectLootTableIdInput" class="text-input" type="text" />
          <label class="field-label" for="objectRespawnSecondsInput">Respawn Time (seconds; 0 = never)</label>
          <input id="objectRespawnSecondsInput" class="text-input" type="number" min="0" step="1" value="0" />
        </div>

        <h3>Additional JSON</h3>
        <p class="small">Fields not represented above remain editable here and are preserved in the scene file.</p>
        <textarea id="objectExtraJsonInput" class="text-input workspace-object-extra" rows="8">{}</textarea>
        <button id="saveLegacyObjectBtn" type="submit">Save Object</button>
      </form>
      <div id="objectStatus" class="message" role="status" aria-live="polite"></div>
    </section>
  `;
}

function bindEvents() {
  dom.workspaceObjectsTabBtn.addEventListener('click', openObjectTab);
  for (const id of ['workspaceSceneTabBtn', 'workspaceActorTabBtn', 'workspaceWeaponTabBtn', 'workspacePublishTabBtn']) {
    dom[id].addEventListener('click', closeObjectTab);
  }
  dom.objectSceneSelect.addEventListener('change', () => {
    state.sceneId = dom.objectSceneSelect.value;
    state.selectedIndex = -1;
    renderAll();
  });
  dom.objectTypeSelect.addEventListener('change', () => {
    state.type = dom.objectTypeSelect.value;
    state.selectedIndex = -1;
    renderAll();
  });
  dom.newLegacyObjectBtn.addEventListener('click', newObject);
  dom.deleteLegacyObjectBtn.addEventListener('click', deleteObject);
  dom.legacyObjectList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-object-index]');
    if (!button) return;
    state.selectedIndex = Number(button.dataset.objectIndex);
    renderAll();
  });
  dom.objectScenePreview.addEventListener('click', onPreviewClick);
  dom.legacyObjectForm.addEventListener('submit', saveObject);

  dom.saveDraftBtn.addEventListener('click', mergeObjectsAfterWorkspaceSave);
  dom.clearDraftBtn.addEventListener('click', () => {
    if (state.projectId === currentProjectId()) {
      state.draft = null;
      state.sceneId = '';
      state.selectedIndex = -1;
    }
  });
  dom.projectSelect.addEventListener('change', () => {
    state.draft = null;
    state.projectId = '';
    state.sceneId = '';
    state.selectedIndex = -1;
  });
  dom.exportSceneBtn.addEventListener('click', exportSceneFromMergedDraft, true);
  dom.exportBundleBtn.addEventListener('click', exportBundleFromMergedDraft, true);
}

function openObjectTab() {
  activateWorkspaceTab(dom.workspaceObjectsTab, dom.workspaceObjectsTabBtn);
  refreshFromWorkspaceDraft();
}

function closeObjectTab() {
  deactivateWorkspaceTab(dom.workspaceObjectsTab, dom.workspaceObjectsTabBtn);
}

function currentProjectId() {
  return String(dom.projectSelect?.value || '').trim();
}

function draftKey(projectId = currentProjectId()) {
  return `${DRAFT_PREFIX}${projectId}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readDraft(projectId = currentProjectId()) {
  const raw = localStorage.getItem(draftKey(projectId));
  if (!raw) return null;
  const draft = JSON.parse(raw);
  if (draft.projectId !== projectId || !Array.isArray(draft.scenes)) return null;
  return draft;
}

function mergeObjectCollections(freshDraft, objectDraft) {
  if (!freshDraft || !objectDraft || freshDraft.projectId !== objectDraft.projectId) return freshDraft;
  const sourceById = new Map(objectDraft.scenes.map((scene) => [scene.id, ensureLegacyObjectCollections(scene)]));
  return {
    ...freshDraft,
    scenes: freshDraft.scenes.map((scene) => {
      const source = sourceById.get(scene.id);
      return source ? { ...scene, objects: clone(source.objects) } : scene;
    }),
  };
}

function mergeObjectsAfterWorkspaceSave(event) {
  const projectId = currentProjectId();
  if (!state.draft || state.projectId !== projectId) return;
  const fresh = readDraft(projectId);
  if (!fresh) return;
  const merged = mergeObjectCollections(fresh, state.draft);
  try {
    localStorage.setItem(draftKey(projectId), JSON.stringify(merged));
  } catch (error) {
    dom.saveDraftBtn.dataset.saveStatus = 'error';
    event?.preventDefault();
    event?.stopImmediatePropagation();
    setStatus(`Scene objects were not saved in browser storage: ${error.message}`, true);
  }
}

function refreshFromWorkspaceDraft() {
  dom.saveDraftBtn.click();
  if (dom.saveDraftBtn.dataset.saveStatus === 'error') {
    return setStatus('The current workspace draft could not be saved before loading scene objects.', true);
  }
  const projectId = currentProjectId();
  const draft = readDraft(projectId);
  if (!draft) return setStatus('The current workspace draft could not be loaded.', true);
  state.projectId = projectId;
  state.draft = {
    ...draft,
    scenes: draft.scenes.map(ensureLegacyObjectCollections),
  };
  const preferredScene = dom.sceneSelect?.value;
  state.sceneId = state.draft.scenes.some((scene) => scene.id === preferredScene)
    ? preferredScene
    : state.draft.scenes[0]?.id || '';
  state.selectedIndex = -1;
  renderAll();
  setStatus('Legacy scene objects loaded from the current package draft.');
}

function selectedScene() {
  return state.draft?.scenes?.find((scene) => scene.id === state.sceneId) || null;
}

function selectedList() {
  return selectedScene()?.objects?.[state.type] || [];
}

function selectedObject() {
  return selectedList()[state.selectedIndex] || null;
}

function renderAll() {
  renderSceneOptions();
  renderObjectList();
  renderForm();
  renderPreview();
}

function renderSceneOptions() {
  dom.objectSceneSelect.innerHTML = '';
  for (const scene of state.draft?.scenes || []) {
    const option = document.createElement('option');
    option.value = scene.id;
    option.textContent = `${scene.name || scene.id} [${scene._workspaceKind || 'scene'}]`;
    dom.objectSceneSelect.appendChild(option);
  }
  dom.objectSceneSelect.value = state.sceneId;
  dom.objectTypeSelect.value = state.type;
}

function renderObjectList() {
  dom.legacyObjectList.innerHTML = '';
  const list = selectedList();
  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'workspace-object-empty';
    empty.textContent = `No ${legacyObjectConfig(state.type).label.toLowerCase()} in this scene.`;
    dom.legacyObjectList.appendChild(empty);
    return;
  }
  list.forEach((object, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'secondary-btn workspace-list-button';
    button.classList.toggle('active', index === state.selectedIndex);
    button.dataset.objectIndex = String(index);
    button.innerHTML = `<span>${escapeHtml(legacyObjectLabel(state.type, object, index))}<br><small>${Number(object.x)}, ${Number(object.y)}</small></span>`;
    dom.legacyObjectList.appendChild(button);
  });
}

function newObject() {
  state.selectedIndex = -1;
  renderObjectList();
  renderForm();
}

function renderForm() {
  const scene = selectedScene();
  const object = selectedObject() || { x: Math.floor(scene?.spawn?.x || 0), y: Math.floor(scene?.spawn?.y || 0) };
  const normalized = normalizeLegacyObject(state.type, object);
  dom.objectXInput.value = normalized.x;
  dom.objectYInput.value = normalized.y;
  dom.portalTargetTownInput.value = normalized.targetTown || '';
  dom.portalTargetSceneInput.value = normalized.targetScene || '';
  dom.portalTargetLevelInput.value = normalized.targetLevel || '';
  dom.portalLevelsInput.value = normalized.levels?.join(', ') || '';
  dom.objectShopIdInput.value = normalized.shopId || '';
  dom.objectEnemyIdInput.value = normalized.enemyId || '';
  dom.objectEncounterIdInput.value = normalized.encounterId || '';
  dom.objectBattleEnemyIdInput.value = normalized.enemyId || '';
  dom.objectTriggerWidthInput.value = normalized.width ?? '';
  dom.objectTriggerHeightInput.value = normalized.height ?? '';
  dom.objectPickupIdInput.value = normalized.id || '';
  dom.objectPickupNameInput.value = normalized.name || '';
  dom.objectRewardPackageIdInput.value = normalized.rewardPackageId || '';
  dom.objectLootTableIdInput.value = normalized.lootTableId || '';
  dom.objectRespawnSecondsInput.value = normalized.respawnSeconds ?? 0;
  dom.objectExtraJsonInput.value = JSON.stringify(legacyObjectExtras(state.type, normalized), null, 2);
  dom.portalFields.hidden = state.type !== 'portals';
  dom.shopFields.hidden = state.type !== 'shops';
  dom.enemySpawnFields.hidden = state.type !== 'enemySpawns';
  dom.battleTriggerFields.hidden = state.type !== 'battleTriggers';
  dom.rewardPickupFields.hidden = state.type !== 'rewardPickups';
  dom.deleteLegacyObjectBtn.disabled = state.selectedIndex < 0;
  dom.saveLegacyObjectBtn.textContent = state.selectedIndex < 0 ? 'Add Object' : 'Save Object';
}

function objectFromForm() {
  let extras;
  try {
    extras = JSON.parse(dom.objectExtraJsonInput.value || '{}');
  } catch {
    throw new Error('Additional JSON must contain valid JSON.');
  }
  if (!extras || Array.isArray(extras) || typeof extras !== 'object') throw new Error('Additional JSON must be an object.');

  const value = {
    ...extras,
    x: dom.objectXInput.value,
    y: dom.objectYInput.value,
  };
  if (state.type === 'portals') {
    value.targetTown = dom.portalTargetTownInput.value;
    value.targetScene = dom.portalTargetSceneInput.value;
    value.targetLevel = dom.portalTargetLevelInput.value;
    value.levels = dom.portalLevelsInput.value.split(/[\n,]+/).map((entry) => entry.trim()).filter(Boolean);
  } else if (state.type === 'shops') {
    value.shopId = dom.objectShopIdInput.value;
  } else if (state.type === 'enemySpawns') {
    value.enemyId = dom.objectEnemyIdInput.value;
  } else if (state.type === 'battleTriggers') {
    value.encounterId = dom.objectEncounterIdInput.value;
    value.enemyId = dom.objectBattleEnemyIdInput.value;
    value.width = dom.objectTriggerWidthInput.value;
    value.height = dom.objectTriggerHeightInput.value;
  } else if (state.type === 'rewardPickups') {
    value.id = dom.objectPickupIdInput.value;
    value.name = dom.objectPickupNameInput.value;
    value.rewardPackageId = dom.objectRewardPackageIdInput.value;
    value.lootTableId = dom.objectLootTableIdInput.value;
    value.respawnSeconds = dom.objectRespawnSecondsInput.value;
  }
  return normalizeLegacyObject(state.type, value);
}

function saveObject(event) {
  event.preventDefault();
  const scene = selectedScene();
  if (!scene) return setStatus('Select a scene first.', true);
  let object;
  try {
    object = objectFromForm();
  } catch (error) {
    return setStatus(error.message, true);
  }
  const errors = validateLegacyObject(state.type, object, scene);
  if (errors.length) return setStatus(errors.join(' '), true);

  const previousDraft = state.draft;
  const previousIndex = state.selectedIndex;
  const wasNew = previousIndex < 0;
  const nextScene = applyLegacyObject(scene, state.type, state.selectedIndex, object);
  state.draft = {
    ...state.draft,
    scenes: state.draft.scenes.map((entry) => entry.id === scene.id ? nextScene : entry),
  };
  syncSceneObjectsToWorkspace(nextScene);
  if (wasNew) state.selectedIndex = nextScene.objects[state.type].length - 1;
  try {
    persistObjectDraft();
  } catch (error) {
    state.draft = previousDraft;
    state.selectedIndex = previousIndex;
    renderAll();
    return setStatus(`Scene object was not saved: ${error.message}`, true);
  }
  renderAll();
  setStatus(`${legacyObjectConfig(state.type).singular} saved in ${scene.name || scene.id}.`);
}

function deleteObject() {
  const scene = selectedScene();
  if (!scene || state.selectedIndex < 0) return;
  const label = legacyObjectLabel(state.type, selectedObject(), state.selectedIndex);
  if (!window.confirm(`Delete ${label}?`)) return;
  const previousDraft = state.draft;
  const previousIndex = state.selectedIndex;
  const nextScene = removeLegacyObject(scene, state.type, state.selectedIndex);
  state.draft = {
    ...state.draft,
    scenes: state.draft.scenes.map((entry) => entry.id === scene.id ? nextScene : entry),
  };
  syncSceneObjectsToWorkspace(nextScene);
  state.selectedIndex = -1;
  try {
    persistObjectDraft();
  } catch (error) {
    state.draft = previousDraft;
    state.selectedIndex = previousIndex;
    renderAll();
    return setStatus(`Scene object was not deleted: ${error.message}`, true);
  }
  renderAll();
  setStatus(`${legacyObjectConfig(state.type).singular} deleted.`);
}

function syncSceneObjectsToWorkspace(scene) {
  const live = window.pixelEngineWorkspace?.getState?.();
  const target = live?.scenes?.find((entry) => entry.id === scene.id);
  if (target) target.objects = clone(scene.objects);
}

function syncFromWorkspaceState() {
  const live = window.pixelEngineWorkspace?.getState?.();
  if (!state.draft || live?.projectId !== state.projectId) return;
  const liveById = new Map((live.scenes || []).map((scene) => [scene.id, scene]));
  state.draft.scenes = state.draft.scenes.map((scene) => {
    const source = liveById.get(scene.id);
    return source ? ensureLegacyObjectCollections({ ...scene, objects: clone(source.objects || {}) }) : scene;
  });
  if (dom.workspaceObjectsTab?.classList.contains('active')) renderAll();
}

function persistObjectDraft() {
  dom.saveDraftBtn.click();
  if (dom.saveDraftBtn.dataset.saveStatus === 'error') {
    throw new Error('browser storage rejected the workspace draft');
  }
  const fresh = readDraft(state.projectId);
  if (!fresh) throw new Error('the current workspace draft could not be loaded');
  const merged = mergeObjectCollections(fresh, state.draft);
  merged.savedAt = new Date().toISOString();
  localStorage.setItem(draftKey(state.projectId), JSON.stringify(merged));
  state.draft = { ...merged, scenes: merged.scenes.map(ensureLegacyObjectCollections) };
}

function onPreviewClick(event) {
  const marker = event.target.closest('[data-object-type][data-object-index]');
  if (marker) {
    state.type = marker.dataset.objectType;
    state.selectedIndex = Number(marker.dataset.objectIndex);
    dom.objectTypeSelect.value = state.type;
    renderAll();
    return;
  }
  const cell = event.target.closest('[data-object-x]');
  if (!cell) return;
  dom.objectXInput.value = cell.dataset.objectX;
  dom.objectYInput.value = cell.dataset.objectY;
  setStatus(`Object placement set to ${cell.dataset.objectX}, ${cell.dataset.objectY}. Save the object to apply it.`);
}

function renderPreview() {
  const scene = selectedScene();
  dom.objectScenePreview.innerHTML = '';
  if (!scene) {
    dom.objectSceneHeading.textContent = 'No Scene Selected';
    dom.objectSceneDimensions.textContent = '';
    return;
  }
  dom.objectSceneHeading.textContent = scene.name || scene.id;
  dom.objectSceneDimensions.textContent = `${scene.width} × ${scene.height}`;
  dom.objectScenePreview.style.setProperty('--object-scene-width', String(scene.width));
  const markersByCell = new Map();
  for (const type of LEGACY_OBJECT_TYPES) {
    (scene.objects?.[type] || []).forEach((object, index) => {
      const key = `${Math.floor(Number(object.x))},${Math.floor(Number(object.y))}`;
      if (!markersByCell.has(key)) markersByCell.set(key, []);
      markersByCell.get(key).push({ type, object, index });
    });
  }

  for (let y = 0; y < scene.height; y += 1) {
    for (let x = 0; x < scene.width; x += 1) {
      const cell = document.createElement('div');
      cell.className = 'workspace-object-cell';
      cell.dataset.objectX = String(x);
      cell.dataset.objectY = String(y);
      const tileId = scene.tiles?.[y]?.[x] || 'empty';
      cell.style.background = hashColor(tileId);
      cell.title = `${x}, ${y} • ${tileId}`;
      if (Math.floor(Number(scene.spawn?.x)) === x && Math.floor(Number(scene.spawn?.y)) === y) {
        const spawn = document.createElement('span');
        spawn.className = 'workspace-object-spawn';
        spawn.title = 'Player spawn';
        cell.appendChild(spawn);
      }
      for (const marker of markersByCell.get(`${x},${y}`) || []) {
        const dot = document.createElement('span');
        dot.className = 'workspace-object-dot';
        dot.classList.toggle('selected', marker.type === state.type && marker.index === state.selectedIndex);
        dot.style.background = legacyObjectMarkerColor(marker.type);
        dot.dataset.objectType = marker.type;
        dot.dataset.objectIndex = String(marker.index);
        dot.title = legacyObjectLabel(marker.type, marker.object, marker.index);
        cell.appendChild(dot);
      }
      dom.objectScenePreview.appendChild(cell);
    }
  }
}

function hashColor(value) {
  let hash = 0;
  for (const char of String(value || 'tile')) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 28% 48%)`;
}

function exportSceneFromMergedDraft(event) {
  if (!state.draft || state.projectId !== currentProjectId()) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  dom.saveDraftBtn.click();
  if (dom.saveDraftBtn.dataset.saveStatus === 'error') {
    return setStatus('The scene could not be exported because the current draft was not saved.', true);
  }
  const draft = readDraft(state.projectId);
  const sceneId = dom.sceneSelect.value;
  const scene = draft?.scenes?.find((entry) => entry.id === sceneId);
  if (!scene) return setStatus('The selected scene was not found in the merged draft.', true);
  downloadJson(`${scene.id}.json`, cleanJson(scene));
  setStatus(`Scene “${scene.id}” exported with current legacy objects.`);
}

async function exportBundleFromMergedDraft(event) {
  if (!state.draft || state.projectId !== currentProjectId()) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  dom.saveDraftBtn.click();
  if (dom.saveDraftBtn.dataset.saveStatus === 'error') {
    return setStatus('The workspace bundle could not be exported because the current draft was not saved.', true);
  }
  const draft = readDraft(state.projectId);
  try {
    const response = await fetch(new URL(`../games/${state.projectId}/game.json`, window.location.href), { cache: 'no-store' });
    if (!response.ok) throw new Error(`manifest request returned ${response.status}`);
    const manifest = await response.json();
    downloadJson(`${state.projectId}-workspace-bundle.json`, {
      schemaVersion: 1,
      projectId: state.projectId,
      manifest,
      actors: { actors: cleanJson(draft.actors || []) },
      scenes: cleanJson(draft.scenes || []),
    });
    setStatus('Workspace bundle exported with current legacy objects.');
  } catch (error) {
    setStatus(`Workspace bundle could not be exported: ${error.message}`, true);
  }
}

function cleanJson(value) {
  if (Array.isArray(value)) return value.map(cleanJson);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !key.startsWith('_workspace'))
    .map(([key, entry]) => [key, cleanJson(entry)]));
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function setStatus(message, isError = false) {
  dom.objectStatus.textContent = message;
  dom.objectStatus.classList.toggle('error', isError);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

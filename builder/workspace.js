import {
  mergeActors,
  normalizeActor,
  normalizeEntity,
  normalizeId,
  normalizeScene,
  removeById,
  upsertById,
  validateActor,
  validateEntity,
} from './workspace-model.js';
import { activateWorkspaceTab } from './workspace-tabs.js';

const CATALOG_URL = new URL('../games/catalog.json', window.location.href);
const DRAFT_PREFIX = 'pixel_engine_builder_workspace_';

const dom = Object.fromEntries([
  'projectSelect', 'loadProjectBtn', 'saveDraftBtn', 'clearDraftBtn', 'exportBundleBtn',
  'projectSummary', 'workspaceMessage', 'workspaceSceneTabBtn', 'workspaceActorTabBtn',
  'workspaceSceneTab', 'workspaceActorTab', 'sceneSelect', 'exportSceneBtn', 'newEntityBtn',
  'deleteEntityBtn', 'entityList', 'sceneHeading', 'sceneDimensions', 'scenePreview', 'entityForm',
  'entityIdInput', 'entityTypeInput', 'entityXInput', 'entityYInput', 'entityShapeSelect',
  'entityColorInput', 'entitySizeInput', 'entityImageInput', 'entityActionSelect',
  'entityMessageInput', 'entityTargetSceneInput', 'entityRangeInput', 'entitySolidInput',
  'entityRadiusInput', 'newActorBtn', 'deleteActorBtn', 'exportActorsBtn', 'actorList',
  'actorForm', 'actorIdInput', 'actorNameInput', 'actorSpeedInput', 'actorHealthInput',
  'actorGoldInput', 'actorAttackInput', 'actorDefenseInput', 'actorAgilityInput',
  'actorSlotsInput', 'actorMaxStackInput', 'actorProgressionInput', 'actorShapeSelect',
  'actorColorInput', 'actorSizeInput', 'actorSpritePathInput', 'actorFrameWidthInput',
  'actorFrameHeightInput',
  'workspacePlayGameLink',
].map((id) => [id, document.getElementById(id)]));

const state = {
  catalog: [],
  projectId: '',
  projectMeta: null,
  manifest: null,
  manifestUrl: null,
  contentRootUrl: null,
  actors: [],
  scenes: [],
  selectedActorId: '',
  selectedSceneId: '',
  selectedEntityId: '',
  tileColors: {},
  dirty: false,
};

init().catch((error) => setMessage(`Workspace failed to initialize: ${error.message}`, true));

async function init() {
  bindEvents();
  const catalog = await fetchJson(CATALOG_URL);
  state.catalog = Array.isArray(catalog.games) ? catalog.games : [];
  renderProjectOptions();
  const requested = normalizeId(new URL(window.location.href).searchParams.get('game'));
  const preferred = state.catalog.some((entry) => entry.id === requested)
    ? requested
    : state.catalog[0]?.id;
  if (!preferred) throw new Error('No game packages were found in games/catalog.json.');
  dom.projectSelect.value = preferred;
  await loadProject(preferred);
}

function bindEvents() {
  dom.loadProjectBtn.addEventListener('click', () => loadProject(dom.projectSelect.value));
  dom.projectSelect.addEventListener('change', () => loadProject(dom.projectSelect.value));
  dom.saveDraftBtn.addEventListener('click', saveDraft);
  dom.clearDraftBtn.addEventListener('click', clearDraft);
  dom.exportBundleBtn.addEventListener('click', exportBundle);
  dom.workspaceSceneTabBtn.addEventListener('click', () => setActiveTab('scene'));
  dom.workspaceActorTabBtn.addEventListener('click', () => setActiveTab('actor'));
  dom.sceneSelect.addEventListener('change', () => selectScene(dom.sceneSelect.value));
  dom.exportSceneBtn.addEventListener('click', exportSelectedScene);
  dom.newEntityBtn.addEventListener('click', newEntity);
  dom.deleteEntityBtn.addEventListener('click', deleteSelectedEntity);
  dom.entityForm.addEventListener('submit', saveEntity);
  dom.entityList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-entity-id]');
    if (button) selectEntity(button.dataset.entityId);
  });
  dom.scenePreview.addEventListener('click', onSceneCellClick);
  dom.newActorBtn.addEventListener('click', newActor);
  dom.deleteActorBtn.addEventListener('click', deleteSelectedActor);
  dom.exportActorsBtn.addEventListener('click', exportActors);
  dom.actorForm.addEventListener('submit', saveActor);
  dom.actorList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-actor-id]');
    if (button) selectActor(button.dataset.actorId);
  });
  window.addEventListener('beforeunload', (event) => {
    if (!state.dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });
}

async function fetchJson(url, fallback) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    if (arguments.length > 1) return fallback;
    throw new Error(`Unable to load ${url.pathname} (${response.status}).`);
  }
  return response.json();
}

function resolveContentPath(path) {
  return new URL(String(path || ''), state.contentRootUrl);
}

function fileIn(directory, id) {
  return `${String(directory || '').replace(/\/$/, '')}/${id}.json`;
}

async function loadProject(projectId) {
  const id = normalizeId(projectId);
  const meta = state.catalog.find((entry) => entry.id === id);
  if (!meta) return setMessage(`Unknown game project: ${projectId}`, true);
  setMessage(`Loading ${meta.name || id}…`);
  const manifestUrl = new URL(`../games/${id}/game.json`, window.location.href);
  const manifest = await fetchJson(manifestUrl);
  state.projectId = id;
  state.projectMeta = meta;
  state.manifest = manifest;
  state.manifestUrl = manifestUrl;
  state.contentRootUrl = new URL(manifest.contentRoot || './', manifestUrl);

  const data = manifest.data || {};
  const world = await fetchJson(resolveContentPath(data.world));
  const classesPayload = data.classes ? await fetchJson(resolveContentPath(data.classes), { classes: [] }) : { classes: [] };
  const actorsPayload = data.actors ? await fetchJson(resolveContentPath(data.actors), { actors: [] }) : { actors: [] };
  const directIds = new Set((actorsPayload.actors || []).map((actor) => actor.id));
  state.actors = mergeActors(classesPayload.classes || [], actorsPayload.actors || []).map((actor) => ({
    ...actor,
    _workspaceSource: directIds.has(actor.id) ? 'direct actor' : 'legacy class',
  }));

  const [towns, levels, scenes] = await Promise.all([
    loadSceneGroup(world.towns || [], data.townsDirectory, 'town'),
    loadSceneGroup(world.levels || [], data.levelsDirectory, 'level'),
    loadSceneGroup(world.scenes || [], data.scenesDirectory, 'scene'),
  ]);
  state.scenes = [...towns, ...levels, ...scenes];
  await loadTileColors(data);
  restoreDraft();

  state.selectedActorId = state.actors[0]?.id || '';
  state.selectedSceneId = manifest.startScene?.id && state.scenes.some((scene) => scene.id === manifest.startScene.id)
    ? manifest.startScene.id
    : state.scenes[0]?.id || '';
  state.selectedEntityId = '';
  state.dirty = false;
  renderAll();
  const playUrl = new URL('../', window.location.href);
  playUrl.searchParams.set('game', id);
  dom.workspacePlayGameLink.href = playUrl.href;
  setMessage(`${meta.name || id} loaded. Changes stay local until exported.`);
}

async function loadSceneGroup(ids, directory, kind) {
  if (!directory) return [];
  return Promise.all((ids || []).map(async (id) => {
    const path = fileIn(directory, id);
    const scene = normalizeScene(await fetchJson(resolveContentPath(path)));
    return { ...scene, _workspaceKind: kind, _workspacePath: path };
  }));
}

async function loadTileColors(data) {
  const tilesPayload = data.tiles ? await fetchJson(resolveContentPath(data.tiles), { tiles: [] }) : { tiles: [] };
  const texturesPayload = data.texturePack ? await fetchJson(resolveContentPath(data.texturePack), { textures: [] }) : { textures: [] };
  const textures = Object.fromEntries((texturesPayload.textures || []).map((entry) => [entry.id, entry]));
  state.tileColors = Object.fromEntries((tilesPayload.tiles || []).map((tile) => {
    const texture = textures[tile.texture] || {};
    return [tile.id, texture.color || tile.minimapColor || hashColor(tile.id)];
  }));
}

function hashColor(value) {
  let hash = 0;
  for (const char of String(value || 'tile')) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 28% 48%)`;
}

function renderProjectOptions() {
  dom.projectSelect.innerHTML = '';
  for (const project of state.catalog) {
    const option = document.createElement('option');
    option.value = project.id;
    option.textContent = project.name || project.id;
    dom.projectSelect.appendChild(option);
  }
}

function renderAll() {
  dom.projectSelect.value = state.projectId;
  dom.projectSummary.textContent = `${state.manifest?.name || state.projectId} • engine ${state.manifest?.engineVersion || 'unknown'} • ${state.actors.length} actor(s) • ${state.scenes.length} scene(s)`;
  renderSceneOptions();
  renderActorList();
  renderActorForm();
  renderEntityList();
  renderEntityForm();
  renderScenePreview();
}

function setActiveTab(tab) {
  const actor = tab === 'actor';
  activateWorkspaceTab(
    actor ? dom.workspaceActorTab : dom.workspaceSceneTab,
    actor ? dom.workspaceActorTabBtn : dom.workspaceSceneTabBtn,
  );
}

function selectedScene() {
  return state.scenes.find((scene) => scene.id === state.selectedSceneId) || null;
}

function selectedActor() {
  return state.actors.find((actor) => actor.id === state.selectedActorId) || null;
}

function selectedEntity() {
  return selectedScene()?.entities?.find((entity) => entity.id === state.selectedEntityId) || null;
}

function renderSceneOptions() {
  dom.sceneSelect.innerHTML = '';
  for (const scene of state.scenes) {
    const option = document.createElement('option');
    option.value = scene.id;
    option.textContent = `${scene.name} [${scene._workspaceKind}]`;
    dom.sceneSelect.appendChild(option);
  }
  dom.sceneSelect.value = state.selectedSceneId;
}

function selectScene(id) {
  if (!state.scenes.some((scene) => scene.id === id)) return;
  state.selectedSceneId = id;
  state.selectedEntityId = '';
  renderEntityList();
  renderEntityForm();
  renderScenePreview();
}

function renderActorList() {
  dom.actorList.innerHTML = '';
  for (const actor of state.actors) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'secondary-btn workspace-list-button';
    button.classList.toggle('active', actor.id === state.selectedActorId);
    button.dataset.actorId = actor.id;
    button.innerHTML = `<span>${escapeHtml(actor.name)}<br><small>${escapeHtml(actor.id)}</small></span><span class="workspace-source-tag">${escapeHtml(actor._workspaceSource || 'direct actor')}</span>`;
    dom.actorList.appendChild(button);
  }
}

function selectActor(id) {
  state.selectedActorId = id;
  renderActorList();
  renderActorForm();
}

function newActor() {
  state.selectedActorId = '';
  dom.actorForm.reset();
  dom.actorIdInput.value = nextId('actor', state.actors);
  dom.actorNameInput.value = 'New Actor';
  dom.actorSpeedInput.value = '3';
  dom.actorHealthInput.value = '10';
  dom.actorGoldInput.value = '0';
  dom.actorAttackInput.value = '0';
  dom.actorDefenseInput.value = '0';
  dom.actorAgilityInput.value = '1';
  dom.actorSlotsInput.value = '0';
  dom.actorMaxStackInput.value = '99';
  dom.actorProgressionInput.checked = false;
  dom.actorShapeSelect.value = 'square';
  dom.actorColorInput.value = '#38bdf8';
  dom.actorSizeInput.value = '20';
  dom.actorSpritePathInput.value = '';
  dom.actorFrameWidthInput.value = '64';
  dom.actorFrameHeightInput.value = '64';
}

function renderActorForm() {
  const actor = selectedActor();
  if (!actor) return newActor();
  const components = actor.components || {};
  dom.actorIdInput.value = actor.id;
  dom.actorNameInput.value = actor.name || actor.id;
  dom.actorSpeedInput.value = components.movement?.speed ?? 3;
  dom.actorHealthInput.value = components.health?.max ?? 10;
  dom.actorGoldInput.value = components.wallet?.starting ?? 0;
  dom.actorAttackInput.value = components.combat?.attack ?? 0;
  dom.actorDefenseInput.value = components.combat?.defense ?? 0;
  dom.actorAgilityInput.value = components.combat?.agility ?? 0;
  dom.actorSlotsInput.value = components.inventory?.slots ?? 0;
  dom.actorMaxStackInput.value = components.inventory?.maxStack ?? 99;
  dom.actorProgressionInput.checked = components.progression?.enabled !== false;
  dom.actorShapeSelect.value = components.render?.fallback?.shape || 'square';
  dom.actorColorInput.value = components.render?.fallback?.color || '#38bdf8';
  dom.actorSizeInput.value = components.render?.fallback?.size || 20;
  dom.actorSpritePathInput.value = components.render?.sprite?.imagePath || '';
  dom.actorFrameWidthInput.value = components.render?.sprite?.frameWidth || 64;
  dom.actorFrameHeightInput.value = components.render?.sprite?.frameHeight || 64;
}

function actorFromForm() {
  const spritePath = dom.actorSpritePathInput.value.trim();
  return normalizeActor({
    id: dom.actorIdInput.value,
    name: dom.actorNameInput.value,
    components: {
      movement: { speed: dom.actorSpeedInput.value },
      health: { max: dom.actorHealthInput.value },
      combat: {
        attack: dom.actorAttackInput.value,
        defense: dom.actorDefenseInput.value,
        agility: dom.actorAgilityInput.value,
        growth: selectedActor()?.components?.combat?.growth || {},
      },
      wallet: { starting: dom.actorGoldInput.value },
      inventory: { slots: dom.actorSlotsInput.value, maxStack: dom.actorMaxStackInput.value },
      equipment: { starting: selectedActor()?.components?.equipment?.starting || {} },
      progression: { enabled: dom.actorProgressionInput.checked },
      render: {
        fallback: { shape: dom.actorShapeSelect.value, color: dom.actorColorInput.value, size: dom.actorSizeInput.value },
        sprite: spritePath ? {
          ...(selectedActor()?.components?.render?.sprite || {}),
          imagePath: spritePath,
          frameWidth: Number(dom.actorFrameWidthInput.value) || 64,
          frameHeight: Number(dom.actorFrameHeightInput.value) || 64,
          idleFrames: selectedActor()?.components?.render?.sprite?.idleFrames || [0],
          walkFrames: selectedActor()?.components?.render?.sprite?.walkFrames || [0, 1, 2],
        } : null,
      },
    },
  });
}

function saveActor(event) {
  event.preventDefault();
  const actor = { ...actorFromForm(), _workspaceSource: 'direct actor' };
  const errors = validateActor(actor);
  if (errors.length) return setMessage(errors.join(' '), true);
  const previousId = state.selectedActorId;
  if (previousId && previousId !== actor.id) state.actors = removeById(state.actors, previousId);
  state.actors = upsertById(state.actors, actor);
  state.selectedActorId = actor.id;
  markDirty(`Actor “${actor.name}” saved.`);
  renderActorList();
  renderActorForm();
}

function deleteSelectedActor() {
  if (!state.selectedActorId) return;
  const actor = selectedActor();
  if (!window.confirm(`Delete actor “${actor?.name || state.selectedActorId}” from this workspace?`)) return;
  state.actors = removeById(state.actors, state.selectedActorId);
  state.selectedActorId = state.actors[0]?.id || '';
  markDirty('Actor deleted from the workspace.');
  renderActorList();
  renderActorForm();
}

function renderEntityList() {
  dom.entityList.innerHTML = '';
  for (const entity of selectedScene()?.entities || []) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'secondary-btn workspace-list-button';
    button.classList.toggle('active', entity.id === state.selectedEntityId);
    button.dataset.entityId = entity.id;
    button.innerHTML = `<span>${escapeHtml(entity.id)}<br><small>${escapeHtml(entity.type)}</small></span><span class="workspace-source-tag">${Math.round(entity.x)}, ${Math.round(entity.y)}</span>`;
    dom.entityList.appendChild(button);
  }
}

function selectEntity(id) {
  state.selectedEntityId = id;
  renderEntityList();
  renderEntityForm();
  renderScenePreview();
}

function newEntity() {
  const scene = selectedScene();
  if (!scene) return;
  state.selectedEntityId = '';
  dom.entityForm.reset();
  dom.entityIdInput.value = nextId('entity', scene.entities || []);
  dom.entityTypeInput.value = 'object';
  dom.entityXInput.value = Math.floor(scene.spawn?.x || 0);
  dom.entityYInput.value = Math.floor(scene.spawn?.y || 0);
  dom.entityShapeSelect.value = 'square';
  dom.entityColorInput.value = '#facc15';
  dom.entitySizeInput.value = '16';
  dom.entityActionSelect.value = 'none';
  dom.entityRangeInput.value = '1.1';
  dom.entityRadiusInput.value = '0.42';
  renderEntityList();
  renderScenePreview();
}

function renderEntityForm() {
  const entity = selectedEntity();
  if (!entity) return newEntity();
  const components = entity.components || {};
  dom.entityIdInput.value = entity.id;
  dom.entityTypeInput.value = entity.type || 'object';
  dom.entityXInput.value = entity.x;
  dom.entityYInput.value = entity.y;
  dom.entityShapeSelect.value = components.render?.shape || 'square';
  dom.entityColorInput.value = components.render?.color || '#facc15';
  dom.entitySizeInput.value = components.render?.size || 16;
  dom.entityImageInput.value = components.render?.imagePath || '';
  dom.entityActionSelect.value = components.interaction?.action || 'none';
  dom.entityMessageInput.value = components.interaction?.message || '';
  dom.entityTargetSceneInput.value = components.interaction?.targetScene || '';
  dom.entityRangeInput.value = components.interaction?.range || 1.1;
  dom.entitySolidInput.checked = Boolean(components.collision?.solid);
  dom.entityRadiusInput.value = components.collision?.radius || 0.42;
}

function entityFromForm() {
  return normalizeEntity({
    id: dom.entityIdInput.value,
    type: dom.entityTypeInput.value,
    x: dom.entityXInput.value,
    y: dom.entityYInput.value,
    components: {
      render: {
        shape: dom.entityShapeSelect.value,
        color: dom.entityColorInput.value,
        size: dom.entitySizeInput.value,
        imagePath: dom.entityImageInput.value.trim(),
      },
      interaction: {
        action: dom.entityActionSelect.value,
        message: dom.entityMessageInput.value,
        targetScene: dom.entityTargetSceneInput.value,
        range: dom.entityRangeInput.value,
      },
      collision: { solid: dom.entitySolidInput.checked, radius: dom.entityRadiusInput.value },
    },
  });
}

function saveEntity(event) {
  event.preventDefault();
  const scene = selectedScene();
  if (!scene) return;
  const entity = entityFromForm();
  const errors = validateEntity(entity, scene);
  if (errors.length) return setMessage(errors.join(' '), true);
  const previousId = state.selectedEntityId;
  if (previousId && previousId !== entity.id) scene.entities = removeById(scene.entities, previousId);
  scene.entities = upsertById(scene.entities, entity);
  state.selectedEntityId = entity.id;
  markDirty(`Entity “${entity.id}” saved in ${scene.name}.`);
  renderEntityList();
  renderEntityForm();
  renderScenePreview();
}

function deleteSelectedEntity() {
  const scene = selectedScene();
  if (!scene || !state.selectedEntityId) return;
  if (!window.confirm(`Delete entity “${state.selectedEntityId}”?`)) return;
  scene.entities = removeById(scene.entities, state.selectedEntityId);
  state.selectedEntityId = '';
  markDirty('Entity deleted from the selected scene.');
  renderEntityList();
  renderEntityForm();
  renderScenePreview();
}

function onSceneCellClick(event) {
  const cell = event.target.closest('[data-scene-x]');
  if (!cell) return;
  dom.entityXInput.value = cell.dataset.sceneX;
  dom.entityYInput.value = cell.dataset.sceneY;
  setMessage(`Entity placement set to ${cell.dataset.sceneX}, ${cell.dataset.sceneY}. Save the entity to apply it.`);
}

function renderScenePreview() {
  const scene = selectedScene();
  dom.scenePreview.innerHTML = '';
  if (!scene) {
    dom.sceneHeading.textContent = 'No Scene Selected';
    dom.sceneDimensions.textContent = '';
    return;
  }
  dom.sceneHeading.textContent = scene.name;
  dom.sceneDimensions.textContent = `${scene.width} × ${scene.height}`;
  dom.scenePreview.style.setProperty('--scene-width', String(scene.width));
  const entitiesByCell = new Map();
  for (const entity of scene.entities || []) {
    const key = `${Math.floor(entity.x)},${Math.floor(entity.y)}`;
    if (!entitiesByCell.has(key)) entitiesByCell.set(key, []);
    entitiesByCell.get(key).push(entity);
  }
  for (let y = 0; y < scene.height; y += 1) {
    for (let x = 0; x < scene.width; x += 1) {
      const cell = document.createElement('div');
      cell.className = 'workspace-scene-cell';
      cell.dataset.sceneX = String(x);
      cell.dataset.sceneY = String(y);
      const tileId = scene.tiles[y]?.[x] || 'empty';
      cell.style.background = state.tileColors[tileId] || hashColor(tileId);
      cell.title = `${x}, ${y} • ${tileId}`;
      if (Math.floor(scene.spawn?.x) === x && Math.floor(scene.spawn?.y) === y) {
        const spawn = document.createElement('span');
        spawn.className = 'spawn-dot';
        spawn.title = 'Player spawn';
        cell.appendChild(spawn);
      }
      for (const entity of entitiesByCell.get(`${x},${y}`) || []) {
        const dot = document.createElement('span');
        dot.className = `entity-dot${entity.id === state.selectedEntityId ? ' selected-entity-dot' : ''}`;
        dot.style.background = entity.components?.render?.color || '#facc15';
        dot.title = entity.id;
        cell.appendChild(dot);
      }
      dom.scenePreview.appendChild(cell);
    }
  }
}

function nextId(prefix, list) {
  const existing = new Set((list || []).map((entry) => entry.id));
  let index = 1;
  while (existing.has(`${prefix}_${index}`)) index += 1;
  return `${prefix}_${index}`;
}

function draftKey() {
  return `${DRAFT_PREFIX}${state.projectId}`;
}

function saveDraft() {
  if (!state.projectId) return;
  localStorage.setItem(draftKey(), JSON.stringify({
    version: 1,
    projectId: state.projectId,
    actors: cleanJson(state.actors),
    scenes: cleanJson(state.scenes),
    savedAt: new Date().toISOString(),
  }));
  state.dirty = false;
  setMessage('Local workspace draft saved in this browser.');
}

function restoreDraft() {
  const raw = localStorage.getItem(draftKey());
  if (!raw) return;
  try {
    const draft = JSON.parse(raw);
    if (draft.projectId !== state.projectId) return;
    if (Array.isArray(draft.actors)) state.actors = draft.actors.map((actor) => ({ ...normalizeActor(actor), _workspaceSource: 'local draft' }));
    if (Array.isArray(draft.scenes)) {
      const sourceById = Object.fromEntries(state.scenes.map((scene) => [scene.id, scene]));
      state.scenes = draft.scenes.map((scene) => ({
        ...normalizeScene(scene),
        _workspaceKind: sourceById[scene.id]?._workspaceKind || 'scene',
        _workspacePath: sourceById[scene.id]?._workspacePath || '',
      }));
    }
    setMessage('A local draft was restored for this project.');
  } catch {
    localStorage.removeItem(draftKey());
  }
}

function clearDraft(event) {
  if (!state.projectId) return;
  if (!window.confirm(`Clear the saved local draft and staged custom textures for “${state.projectMeta?.name || state.projectId}”? Repository files will not be changed.`)) {
    event?.preventDefault();
    event?.stopImmediatePropagation();
    return;
  }
  localStorage.removeItem(draftKey());
  state.dirty = false;
  setMessage('Local draft cleared. Choose Load Project to restore the current repository version.');
}

function exportActors() {
  downloadJson(`${state.projectId}-actors.json`, { actors: cleanJson(state.actors) });
  setMessage('Actors JSON exported.');
}

function exportSelectedScene() {
  const scene = selectedScene();
  if (!scene) return;
  downloadJson(`${scene.id}.json`, cleanJson(scene));
  setMessage(`Scene “${scene.id}” exported.`);
}

function exportBundle() {
  downloadJson(`${state.projectId}-workspace-bundle.json`, {
    schemaVersion: 1,
    projectId: state.projectId,
    manifest: cleanJson(state.manifest),
    actors: { actors: cleanJson(state.actors) },
    scenes: cleanJson(state.scenes),
  });
  setMessage('Workspace bundle exported.');
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

function markDirty(message) {
  state.dirty = true;
  setMessage(message);
}

function setMessage(message, isError = false) {
  dom.workspaceMessage.textContent = message;
  dom.workspaceMessage.classList.toggle('error', isError);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

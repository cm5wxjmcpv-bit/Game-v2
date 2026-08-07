import { mergeActors, normalizeId, normalizeScene } from './workspace-model.js';
import { buildWorkspacePublishPlan, repoPathFromUrl } from './workspace-publish-model.js';
import { publishWorkspacePlan } from './workspace-publisher.js';
import {
  buildWorkspaceAssetFileChanges,
  readWorkspaceAssetDraft,
} from './workspace-asset-model.js';
import { activateWorkspaceTab, deactivateWorkspaceTab } from './workspace-tabs.js';

const DRAFT_PREFIX = 'pixel_engine_builder_workspace_';
const REPOSITORY_ROOT_URL = new URL('../', window.location.href);

const dom = Object.fromEntries([
  'projectSelect', 'sceneSelect', 'saveDraftBtn', 'workspaceSceneTabBtn', 'workspaceActorTabBtn',
  'workspacePublishTabBtn', 'workspaceSceneTab', 'workspaceActorTab', 'workspacePublishTab',
  'refreshPublishPlanBtn', 'publishPlanSummary', 'publishFileList', 'publishForm',
  'publishTitleInput', 'publishCommitInput', 'publishTokenInput', 'publishConfirmInput',
  'publishDraftPrBtn', 'clearPublishTokenBtn', 'publishStatus', 'publishPrLink',
  'publishPreviewLink',
].map((id) => [id, document.getElementById(id)]));

const state = { plan: null, loading: false, publishing: false };

bindEvents();

function bindEvents() {
  dom.workspacePublishTabBtn.addEventListener('click', openPublishTab);
  dom.workspaceSceneTabBtn.addEventListener('click', closePublishTab);
  dom.workspaceActorTabBtn.addEventListener('click', closePublishTab);
  dom.refreshPublishPlanBtn.addEventListener('click', refreshPublishPlan);
  dom.publishForm.addEventListener('submit', publishDraftPullRequest);
  dom.clearPublishTokenBtn.addEventListener('click', () => {
    dom.publishTokenInput.value = '';
    updatePublishButton();
    setPublishStatus('GitHub token cleared from this page.');
  });
  dom.publishTokenInput.addEventListener('input', updatePublishButton);
  dom.publishConfirmInput.addEventListener('change', updatePublishButton);
  dom.projectSelect.addEventListener('change', () => {
    state.plan = null;
    renderPublishPlan();
  });
}

function openPublishTab() {
  activateWorkspaceTab(dom.workspacePublishTab, dom.workspacePublishTabBtn);
  refreshPublishPlan();
}

function closePublishTab() {
  deactivateWorkspaceTab(dom.workspacePublishTab, dom.workspacePublishTabBtn);
}

async function fetchJson(url, fallback) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    if (arguments.length > 1) return fallback;
    throw new Error(`Unable to load ${url.pathname} (${response.status}).`);
  }
  return response.json();
}

function fileIn(directory, id) {
  return `${String(directory || '').replace(/\/$/, '')}/${id}.json`;
}

function rawJsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function loadSceneGroup(ids, directory, kind, contentRootUrl, fileContents) {
  if (!directory) return [];
  return Promise.all((ids || []).map(async (id) => {
    const path = fileIn(directory, id);
    const url = new URL(path, contentRootUrl);
    const rawScene = await fetchJson(url);
    const repositoryPath = repoPathFromUrl(url, REPOSITORY_ROOT_URL);
    fileContents[repositoryPath] = rawJsonText(rawScene);
    return { ...normalizeScene(rawScene), _workspaceKind: kind, _workspacePath: path };
  }));
}

async function loadManifestDataSource(relativePath, contentRootUrl, fileContents, cache) {
  if (!relativePath) return null;
  const url = new URL(relativePath, contentRootUrl);
  const repositoryPath = repoPathFromUrl(url, REPOSITORY_ROOT_URL);
  if (!cache.has(repositoryPath)) cache.set(repositoryPath, fetchJson(url));
  const payload = await cache.get(repositoryPath);
  fileContents[repositoryPath] = rawJsonText(payload);
  return { path: repositoryPath, payload };
}

async function loadRepositoryBaseline(projectId) {
  const manifestUrl = new URL(`../games/${projectId}/game.json`, window.location.href);
  const manifest = await fetchJson(manifestUrl);
  const contentRootUrl = new URL(manifest.contentRoot || './', manifestUrl);
  const data = manifest.data || {};
  const fileContents = {};
  const dataCache = new Map();
  const world = await fetchJson(new URL(data.world, contentRootUrl));
  const classesPayload = data.classes
    ? await fetchJson(new URL(data.classes, contentRootUrl), { classes: [] })
    : { classes: [] };
  const actorsPayload = data.actors
    ? await fetchJson(new URL(data.actors, contentRootUrl), { actors: [] })
    : { actors: [] };
  if (data.actors) {
    const actorsUrl = new URL(data.actors, contentRootUrl);
    fileContents[repoPathFromUrl(actorsUrl, REPOSITORY_ROOT_URL)] = rawJsonText(actorsPayload);
  }
  const actors = mergeActors(classesPayload.classes || [], actorsPayload.actors || []);
  const [towns, levels, scenes, tilesSource, texturesSource] = await Promise.all([
    loadSceneGroup(world.towns || [], data.townsDirectory, 'town', contentRootUrl, fileContents),
    loadSceneGroup(world.levels || [], data.levelsDirectory, 'level', contentRootUrl, fileContents),
    loadSceneGroup(world.scenes || [], data.scenesDirectory, 'scene', contentRootUrl, fileContents),
    loadManifestDataSource(data.tiles, contentRootUrl, fileContents, dataCache),
    loadManifestDataSource(data.texturePack, contentRootUrl, fileContents, dataCache),
  ]);
  return {
    manifest,
    contentRootUrl,
    actors,
    scenes: [...towns, ...levels, ...scenes],
    fileContents,
    tilesSource,
    texturesSource,
  };
}

function readCurrentDraft(projectId, baseline) {
  dom.saveDraftBtn.click();
  const raw = localStorage.getItem(`${DRAFT_PREFIX}${projectId}`);
  if (!raw) throw new Error('The workspace draft could not be saved.');
  const draft = JSON.parse(raw);
  if (draft.projectId !== projectId || !Array.isArray(draft.actors) || !Array.isArray(draft.scenes)) {
    throw new Error('The saved workspace draft is invalid.');
  }
  const sourceById = new Map(baseline.scenes.map((scene) => [scene.id, scene]));
  const scenes = draft.scenes.map((scene) => ({
    ...normalizeScene(scene),
    _workspaceKind: sourceById.get(scene.id)?._workspaceKind || 'scene',
    _workspacePath: sourceById.get(scene.id)?._workspacePath || '',
  }));
  return { actors: draft.actors, scenes };
}

async function refreshPublishPlan() {
  if (state.loading || state.publishing) return;
  state.loading = true;
  dom.publishPrLink.hidden = true;
  dom.publishPreviewLink.hidden = true;
  dom.refreshPublishPlanBtn.disabled = true;
  setPublishStatus('Building the complete file plan from the current workspace…');
  try {
    const projectId = normalizeId(dom.projectSelect.value);
    if (!projectId) throw new Error('Select a game project first.');
    const baseline = await loadRepositoryBaseline(projectId);
    const current = readCurrentDraft(projectId, baseline);
    const assetDraft = readWorkspaceAssetDraft(projectId);
    const assetFiles = assetDraft.textures.length
      ? buildWorkspaceAssetFileChanges({
        assetDraft,
        tilesSource: baseline.tilesSource,
        texturesSource: baseline.texturesSource,
      })
      : [];
    state.plan = buildWorkspacePublishPlan({
      projectId,
      manifest: baseline.manifest,
      contentRootUrl: baseline.contentRootUrl,
      repositoryRootUrl: REPOSITORY_ROOT_URL,
      actors: current.actors,
      baselineActors: baseline.actors,
      scenes: current.scenes,
      baselineScenes: baseline.scenes,
      assetFiles,
    });
    for (const file of state.plan.files) {
      if (baseline.fileContents[file.path]) file.baselineContent = baseline.fileContents[file.path];
    }
    dom.publishTitleInput.value ||= `Update ${projectId} game content`;
    dom.publishCommitInput.value ||= `Update ${projectId} game content`;
    renderPublishPlan();
    if (state.plan.errors.length) setPublishStatus(state.plan.errors.join(' '), true);
    else if (!state.plan.files.length) setPublishStatus('No changed level, actor, object, tile, or texture files are ready to publish.');
    else setPublishStatus(`${state.plan.files.length} changed file(s) are ready for review and test publishing.`);
  } catch (error) {
    state.plan = null;
    renderPublishPlan();
    setPublishStatus(`Unable to build publish plan: ${error.message}`, true);
  } finally {
    state.loading = false;
    dom.refreshPublishPlanBtn.disabled = false;
    updatePublishButton();
  }
}

function renderPublishPlan() {
  dom.publishFileList.innerHTML = '';
  dom.publishPlanSummary.classList.remove('workspace-publish-error', 'workspace-publish-warning');
  if (!state.plan) {
    dom.publishPlanSummary.textContent = 'No publish plan has been built for the selected project.';
    updatePublishButton();
    return;
  }
  if (state.plan.errors.length) {
    dom.publishPlanSummary.textContent = `${state.plan.projectId} cannot be published: ${state.plan.errors.join(' ')}`;
    dom.publishPlanSummary.classList.add('workspace-publish-error');
  } else if (!state.plan.files.length) {
    dom.publishPlanSummary.textContent = `${state.plan.projectId} has no changed game files.`;
    dom.publishPlanSummary.classList.add('workspace-publish-warning');
  } else {
    dom.publishPlanSummary.textContent = `${state.plan.projectId} → ${state.plan.repository} • new workspace branch from ${state.plan.baseBranch} • draft pull request for testing`;
  }
  for (const file of state.plan.files) {
    const row = document.createElement('div');
    row.className = 'workspace-publish-file';
    const path = document.createElement('code');
    path.textContent = file.path;
    const kind = document.createElement('span');
    kind.className = 'workspace-publish-kind';
    kind.textContent = file.kind;
    row.append(path, kind);
    dom.publishFileList.appendChild(row);
  }
  updatePublishButton();
}

function updatePublishButton() {
  const usablePlan = state.plan && !state.plan.errors.length && state.plan.files.length > 0;
  dom.publishDraftPrBtn.disabled = Boolean(
    state.loading || state.publishing || !usablePlan ||
    !dom.publishConfirmInput.checked || !dom.publishTokenInput.value.trim()
  );
}

async function publishDraftPullRequest(event) {
  event.preventDefault();
  if (state.publishing) return;
  await refreshPublishPlan();
  if (!state.plan || state.plan.errors.length || !state.plan.files.length) return;
  if (!dom.publishConfirmInput.checked) return setPublishStatus('Review and confirm the file list before publishing.', true);
  const token = dom.publishTokenInput.value.trim();
  if (!token) return setPublishStatus('A fine-grained GitHub token is required.', true);

  state.publishing = true;
  dom.publishPrLink.hidden = true;
  dom.publishPreviewLink.hidden = true;
  updatePublishButton();
  setPublishStatus('Comparing all planned files with current main and creating a testing branch…');
  try {
    const result = await publishWorkspacePlan({
      token,
      plan: state.plan,
      title: dom.publishTitleInput.value,
      commitMessage: dom.publishCommitInput.value,
    });
    dom.publishTokenInput.value = '';
    dom.publishConfirmInput.checked = false;
    dom.publishPrLink.href = result.pullRequestUrl;
    dom.publishPrLink.textContent = `Open Draft Pull Request #${result.pullRequestNumber}`;
    dom.publishPrLink.hidden = false;
    const previewUrl = new URL('../preview.html', window.location.href);
    previewUrl.searchParams.set('game', state.plan.projectId);
    previewUrl.searchParams.set('previewCommit', result.commitSha);
    previewUrl.searchParams.set('previewPr', String(result.pullRequestNumber));
    if (dom.sceneSelect?.value) previewUrl.searchParams.set('scene', dom.sceneSelect.value);
    dom.publishPreviewLink.href = previewUrl.href;
    dom.publishPreviewLink.textContent = `Test Draft PR #${result.pullRequestNumber} in Game`;
    dom.publishPreviewLink.hidden = false;
    setPublishStatus(`Draft pull request #${result.pullRequestNumber} created on branch ${result.branch}. After Engine Audit passes, use Test Draft in Game to open this exact commit. The token was cleared.`);
  } catch (error) {
    setPublishStatus(`Publish failed: ${error.message}`, true);
  } finally {
    state.publishing = false;
    updatePublishButton();
  }
}

function setPublishStatus(message, isError = false) {
  dom.publishStatus.textContent = message;
  dom.publishStatus.classList.toggle('error', isError);
}

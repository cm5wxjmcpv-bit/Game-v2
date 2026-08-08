import {
  localPublishFileMap,
  readLocalPublishSnapshot,
} from './builder/local-publish-model.js';

const REPOSITORY_OWNER = 'cm5wxjmcpv-bit';
const REPOSITORY_NAME = 'L-C-Forge';
const COMMIT_PATTERN = /^[a-f0-9]{40}$/i;
const ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/i;
const PR_PATTERN = /^\d+$/;
const LEGACY_SAVE_KEYS = new Set(['pixel_engine_save_v2', 'pixel_engine_save_v1']);

const params = new URL(window.location.href).searchParams;
const gameId = String(params.get('game') || '').trim().toLowerCase();
let sceneId = String(params.get('scene') || '').trim().toLowerCase();
const commitSha = String(params.get('previewCommit') || '').trim().toLowerCase();
const pullRequestNumber = String(params.get('previewPr') || '').trim();
const localPublishMode = params.get('localPublish') === '1';
let localSnapshot = null;
const dom = {
  banner: document.getElementById('workspacePreviewBanner'),
  modeLabel: document.getElementById('previewModeLabel'),
  details: document.getElementById('previewDetails'),
  backLink: document.getElementById('previewBackLink'),
  prLink: document.getElementById('previewPrLink'),
  overlay: document.getElementById('overlay'),
};

try {
  validatePreviewRequest();
  if (localPublishMode) {
    localSnapshot = readLocalPublishSnapshot(gameId);
    sceneId ||= localSnapshot.sceneId;
  }
  configurePreviewBanner();
  isolatePreviewSaves();
  installPreviewContentFetch();
  await import('./src/save-menu-guard.js');
  await import('./src/main.js');
} catch (error) {
  showPreviewError(error);
}

function validatePreviewRequest() {
  if (!ID_PATTERN.test(gameId)) {
    throw new Error('The preview link has an invalid or missing game id. Return to the workspace and publish again.');
  }
  if (sceneId && !ID_PATTERN.test(sceneId)) {
    throw new Error('The preview link contains an invalid scene id.');
  }
  if (!localPublishMode && !COMMIT_PATTERN.test(commitSha)) {
    throw new Error('The draft preview link has an invalid or missing commit. Return to the workspace and publish again.');
  }
  if (!localPublishMode && pullRequestNumber && !PR_PATTERN.test(pullRequestNumber)) {
    throw new Error('The draft preview link contains an invalid pull request number.');
  }
}

function configurePreviewBanner() {
  const workspaceUrl = new URL('./builder/workspace.html', window.location.href);
  workspaceUrl.searchParams.set('game', gameId);
  workspaceUrl.searchParams.set('tab', 'publish');
  dom.backLink.href = workspaceUrl.href;
  if (localPublishMode) {
    dom.modeLabel.textContent = 'Published Browser Build';
    const time = localSnapshot.publishedAt ? new Date(localSnapshot.publishedAt).toLocaleString() : 'just now';
    dom.details.textContent = `${gameId}${sceneId ? ` › ${sceneId}` : ''} • published from this browser ${time}`;
  } else {
    dom.modeLabel.textContent = 'Draft Game Preview';
    dom.details.textContent = `${gameId}${sceneId ? ` › ${sceneId}` : ''} • content commit ${commitSha.slice(0, 8)}`;
  }

  if (!localPublishMode && pullRequestNumber) {
    dom.prLink.href = `https://github.com/${REPOSITORY_OWNER}/${REPOSITORY_NAME}/pull/${pullRequestNumber}`;
    dom.prLink.textContent = `Open Draft PR #${pullRequestNumber}`;
    dom.prLink.hidden = false;
  }
}

function isolatePreviewSaves() {
  const livePrefix = `pixel_engine_save_${gameId}_slot_`;
  const previewIdentity = localPublishMode ? `local_${localSnapshot.snapshotId}` : commitSha.slice(0, 12);
  const previewPrefix = `pixel_engine_preview_save_${previewIdentity}_${gameId}_slot_`;
  const original = {
    getItem: Storage.prototype.getItem,
    setItem: Storage.prototype.setItem,
    removeItem: Storage.prototype.removeItem,
  };

  const previewStorageKey = (key) => key.startsWith(livePrefix)
    ? `${previewPrefix}${key.slice(livePrefix.length)}`
    : key;

  Storage.prototype.getItem = function getPreviewItem(key) {
    const normalizedKey = String(key);
    if (this === window.localStorage && LEGACY_SAVE_KEYS.has(normalizedKey)) return null;
    const targetKey = this === window.localStorage ? previewStorageKey(normalizedKey) : normalizedKey;
    return original.getItem.call(this, targetKey);
  };

  Storage.prototype.setItem = function setPreviewItem(key, value) {
    const normalizedKey = String(key);
    const targetKey = this === window.localStorage ? previewStorageKey(normalizedKey) : normalizedKey;
    return original.setItem.call(this, targetKey, String(value));
  };

  Storage.prototype.removeItem = function removePreviewItem(key) {
    const normalizedKey = String(key);
    const targetKey = this === window.localStorage ? previewStorageKey(normalizedKey) : normalizedKey;
    return original.removeItem.call(this, targetKey);
  };
}

function installPreviewContentFetch() {
  if (localPublishMode) installLocalContentFetch();
  else installCommitContentFetch();
}

function installLocalContentFetch() {
  const originalFetch = window.fetch.bind(window);
  const repositoryRootUrl = new URL('./', window.location.href);
  const manifestPath = `games/${gameId}/game.json`;
  const overrides = localPublishFileMap(localSnapshot);

  window.fetch = async function fetchLocalPublishContent(input, init = undefined) {
    const requestedUrl = new URL(input instanceof Request ? input.url : String(input), window.location.href);
    const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const repositoryPath = repositoryPathFor(requestedUrl, repositoryRootUrl);
    if (method !== 'GET' || !repositoryPath?.endsWith('.json')) return originalFetch(input, init);

    let response;
    if (overrides.has(repositoryPath)) response = jsonResponse(overrides.get(repositoryPath));
    else response = await originalFetch(input, init);
    if (!response.ok || repositoryPath !== manifestPath || !sceneId) return response;

    const manifest = await response.json();
    manifest.startScene = {
      ...(manifest.startScene && typeof manifest.startScene === 'object' ? manifest.startScene : {}),
      id: sceneId,
    };
    return jsonResponse(`${JSON.stringify(manifest, null, 2)}\n`, response.status, response.statusText);
  };
}

function jsonResponse(content, status = 200, statusText = 'OK') {
  return new Response(content, {
    status,
    statusText,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function installCommitContentFetch() {
  const originalFetch = window.fetch.bind(window);
  const repositoryRootUrl = new URL('./', window.location.href);
  const rawRootUrl = new URL(`https://raw.githubusercontent.com/${REPOSITORY_OWNER}/${REPOSITORY_NAME}/${commitSha}/`);
  const manifestPath = `games/${gameId}/game.json`;

  window.fetch = async function fetchDraftContent(input, init = undefined) {
    const requestedUrl = new URL(input instanceof Request ? input.url : String(input), window.location.href);
    const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const repositoryPath = repositoryPathFor(requestedUrl, repositoryRootUrl);

    if (method !== 'GET' || !repositoryPath?.endsWith('.json')) {
      return originalFetch(input, init);
    }

    const rawUrl = new URL(repositoryPath, rawRootUrl);
    const response = await originalFetch(rawUrl, {
      cache: 'no-store',
      signal: init?.signal || (input instanceof Request ? input.signal : undefined),
    });
    if (!response.ok || repositoryPath !== manifestPath || !sceneId) return response;

    const manifest = await response.json();
    manifest.startScene = {
      ...(manifest.startScene && typeof manifest.startScene === 'object' ? manifest.startScene : {}),
      id: sceneId,
    };
    return jsonResponse(`${JSON.stringify(manifest, null, 2)}\n`, response.status, response.statusText);
  };
}

function repositoryPathFor(requestedUrl, repositoryRootUrl) {
  if (requestedUrl.origin !== repositoryRootUrl.origin) return null;
  if (!requestedUrl.pathname.startsWith(repositoryRootUrl.pathname)) return null;
  const path = requestedUrl.pathname.slice(repositoryRootUrl.pathname.length);
  if (!path || path.startsWith('/') || path.split('/').includes('..')) return null;
  return path;
}

function showPreviewError(error) {
  const message = error?.message || 'The game preview could not be loaded.';
  dom.banner.classList.add('preview-error');
  dom.details.textContent = message;
  dom.overlay.classList.remove('hidden');
  dom.overlay.innerHTML = '';

  const modal = document.createElement('div');
  modal.className = 'modal';
  const heading = document.createElement('h2');
  heading.textContent = 'Unable to Load Game Preview';
  const details = document.createElement('p');
  details.textContent = message;
  const recovery = document.createElement('a');
  recovery.href = dom.backLink.href;
  recovery.textContent = 'Return to Game Workspace';
  modal.append(heading, details, recovery);
  dom.overlay.appendChild(modal);
}

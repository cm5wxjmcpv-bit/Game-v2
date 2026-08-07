const REPOSITORY_OWNER = 'cm5wxjmcpv-bit';
const REPOSITORY_NAME = 'Game-v2';
const COMMIT_PATTERN = /^[a-f0-9]{40}$/i;
const ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/i;
const PR_PATTERN = /^\d+$/;
const LEGACY_SAVE_KEYS = new Set(['pixel_engine_save_v2', 'pixel_engine_save_v1']);

const params = new URL(window.location.href).searchParams;
const gameId = String(params.get('game') || '').trim();
const sceneId = String(params.get('scene') || '').trim();
const commitSha = String(params.get('previewCommit') || '').trim().toLowerCase();
const pullRequestNumber = String(params.get('previewPr') || '').trim();
const dom = {
  banner: document.getElementById('workspacePreviewBanner'),
  details: document.getElementById('previewDetails'),
  backLink: document.getElementById('previewBackLink'),
  prLink: document.getElementById('previewPrLink'),
  overlay: document.getElementById('overlay'),
};

try {
  validatePreviewRequest();
  configurePreviewBanner();
  isolatePreviewSaves();
  installCommitContentFetch();
  await import('./src/save-menu-guard.js');
  await import('./src/main.js');
} catch (error) {
  showPreviewError(error);
}

function validatePreviewRequest() {
  if (!ID_PATTERN.test(gameId)) {
    throw new Error('The draft preview link has an invalid or missing game id. Return to the workspace and publish again.');
  }
  if (sceneId && !ID_PATTERN.test(sceneId)) {
    throw new Error('The draft preview link contains an invalid scene id.');
  }
  if (!COMMIT_PATTERN.test(commitSha)) {
    throw new Error('The draft preview link has an invalid or missing commit. Return to the workspace and publish again.');
  }
  if (pullRequestNumber && !PR_PATTERN.test(pullRequestNumber)) {
    throw new Error('The draft preview link contains an invalid pull request number.');
  }
}

function configurePreviewBanner() {
  const workspaceUrl = new URL('./builder/workspace.html', window.location.href);
  workspaceUrl.searchParams.set('game', gameId);
  dom.backLink.href = workspaceUrl.href;
  dom.details.textContent = `${gameId}${sceneId ? ` › ${sceneId}` : ''} • content commit ${commitSha.slice(0, 8)}`;

  if (pullRequestNumber) {
    dom.prLink.href = `https://github.com/${REPOSITORY_OWNER}/${REPOSITORY_NAME}/pull/${pullRequestNumber}`;
    dom.prLink.textContent = `Open Draft PR #${pullRequestNumber}`;
    dom.prLink.hidden = false;
  }
}

function isolatePreviewSaves() {
  const livePrefix = `pixel_engine_save_${gameId}_slot_`;
  const previewPrefix = `pixel_engine_preview_save_${commitSha.slice(0, 12)}_${gameId}_slot_`;
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
    return new Response(`${JSON.stringify(manifest, null, 2)}\n`, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    });
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
  const message = error?.message || 'The draft game preview could not be loaded.';
  dom.banner.classList.add('preview-error');
  dom.details.textContent = message;
  dom.overlay.classList.remove('hidden');
  dom.overlay.innerHTML = '';

  const modal = document.createElement('div');
  modal.className = 'modal';
  const heading = document.createElement('h2');
  heading.textContent = 'Unable to Load Draft Preview';
  const details = document.createElement('p');
  details.textContent = message;
  const recovery = document.createElement('a');
  recovery.href = dom.backLink.href;
  recovery.textContent = 'Return to Game Workspace';
  modal.append(heading, details, recovery);
  dom.overlay.appendChild(modal);
}

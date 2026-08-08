export const LOCAL_PUBLISH_SCHEMA_VERSION = 1;
export const LOCAL_PUBLISH_PREFIX = 'pixel_engine_local_publish_';

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/i;

function safeId(value) {
  const id = String(value || '').trim().toLowerCase();
  return ID_PATTERN.test(id) ? id : '';
}

function safeJsonPath(value) {
  const path = String(value || '').trim().replace(/^\/+/, '');
  if (!path || !path.endsWith('.json') || path.includes('..')) return '';
  if (path.startsWith('.github/') || path.includes('/.github/')) return '';
  return path;
}

function normalizeFile(value) {
  const path = safeJsonPath(value?.path);
  const content = String(value?.content || '');
  if (!path || !content) return null;
  JSON.parse(content);
  return { path, content };
}

export function localPublishKey(projectId) {
  const id = safeId(projectId);
  if (!id) throw new Error('A valid game project is required for Publish & Play.');
  return `${LOCAL_PUBLISH_PREFIX}${id}`;
}

export function createLocalPublishSnapshot({ plan, sceneId = '', now = new Date(), snapshotId = '' }) {
  const projectId = safeId(plan?.projectId);
  const selectedSceneId = sceneId ? safeId(sceneId) : '';
  if (!projectId) throw new Error('The current publish plan has no valid game project.');
  if (sceneId && !selectedSceneId) throw new Error('The selected scene cannot be opened in the game.');
  if (plan?.errors?.length) throw new Error(plan.errors.join(' '));

  const files = [];
  const paths = new Set();
  for (const rawFile of plan?.files || []) {
    const file = normalizeFile(rawFile);
    if (!file) throw new Error('The local publish contains an invalid game file.');
    if (paths.has(file.path)) throw new Error(`The local publish contains the same file twice: ${file.path}`);
    paths.add(file.path);
    files.push(file);
  }

  const publishedAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const id = safeId(snapshotId) || `${Date.parse(publishedAt).toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  return {
    schemaVersion: LOCAL_PUBLISH_SCHEMA_VERSION,
    snapshotId: id,
    projectId,
    sceneId: selectedSceneId,
    publishedAt,
    files,
  };
}

export function normalizeLocalPublishSnapshot(value, expectedProjectId = value?.projectId) {
  if (!value || value.schemaVersion !== LOCAL_PUBLISH_SCHEMA_VERSION) {
    throw new Error('The browser publish is missing or unsupported. Return to the workspace and publish again.');
  }
  const projectId = safeId(value.projectId);
  if (!projectId || projectId !== safeId(expectedProjectId)) {
    throw new Error('The browser publish belongs to a different game project.');
  }
  const sceneId = value.sceneId ? safeId(value.sceneId) : '';
  const snapshotId = safeId(value.snapshotId);
  if (value.sceneId && !sceneId) throw new Error('The browser publish contains an invalid scene.');
  if (!snapshotId) throw new Error('The browser publish has no valid snapshot ID.');

  const files = [];
  const paths = new Set();
  for (const rawFile of value.files || []) {
    const file = normalizeFile(rawFile);
    if (!file || paths.has(file.path)) throw new Error('The browser publish contains an invalid or duplicate game file.');
    paths.add(file.path);
    files.push(file);
  }
  return {
    schemaVersion: LOCAL_PUBLISH_SCHEMA_VERSION,
    snapshotId,
    projectId,
    sceneId,
    publishedAt: String(value.publishedAt || ''),
    files,
  };
}

export function writeLocalPublishSnapshot(snapshot, storage = window.localStorage) {
  const normalized = normalizeLocalPublishSnapshot(snapshot, snapshot?.projectId);
  storage.setItem(localPublishKey(normalized.projectId), JSON.stringify(normalized));
  return normalized;
}

export function readLocalPublishSnapshot(projectId, storage = window.localStorage) {
  const raw = storage.getItem(localPublishKey(projectId));
  if (!raw) throw new Error('No browser publish was found. Return to the workspace and choose Publish & Play.');
  return normalizeLocalPublishSnapshot(JSON.parse(raw), projectId);
}

export function localPublishFileMap(snapshot) {
  return new Map(normalizeLocalPublishSnapshot(snapshot, snapshot?.projectId).files.map((file) => [file.path, file.content]));
}


export const BUILDER_ASSET_BUCKET = 'builder-assets';
export const WORKSPACE_DRAFT_SCHEMA_VERSION = 1;

function clone(value) {
  return value == null ? value : structuredClone(value);
}

export function safeEngineId(value, fallback = '') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || fallback;
}

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

export function payloadHash(value) {
  const source = stableStringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}-${source.length}`;
}

export function compareLocalAndCloud({ localPayload, cloudPayload, lastSyncedHash = '' }) {
  const hasLocal = localPayload !== null && localPayload !== undefined;
  const hasCloud = cloudPayload !== null && cloudPayload !== undefined;
  if (!hasLocal && !hasCloud) return { action: 'empty', localHash: '', cloudHash: '' };
  if (hasLocal && !hasCloud) return { action: 'upload', localHash: payloadHash(localPayload), cloudHash: '' };
  if (!hasLocal && hasCloud) return { action: 'download', localHash: '', cloudHash: payloadHash(cloudPayload) };

  const localHash = payloadHash(localPayload);
  const cloudHash = payloadHash(cloudPayload);
  if (localHash === cloudHash) return { action: 'same', localHash, cloudHash };
  if (lastSyncedHash && cloudHash === lastSyncedHash && localHash !== lastSyncedHash) {
    return { action: 'upload', localHash, cloudHash };
  }
  if (lastSyncedHash && localHash === lastSyncedHash && cloudHash !== lastSyncedHash) {
    return { action: 'download', localHash, cloudHash };
  }
  return { action: 'conflict', localHash, cloudHash };
}

export function normalizeCloudProject(raw) {
  if (!raw || typeof raw !== 'object' || !raw.id) return null;
  return {
    id: String(raw.id),
    ownerId: String(raw.owner_id || ''),
    gamePackageId: safeEngineId(raw.game_package_id || raw.stable_engine_id),
    name: String(raw.name || raw.game_package_id || 'Untitled Project'),
    metadata: raw.metadata && typeof raw.metadata === 'object' ? clone(raw.metadata) : {},
    createdAt: String(raw.created_at || ''),
    updatedAt: String(raw.updated_at || ''),
  };
}

export function normalizeCloudDraft(raw) {
  if (!raw || typeof raw !== 'object' || !raw.id) return null;
  return {
    id: String(raw.id),
    projectId: String(raw.project_id || ''),
    stableEngineId: safeEngineId(raw.stable_engine_id),
    payload: clone(raw.payload),
    payloadVersion: Math.max(1, Number(raw.payload_version) || 1),
    revision: Math.max(1, Number(raw.revision) || 1),
    createdAt: String(raw.created_at || ''),
    updatedAt: String(raw.updated_at || ''),
  };
}

export function normalizeCloudTestingLevel(raw) {
  if (!raw || typeof raw !== 'object' || !raw.id) return null;
  return {
    id: String(raw.id),
    projectId: raw.project_id ? String(raw.project_id) : null,
    stableEngineId: safeEngineId(raw.stable_engine_id),
    name: String(raw.name || raw.stable_engine_id || 'Testing Level'),
    payload: clone(raw.payload),
    payloadVersion: Math.max(1, Number(raw.payload_version) || 1),
    revision: Math.max(1, Number(raw.revision) || 1),
    createdAt: String(raw.created_at || ''),
    updatedAt: String(raw.updated_at || ''),
  };
}

export class CloudDataRepository {
  constructor(client) {
    if (!client?.rest) throw new Error('A Supabase client is required.');
    this.client = client;
  }

  currentUser() {
    const user = this.client.getSession?.()?.user;
    if (!user?.id) throw new Error('Sign in to use cloud builder storage.');
    return user;
  }

  async listProjects() {
    const rows = await this.client.rest('projects?select=*&order=updated_at.desc');
    return (Array.isArray(rows) ? rows : []).map(normalizeCloudProject).filter(Boolean);
  }

  async ensureProject({ gamePackageId, name, metadata = {} }) {
    const packageId = safeEngineId(gamePackageId);
    if (!packageId) throw new Error('A valid game package ID is required.');
    const query = `projects?select=*&game_package_id=eq.${encodeURIComponent(packageId)}&limit=1`;
    const rows = await this.client.rest(query);
    const existing = normalizeCloudProject(Array.isArray(rows) ? rows[0] : null);
    if (existing) return existing;

    const user = this.currentUser();
    const inserted = await this.client.rest('projects?select=*', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: {
        owner_id: user.id,
        game_package_id: packageId,
        stable_engine_id: packageId,
        name: String(name || packageId).trim() || packageId,
        metadata: metadata && typeof metadata === 'object' ? metadata : {},
      },
    });
    const project = normalizeCloudProject(Array.isArray(inserted) ? inserted[0] : inserted);
    if (!project) throw new Error('Cloud project could not be created.');
    return project;
  }

  async getWorkspaceDraft(projectId, stableEngineId) {
    const stableId = safeEngineId(stableEngineId);
    const query = `workspace_drafts?select=*&project_id=eq.${encodeURIComponent(projectId)}&stable_engine_id=eq.${encodeURIComponent(stableId)}&limit=1`;
    const rows = await this.client.rest(query);
    return normalizeCloudDraft(Array.isArray(rows) ? rows[0] : null);
  }

  async saveWorkspaceDraft({ projectId, stableEngineId, payload, payloadVersion = WORKSPACE_DRAFT_SCHEMA_VERSION, expectedRevision = 0 }) {
    const rows = await this.client.rest('rpc/save_workspace_draft', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: {
        p_project_id: projectId,
        p_stable_engine_id: safeEngineId(stableEngineId),
        p_payload: clone(payload),
        p_payload_version: Math.max(1, Number(payloadVersion) || 1),
        p_expected_revision: Math.max(0, Number(expectedRevision) || 0),
      },
    });
    const draft = normalizeCloudDraft(Array.isArray(rows) ? rows[0] : rows);
    if (!draft) throw new Error('Cloud draft save did not return a record.');
    return draft;
  }

  async deleteWorkspaceDraft(projectId, stableEngineId) {
    const stableId = safeEngineId(stableEngineId);
    await this.client.rest(`workspace_drafts?project_id=eq.${encodeURIComponent(projectId)}&stable_engine_id=eq.${encodeURIComponent(stableId)}`, {
      method: 'DELETE',
    });
  }

  async listTestingLevels({ projectId = null } = {}) {
    const filter = projectId
      ? `&project_id=eq.${encodeURIComponent(projectId)}`
      : '';
    const rows = await this.client.rest(`testing_levels?select=*&order=updated_at.desc${filter}`);
    return (Array.isArray(rows) ? rows : []).map(normalizeCloudTestingLevel).filter(Boolean);
  }

  async getTestingLevel(stableEngineId) {
    const stableId = safeEngineId(stableEngineId);
    const rows = await this.client.rest(`testing_levels?select=*&stable_engine_id=eq.${encodeURIComponent(stableId)}&limit=1`);
    return normalizeCloudTestingLevel(Array.isArray(rows) ? rows[0] : null);
  }

  async saveTestingLevel({ stableEngineId, name, payload, projectId = null, payloadVersion = 1 }) {
    const user = this.currentUser();
    const rows = await this.client.rest('testing_levels?on_conflict=owner_id,stable_engine_id&select=*', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: {
        owner_id: user.id,
        project_id: projectId,
        stable_engine_id: safeEngineId(stableEngineId),
        name: String(name || stableEngineId || 'Testing Level'),
        payload: clone(payload),
        payload_version: Math.max(1, Number(payloadVersion) || 1),
      },
    });
    const level = normalizeCloudTestingLevel(Array.isArray(rows) ? rows[0] : rows);
    if (!level) throw new Error('Cloud Testing Space save did not return a record.');
    return level;
  }

  async deleteTestingLevel(stableEngineId) {
    const stableId = safeEngineId(stableEngineId);
    await this.client.rest(`testing_levels?stable_engine_id=eq.${encodeURIComponent(stableId)}`, { method: 'DELETE' });
  }

  async uploadProjectAsset({ projectId, kind, file, metadata = {} }) {
    const user = this.currentUser();
    if (!projectId || !file) throw new Error('A project and file are required.');
    const assetKind = safeAssetKind(kind);
    const assetId = createUuid();
    const extension = safeExtension(file.name, file.type);
    const objectPath = `${user.id}/${projectId}/${assetKind}/${assetId}.${extension}`;
    await this.client.storageRequest(`object/${BUILDER_ASSET_BUCKET}/${objectPath.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'POST',
      headers: {
        'Content-Type': String(file.type || 'application/octet-stream'),
        'x-upsert': 'false',
      },
      body: file,
    });

    try {
      const rows = await this.client.rest('project_assets?select=*', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: {
          id: assetId,
          project_id: projectId,
          owner_id: user.id,
          stable_engine_id: assetId,
          asset_kind: assetKind,
          bucket_id: BUILDER_ASSET_BUCKET,
          object_path: objectPath,
          original_name: String(file.name || `${assetId}.${extension}`),
          mime_type: String(file.type || 'application/octet-stream'),
          byte_size: Number(file.size) || 0,
          metadata: metadata && typeof metadata === 'object' ? metadata : {},
        },
      });
      return Array.isArray(rows) ? rows[0] : rows;
    } catch (error) {
      try {
        await this.client.storageRequest(`object/${BUILDER_ASSET_BUCKET}/${objectPath.split('/').map(encodeURIComponent).join('/')}`, {
          method: 'DELETE',
        });
      } catch {
        // The metadata failure is the actionable error; orphan cleanup can be retried later.
      }
      throw error;
    }
  }
}

function safeAssetKind(value) {
  const kind = safeEngineId(value, 'other').replace(/:/g, '-');
  return ['textures', 'characters', 'sprites', 'npc-images', 'weapon-art', 'other'].includes(kind) ? kind : 'other';
}

function safeExtension(filename, mimeType) {
  const fromName = String(filename || '').toLowerCase().match(/\.([a-z0-9]{1,8})$/)?.[1];
  if (fromName && ['png', 'jpg', 'jpeg', 'webp', 'gif', 'json'].includes(fromName)) return fromName;
  const byMime = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'application/json': 'json',
  };
  return byMime[String(mimeType || '').toLowerCase()] || 'bin';
}

function createUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);
    const digit = char === 'x' ? value : (value & 0x3) | 0x8;
    return digit.toString(16);
  });
}


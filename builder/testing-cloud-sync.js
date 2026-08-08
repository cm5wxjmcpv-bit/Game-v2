import { payloadHash } from './cloud-data-model.js';
import {
  TESTING_LEVEL_LIBRARY_KEY,
  normalizeTestingLibrary,
} from './testing-library-model.js';

const TESTING_SYNC_METADATA_PREFIX = 'lc_forge_testing_sync_v1_';

export function mergeCloudTestingLevels(localLibrary, cloudLevels) {
  const normalizedLocal = normalizeTestingLibrary(localLibrary);
  const levels = [...normalizedLocal.levels];
  const byId = new Map(levels.map((entry) => [entry.libraryId, entry]));
  const conflicts = [];
  let added = 0;

  for (const cloud of cloudLevels || []) {
    let incoming;
    try {
      incoming = normalizeTestingLibrary({ version: 1, levels: [cloud?.payload] }).levels[0];
    } catch {
      incoming = null;
    }
    if (!incoming) continue;
    const existing = byId.get(incoming.libraryId);
    if (!existing) {
      byId.set(incoming.libraryId, incoming);
      levels.push(incoming);
      added += 1;
    } else if (payloadHash(existing) !== payloadHash(incoming)) {
      conflicts.push({
        libraryId: incoming.libraryId,
        local: existing,
        cloud: incoming,
        cloudRevision: cloud.revision,
        cloudUpdatedAt: cloud.updatedAt,
      });
    }
  }

  return {
    library: normalizeTestingLibrary({ version: 1, levels }),
    conflicts,
    added,
  };
}

export class TestingCloudSyncController {
  constructor({
    repository,
    storage = globalThis.localStorage,
    eventTarget = globalThis.window,
    online = () => globalThis.navigator?.onLine !== false,
    onStatus = () => {},
    debounceMs = 1200,
    scanMs = 900,
    remotePollMs = 30000,
  } = {}) {
    if (!repository) throw new Error('A cloud repository is required.');
    this.repository = repository;
    this.storage = storage;
    this.eventTarget = eventTarget;
    this.online = online;
    this.onStatus = onStatus;
    this.debounceMs = debounceMs;
    this.scanMs = scanMs;
    this.remotePollMs = remotePollMs;
    this.allowUploads = false;
    this.userId = '';
    this.observedHash = '';
    this.pendingTimer = null;
    this.scanHandle = null;
    this.remoteHandle = null;
    this.conflicts = [];
    this.remoteById = new Map();
    this.boundOnline = () => this.refreshFromCloud();
  }

  metadataKey() {
    return `${TESTING_SYNC_METADATA_PREFIX}${this.userId}`;
  }

  readLibrary() {
    try {
      return normalizeTestingLibrary(JSON.parse(this.storage?.getItem?.(TESTING_LEVEL_LIBRARY_KEY) || 'null'));
    } catch {
      return normalizeTestingLibrary(null);
    }
  }

  writeLibrary(library) {
    const normalized = normalizeTestingLibrary(library);
    this.storage?.setItem?.(TESTING_LEVEL_LIBRARY_KEY, JSON.stringify(normalized));
    this.observedHash = payloadHash(normalized);
    this.dispatch('lc-forge-testing-library-restored', { count: normalized.levels.length });
    return normalized;
  }

  readMetadata() {
    try {
      const value = JSON.parse(this.storage?.getItem?.(this.metadataKey()) || 'null');
      return value && typeof value === 'object' ? value : {};
    } catch {
      return {};
    }
  }

  writeMetadata(metadata) {
    try {
      this.storage?.setItem?.(this.metadataKey(), JSON.stringify({ ...metadata, updatedAt: new Date().toISOString() }));
    } catch {
      // Cloud sync remains functional without optional local metadata.
    }
  }

  async start({ allowUploads = true } = {}) {
    this.stop();
    this.userId = String(this.repository.currentUser().id);
    this.allowUploads = Boolean(allowUploads);
    this.observedHash = payloadHash(this.readLibrary());
    await this.refreshFromCloud();
    this.scanHandle = setInterval(() => this.scanLocalChanges(), this.scanMs);
    this.remoteHandle = setInterval(() => this.refreshFromCloud(), this.remotePollMs);
    this.eventTarget?.addEventListener?.('online', this.boundOnline);
  }

  stop() {
    if (this.scanHandle) clearInterval(this.scanHandle);
    if (this.remoteHandle) clearInterval(this.remoteHandle);
    if (this.pendingTimer) clearTimeout(this.pendingTimer);
    this.scanHandle = null;
    this.remoteHandle = null;
    this.pendingTimer = null;
    this.eventTarget?.removeEventListener?.('online', this.boundOnline);
    this.remoteById.clear();
    this.conflicts = [];
  }

  async refreshFromCloud() {
    if (!this.online()) {
      this.emit('offline', 'Offline — Testing Space saved locally');
      return;
    }
    try {
      const cloudLevels = await this.repository.listTestingLevels();
      this.remoteById = new Map(cloudLevels.map((entry) => [entry.stableEngineId, entry]));
      const merged = mergeCloudTestingLevels(this.readLibrary(), cloudLevels);
      this.conflicts = merged.conflicts;
      if (merged.added) this.writeLibrary(merged.library);
      else this.observedHash = payloadHash(this.readLibrary());
      if (this.conflicts.length) {
        this.emit('conflict', `${this.conflicts.length} Testing Space conflict${this.conflicts.length === 1 ? '' : 's'} — both copies preserved`);
      } else if (this.allowUploads) {
        await this.pushLocalChanges();
      } else {
        this.emit('saved-local', 'Testing Space remains local until you import it');
      }
    } catch (error) {
      this.emitError(error);
    }
  }

  scanLocalChanges() {
    const library = this.readLibrary();
    const hash = payloadHash(library);
    if (hash === this.observedHash) return;
    this.observedHash = hash;
    this.emit('saved-local', 'Testing Space: Saved locally');
    if (!this.allowUploads) return;
    if (this.pendingTimer) clearTimeout(this.pendingTimer);
    this.pendingTimer = setTimeout(() => {
      this.pendingTimer = null;
      this.pushLocalChanges();
    }, this.debounceMs);
  }

  async pushLocalChanges() {
    if (!this.allowUploads) return;
    if (!this.online()) {
      this.emit('offline', 'Offline — Testing Space saved locally');
      return;
    }
    const library = this.readLibrary();
    const metadata = this.readMetadata();
    const lastHashes = metadata.hashes && typeof metadata.hashes === 'object' ? metadata.hashes : {};
    const lastIds = new Set(Array.isArray(metadata.ids) ? metadata.ids : []);
    const localIds = new Set(library.levels.map((entry) => entry.libraryId));
    const conflicts = [];
    this.emit('saving', 'Testing Space: Saving…');
    try {
      for (const entry of library.levels) {
        const localHash = payloadHash(entry);
        const cloud = this.remoteById.get(entry.libraryId);
        const cloudHash = cloud ? payloadHash(cloud.payload) : '';
        if (cloudHash === localHash) continue;
        if (cloud && lastHashes[entry.libraryId] && lastHashes[entry.libraryId] !== cloudHash) {
          conflicts.push({ libraryId: entry.libraryId, local: entry, cloud: cloud.payload });
          continue;
        }
        const saved = await this.repository.saveTestingLevel({
          stableEngineId: entry.libraryId,
          name: entry.name,
          payload: entry,
        });
        this.remoteById.set(entry.libraryId, saved);
      }

      for (const removedId of lastIds) {
        if (localIds.has(removedId) || !this.remoteById.has(removedId)) continue;
        await this.repository.deleteTestingLevel(removedId);
        this.remoteById.delete(removedId);
      }

      this.conflicts = conflicts;
      const hashes = Object.fromEntries([...this.remoteById.entries()].map(([id, row]) => [id, payloadHash(row.payload)]));
      this.writeMetadata({ ids: [...this.remoteById.keys()].sort(), hashes });
      if (conflicts.length) {
        this.emit('conflict', `${conflicts.length} Testing Space conflict${conflicts.length === 1 ? '' : 's'} — both copies preserved`);
      } else {
        this.emit('saved-cloud', 'Testing Space Cloud: Saved');
      }
    } catch (error) {
      this.emitError(error);
    }
  }

  emitError(error) {
    if (error?.code === 'network_error' || !this.online()) {
      this.emit('offline', 'Offline — Testing Space saved locally');
    } else if (error?.status === 401 || error?.code === 'session_expired') {
      this.emit('auth-expired', 'Cloud session expired — Testing Space saved locally');
    } else {
      this.emit('sync-failed', 'Testing Space sync failed — saved locally');
    }
  }

  emit(state, label) {
    const detail = { state, label, surface: 'testing-space', conflicts: this.conflicts.length };
    this.onStatus(detail);
    this.dispatch('lc-forge-cloud-status', detail);
  }

  dispatch(name, detail) {
    if (!this.eventTarget?.dispatchEvent) return;
    const CustomEventConstructor = this.eventTarget.CustomEvent || globalThis.CustomEvent;
    if (typeof CustomEventConstructor === 'function') {
      this.eventTarget.dispatchEvent(new CustomEventConstructor(name, { detail }));
    }
  }
}


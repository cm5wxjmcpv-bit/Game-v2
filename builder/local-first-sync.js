import { compareLocalAndCloud, payloadHash } from './cloud-data-model.js';

export const WORKSPACE_SYNC_SLOTS = Object.freeze([
  Object.freeze({ id: 'workspace', keyPrefix: 'pixel_engine_builder_workspace_', label: 'Workspace' }),
  Object.freeze({ id: 'workspace-assets', keyPrefix: 'pixel_engine_builder_assets_', label: 'Staged assets' }),
  Object.freeze({ id: 'weapon-autosave', keyPrefix: 'pixel_engine_weapon_maker_draft_', label: 'Weapon autosave' }),
]);

const SYNC_METADATA_PREFIX = 'lc_forge_cloud_sync_v1_';

export class WorkspaceSyncController {
  constructor({
    repository,
    storage = globalThis.localStorage,
    eventTarget = globalThis.window,
    online = () => globalThis.navigator?.onLine !== false,
    onStatus = () => {},
    debounceMs = 1200,
    scanMs = 800,
    remotePollMs = 30000,
    setTimer = globalThis.setTimeout?.bind(globalThis),
    clearTimer = globalThis.clearTimeout?.bind(globalThis),
    setRepeating = globalThis.setInterval?.bind(globalThis),
    clearRepeating = globalThis.clearInterval?.bind(globalThis),
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
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.setRepeating = setRepeating;
    this.clearRepeating = clearRepeating;
    this.project = null;
    this.packageId = '';
    this.userId = '';
    this.generation = 0;
    this.observedHashes = new Map();
    this.pendingTimers = new Map();
    this.conflicts = new Map();
    this.scanHandle = null;
    this.remoteHandle = null;
    this.boundOnline = () => this.syncAll('online');
    this.boundClear = (event) => this.handleLocalClear(event);
  }

  async start({ packageId, name, metadata = {} }) {
    this.stop();
    this.packageId = String(packageId || '').trim().toLowerCase();
    if (!this.packageId) throw new Error('A game package is required for cloud sync.');
    this.generation += 1;
    const generation = this.generation;
    this.userId = String(this.repository.currentUser().id);
    this.emit('saving', 'Connecting cloud project…');
    try {
      this.project = await this.repository.ensureProject({ gamePackageId: this.packageId, name, metadata });
      if (generation !== this.generation) return null;
      await this.syncAll('start');
      if (generation !== this.generation) return null;
      this.scanHandle = this.setRepeating?.(() => this.scanLocalChanges(), this.scanMs);
      this.remoteHandle = this.setRepeating?.(() => this.syncAll('poll'), this.remotePollMs);
      this.eventTarget?.addEventListener?.('online', this.boundOnline);
      this.eventTarget?.addEventListener?.('lc-forge-local-draft-cleared', this.boundClear);
      return this.project;
    } catch (error) {
      this.emitError(error);
      throw error;
    }
  }

  stop() {
    this.generation += 1;
    if (this.scanHandle) this.clearRepeating?.(this.scanHandle);
    if (this.remoteHandle) this.clearRepeating?.(this.remoteHandle);
    this.scanHandle = null;
    this.remoteHandle = null;
    for (const timer of this.pendingTimers.values()) this.clearTimer?.(timer);
    this.pendingTimers.clear();
    this.eventTarget?.removeEventListener?.('online', this.boundOnline);
    this.eventTarget?.removeEventListener?.('lc-forge-local-draft-cleared', this.boundClear);
    this.project = null;
    this.packageId = '';
    this.observedHashes.clear();
    this.conflicts.clear();
  }

  slotDefinition(slotId) {
    return WORKSPACE_SYNC_SLOTS.find((slot) => slot.id === slotId) || null;
  }

  localKey(slot) {
    return `${slot.keyPrefix}${this.packageId}`;
  }

  metadataKey(slot) {
    return `${SYNC_METADATA_PREFIX}${this.userId}_${this.packageId}_${slot.id}`;
  }

  readLocal(slot) {
    try {
      const raw = this.storage?.getItem?.(this.localKey(slot));
      if (raw === null || raw === undefined || raw === '') return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  writeLocal(slot, payload) {
    this.storage?.setItem?.(this.localKey(slot), JSON.stringify(payload));
    this.observedHashes.set(slot.id, payloadHash(payload));
  }

  readMetadata(slot) {
    try {
      const value = JSON.parse(this.storage?.getItem?.(this.metadataKey(slot)) || 'null');
      return value && typeof value === 'object' ? value : {};
    } catch {
      return {};
    }
  }

  writeMetadata(slot, next) {
    const current = this.readMetadata(slot);
    this.storage?.setItem?.(this.metadataKey(slot), JSON.stringify({
      ...current,
      ...next,
      projectId: this.project?.id || current.projectId || '',
      updatedAt: new Date().toISOString(),
    }));
  }

  async syncAll(reason = 'manual') {
    if (!this.project || !this.online()) {
      this.emit('offline', 'Offline — saved locally');
      return;
    }
    const generation = this.generation;
    for (const slot of WORKSPACE_SYNC_SLOTS) {
      if (generation !== this.generation) return;
      await this.reconcileSlot(slot, reason);
    }
    if (this.conflicts.size) {
      const [slotId, conflict] = this.conflicts.entries().next().value;
      this.emit('conflict', `${conflict.slot.label}: Cloud copy newer`, { slotId, conflict: true });
    }
  }

  async reconcileSlot(slot, reason = 'manual') {
    if (!this.project) return;
    const localPayload = this.readLocal(slot);
    const metadata = this.readMetadata(slot);
    let cloud;
    try {
      cloud = await this.repository.getWorkspaceDraft(this.project.id, slot.id);
    } catch (error) {
      this.emitError(error, slot);
      return;
    }

    if (!localPayload && cloud && metadata.suppressCloudRestore) {
      this.observedHashes.set(slot.id, '');
      this.emit('cloud-available', `${slot.label}: cloud copy retained`, { slotId: slot.id });
      return;
    }

    const comparison = compareLocalAndCloud({
      localPayload,
      cloudPayload: cloud?.payload,
      lastSyncedHash: metadata.lastSyncedHash || '',
    });

    if (comparison.action === 'empty') {
      this.observedHashes.set(slot.id, '');
      if (reason === 'start') this.emit('saved-local', 'No cloud draft yet — local saves remain active');
      return;
    }

    if (comparison.action === 'same') {
      this.conflicts.delete(slot.id);
      this.writeMetadata(slot, {
        lastSyncedHash: comparison.localHash,
        cloudRevision: cloud?.revision || metadata.cloudRevision || 0,
        suppressCloudRestore: false,
      });
      this.observedHashes.set(slot.id, comparison.localHash);
      this.emit('saved-cloud', 'Cloud: Saved', { slotId: slot.id });
      return;
    }

    if (comparison.action === 'download') {
      try {
        this.writeLocal(slot, cloud.payload);
        this.conflicts.delete(slot.id);
        this.writeMetadata(slot, {
          lastSyncedHash: comparison.cloudHash,
          cloudRevision: cloud.revision,
          suppressCloudRestore: false,
        });
        this.emit('saved-cloud', `${slot.label}: cloud copy restored`, { slotId: slot.id });
        this.dispatch('lc-forge-cloud-draft-restored', { packageId: this.packageId, slotId: slot.id });
      } catch {
        this.emit('sync-failed', `${slot.label}: cloud copy is safe, but local storage could not be updated`, { slotId: slot.id });
      }
      return;
    }

    if (comparison.action === 'upload') {
      await this.uploadSlot(slot, localPayload, cloud?.revision || 0);
      return;
    }

    this.conflicts.set(slot.id, { slot, localPayload, cloud });
    this.emit('conflict', `${slot.label}: Cloud copy newer`, {
      slotId: slot.id,
      conflict: true,
      localUpdatedAt: localPayload?.savedAt || localPayload?.updatedAt || '',
      cloudUpdatedAt: cloud?.updatedAt || '',
    });
  }

  async uploadSlot(slot, payload, expectedRevision) {
    if (!payload || !this.project) return;
    this.emit('saving', `${slot.label}: Saving…`, { slotId: slot.id });
    try {
      const saved = await this.repository.saveWorkspaceDraft({
        projectId: this.project.id,
        stableEngineId: slot.id,
        payload,
        payloadVersion: Number(payload?.version) || 1,
        expectedRevision,
      });
      const hash = payloadHash(payload);
      this.conflicts.delete(slot.id);
      this.writeMetadata(slot, {
        lastSyncedHash: hash,
        cloudRevision: saved.revision,
        suppressCloudRestore: false,
      });
      this.observedHashes.set(slot.id, hash);
      this.emit('saved-cloud', 'Cloud: Saved', { slotId: slot.id });
    } catch (error) {
      if (error?.status === 409 || error?.code === '40001' || error?.message === 'cloud_revision_conflict') {
        await this.reconcileSlot(slot, 'conflict');
      } else {
        this.emitError(error, slot);
      }
    }
  }

  scanLocalChanges() {
    if (!this.project) return;
    for (const slot of WORKSPACE_SYNC_SLOTS) {
      const local = this.readLocal(slot);
      const hash = local ? payloadHash(local) : '';
      const prior = this.observedHashes.get(slot.id);
      if (prior === undefined) {
        this.observedHashes.set(slot.id, hash);
        continue;
      }
      if (prior === hash) continue;
      this.observedHashes.set(slot.id, hash);
      if (!local) {
        this.writeMetadata(slot, { suppressCloudRestore: true });
        this.emit('saved-local', `${slot.label}: local copy cleared; cloud copy retained`, { slotId: slot.id });
        continue;
      }
      this.emit('saved-local', `${slot.label}: Saved locally`, { slotId: slot.id });
      const existing = this.pendingTimers.get(slot.id);
      if (existing) this.clearTimer?.(existing);
      const timer = this.setTimer?.(() => {
        this.pendingTimers.delete(slot.id);
        if (!this.online()) {
          this.emit('offline', 'Offline — saved locally', { slotId: slot.id });
          return;
        }
        this.reconcileSlot(slot, 'local-change');
      }, this.debounceMs);
      if (timer) this.pendingTimers.set(slot.id, timer);
    }
  }

  handleLocalClear(event) {
    if (event?.detail?.packageId !== this.packageId) return;
    const slot = this.slotDefinition(event.detail.slotId || 'workspace');
    if (!slot) return;
    this.writeMetadata(slot, { suppressCloudRestore: true });
    this.observedHashes.set(slot.id, '');
    this.emit('cloud-available', `${slot.label}: local copy cleared; cloud copy retained`, { slotId: slot.id });
  }

  async resolveConflict(slotId, strategy) {
    const conflict = this.conflicts.get(slotId);
    if (!conflict) return false;
    if (strategy === 'cloud') {
      try {
        this.writeLocal(conflict.slot, conflict.cloud.payload);
        this.writeMetadata(conflict.slot, {
          lastSyncedHash: payloadHash(conflict.cloud.payload),
          cloudRevision: conflict.cloud.revision,
          suppressCloudRestore: false,
        });
        this.conflicts.delete(slotId);
        this.emit('saved-cloud', `${conflict.slot.label}: cloud copy restored`, { slotId });
        this.dispatch('lc-forge-cloud-draft-restored', { packageId: this.packageId, slotId });
        return true;
      } catch {
        this.emit('sync-failed', `${conflict.slot.label}: local storage could not be updated`, { slotId });
        return false;
      }
    }
    if (strategy === 'local') {
      await this.uploadSlot(conflict.slot, conflict.localPayload, conflict.cloud.revision);
      return !this.conflicts.has(slotId);
    }
    return false;
  }

  conflictSlotIds() {
    return [...this.conflicts.keys()];
  }

  async restoreCloudCopy(slotId) {
    const slot = this.slotDefinition(slotId);
    if (!slot || !this.project) return false;
    this.writeMetadata(slot, { suppressCloudRestore: false });
    await this.reconcileSlot(slot, 'restore');
    return Boolean(this.readLocal(slot));
  }

  emitError(error, slot = null) {
    if (error?.code === 'network_error' || !this.online()) {
      this.emit('offline', 'Offline — saved locally', { slotId: slot?.id || '' });
      return;
    }
    if (error?.status === 401 || error?.code === 'session_expired' || error?.code === 'not_authenticated') {
      this.emit('auth-expired', 'Cloud session expired — saved locally', { slotId: slot?.id || '' });
      return;
    }
    this.emit('sync-failed', `${slot?.label ? `${slot.label}: ` : ''}Sync failed — saved locally`, { slotId: slot?.id || '' });
  }

  emit(state, label, extra = {}) {
    const detail = { state, label, packageId: this.packageId, projectId: this.project?.id || '', ...extra };
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

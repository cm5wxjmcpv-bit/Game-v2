import { payloadHash, safeEngineId } from './cloud-data-model.js';
import { TESTING_LEVEL_LIBRARY_KEY, normalizeTestingLibrary } from './testing-library-model.js';

export const LOCAL_MIGRATION_MARKER_PREFIX = 'lc_forge_local_migration_v1_';

const KEY_GROUPS = Object.freeze([
  Object.freeze({ prefix: 'pixel_engine_builder_workspace_', kind: 'workspace', slotId: 'workspace' }),
  Object.freeze({ prefix: 'pixel_engine_builder_assets_', kind: 'workspace-assets', slotId: 'workspace-assets' }),
  Object.freeze({ prefix: 'pixel_engine_weapon_maker_draft_', kind: 'weapon-autosave', slotId: 'weapon-autosave' }),
]);

const RETAINED_LOCAL_KEYS = Object.freeze([
  'levelBuilderCustomTextureLibrary',
  'levelBuilderTextureCustomColors',
]);

export function scanLocalBuilderData(storage = globalThis.localStorage) {
  const drafts = [];
  const corruptKeys = [];
  const retainedKeys = RETAINED_LOCAL_KEYS.filter((key) => safeGet(storage, key) !== null);

  for (const key of storageKeys(storage)) {
    const group = KEY_GROUPS.find((entry) => key.startsWith(entry.prefix));
    if (!group) continue;
    const projectId = safeEngineId(key.slice(group.prefix.length));
    if (!projectId) continue;
    try {
      const payload = JSON.parse(safeGet(storage, key));
      if (!payload || typeof payload !== 'object') throw new Error('invalid');
      drafts.push({ key, projectId, kind: group.kind, slotId: group.slotId, payload });
    } catch {
      corruptKeys.push(key);
    }
  }

  let testingLibrary = normalizeTestingLibrary(null);
  const testingRaw = safeGet(storage, TESTING_LEVEL_LIBRARY_KEY);
  if (testingRaw !== null) {
    try {
      testingLibrary = normalizeTestingLibrary(JSON.parse(testingRaw));
    } catch {
      corruptKeys.push(TESTING_LEVEL_LIBRARY_KEY);
    }
  }

  drafts.sort((a, b) => a.key.localeCompare(b.key));
  const fingerprint = payloadHash({
    drafts: drafts.map((entry) => ({ key: entry.key, hash: payloadHash(entry.payload) })),
    testing: testingLibrary.levels.map((entry) => ({ id: entry.libraryId, hash: payloadHash(entry) })),
  });
  return {
    drafts,
    testingLevels: testingLibrary.levels,
    retainedKeys,
    corruptKeys,
    migratableCount: drafts.length + testingLibrary.levels.length,
    fingerprint,
  };
}

export function migrationMarkerKey(userId) {
  return `${LOCAL_MIGRATION_MARKER_PREFIX}${String(userId || '')}`;
}

export function shouldOfferLocalMigration({ storage = globalThis.localStorage, userId }) {
  const scan = scanLocalBuilderData(storage);
  if (!scan.migratableCount) return { offer: false, scan, marker: null };
  let marker = null;
  try { marker = JSON.parse(safeGet(storage, migrationMarkerKey(userId)) || 'null'); } catch { marker = null; }
  return {
    offer: !marker?.completed || marker.fingerprint !== scan.fingerprint,
    scan,
    marker,
  };
}

export async function importLocalBuilderData({
  storage = globalThis.localStorage,
  repository,
  userId = repository?.currentUser?.()?.id,
  onProgress = () => {},
  now = () => new Date().toISOString(),
} = {}) {
  if (!repository) throw new Error('A cloud repository is required for migration.');
  const scan = scanLocalBuilderData(storage);
  const report = {
    found: scan.migratableCount,
    imported: 0,
    duplicates: 0,
    conflictsPreserved: 0,
    failed: 0,
    retainedLocal: scan.retainedKeys.length,
    corrupt: scan.corruptKeys.length,
    failures: [],
    originalsPreserved: true,
    completed: false,
  };
  const projectCache = new Map();
  let backupCounter = 0;

  async function ensureProject(packageId) {
    if (!projectCache.has(packageId)) {
      projectCache.set(packageId, repository.ensureProject({
        gamePackageId: packageId,
        name: packageId,
        metadata: { importedFromLocalStorage: true },
      }));
    }
    return projectCache.get(packageId);
  }

  for (const entry of scan.drafts) {
    onProgress({ current: report.imported + report.duplicates + report.conflictsPreserved + report.failed, total: scan.migratableCount, label: entry.key });
    try {
      const project = await ensureProject(entry.projectId);
      const existing = await repository.getWorkspaceDraft(project.id, entry.slotId);
      if (!existing) {
        await repository.saveWorkspaceDraft({
          projectId: project.id,
          stableEngineId: entry.slotId,
          payload: entry.payload,
          payloadVersion: Number(entry.payload?.version) || 1,
          expectedRevision: 0,
        });
        report.imported += 1;
      } else if (payloadHash(existing.payload) === payloadHash(entry.payload)) {
        report.duplicates += 1;
      } else {
        backupCounter += 1;
        const suffix = safeEngineId(`${Date.parse(now()) || Date.now()}-${backupCounter}`);
        await repository.saveWorkspaceDraft({
          projectId: project.id,
          stableEngineId: `${entry.slotId}:local-import-backup:${suffix}`.slice(0, 160),
          payload: entry.payload,
          payloadVersion: Number(entry.payload?.version) || 1,
          expectedRevision: 0,
        });
        report.conflictsPreserved += 1;
      }
    } catch (error) {
      report.failed += 1;
      report.failures.push({ key: entry.key, message: safeErrorMessage(error) });
    }
  }

  for (const entry of scan.testingLevels) {
    onProgress({ current: report.imported + report.duplicates + report.conflictsPreserved + report.failed, total: scan.migratableCount, label: entry.name });
    try {
      const existing = await repository.getTestingLevel(entry.libraryId);
      if (!existing) {
        await repository.saveTestingLevel({
          stableEngineId: entry.libraryId,
          name: entry.name,
          payload: entry,
        });
        report.imported += 1;
      } else if (payloadHash(existing.payload) === payloadHash(entry)) {
        report.duplicates += 1;
      } else {
        backupCounter += 1;
        const backupId = `${entry.libraryId}_local_${Date.parse(now()).toString(36)}_${backupCounter}`.slice(0, 160);
        await repository.saveTestingLevel({
          stableEngineId: backupId,
          name: `${entry.name} (local import copy)`,
          payload: { ...entry, libraryId: backupId, name: `${entry.name} (local import copy)` },
        });
        report.conflictsPreserved += 1;
      }
    } catch (error) {
      report.failed += 1;
      report.failures.push({ key: entry.libraryId, message: safeErrorMessage(error) });
    }
  }

  report.completed = report.failed === 0;
  try {
    storage?.setItem?.(migrationMarkerKey(userId), JSON.stringify({
      completed: report.completed,
      fingerprint: scan.fingerprint,
      completedAt: now(),
      report: {
        imported: report.imported,
        duplicates: report.duplicates,
        conflictsPreserved: report.conflictsPreserved,
        failed: report.failed,
      },
    }));
  } catch {
    // Migration succeeded even if the optional local completion marker cannot be stored.
  }
  onProgress({ current: scan.migratableCount, total: scan.migratableCount, label: 'Complete' });
  return report;
}

function storageKeys(storage) {
  const keys = [];
  const length = Number(storage?.length) || 0;
  for (let index = 0; index < length; index += 1) {
    const key = storage?.key?.(index);
    if (typeof key === 'string') keys.push(key);
  }
  return keys;
}

function safeGet(storage, key) {
  try { return storage?.getItem?.(key) ?? null; } catch { return null; }
}

function safeErrorMessage(error) {
  if (error?.code === 'network_error') return 'Cloud service unavailable';
  if (error?.status === 401) return 'Authentication expired';
  return String(error?.message || 'Import failed').slice(0, 180);
}


import { CloudDataRepository } from './cloud-data-model.js';
import {
  importLocalBuilderData,
  shouldOfferLocalMigration,
} from './local-data-migration.js';
import { WorkspaceSyncController } from './local-first-sync.js';
import { createSupabaseClient } from './supabase-client.js';
import { TestingCloudSyncController } from './testing-cloud-sync.js';

const mount = document.getElementById('cloudAccountMount');
const client = createSupabaseClient();
const repository = new CloudDataRepository(client);

let workspaceController = null;
let testingController = null;
let session = client.getSession();
let migrationState = null;
let lastStatus = { state: session ? 'saved-local' : 'signed-out', label: session ? 'Cloud: Connecting…' : 'Cloud: Signed out' };
let activeConflictSlot = '';
let cloudAvailableSlot = '';

if (mount) initializeCloudAccount();

function initializeCloudAccount() {
  installMarkup();
  bindEvents();
  client.onAuthStateChange((_event, nextSession) => {
    session = nextSession;
    renderAccount();
    if (session) startCloudServices();
    else stopCloudServices();
  });
  renderAccount();
  client.initialize().then((nextSession) => {
    session = nextSession;
    renderAccount();
  });
}

function installMarkup() {
  mount.innerHTML = `
    <button id="cloudAccountButton" class="cloud-account-button" type="button" aria-haspopup="dialog" aria-controls="cloudAccountDialog">
      <span class="cloud-status-dot" aria-hidden="true"></span>
      <span id="cloudAccountButtonLabel">Cloud: Signed out</span>
    </button>
    <dialog id="cloudAccountDialog" class="cloud-account-dialog" aria-labelledby="cloudAccountHeading">
      <div class="cloud-dialog-heading">
        <div><p class="cloud-kicker">L-C FORGE CLOUD</p><h2 id="cloudAccountHeading">Builder Account</h2></div>
        <button id="cloudAccountCloseButton" class="secondary-btn" type="button" aria-label="Close cloud account">Close</button>
      </div>
      <div id="cloudSetupPanel" class="cloud-account-section" hidden>
        <h3>One safe setup value is still needed</h3>
        <p>In Supabase, open <strong>Project Settings → API Keys</strong> and copy the <strong>Publishable key</strong>. Add it to <code>builder/supabase-config.js</code> as <code>publishableKey</code>.</p>
        <p class="small">The Publishable key is browser-safe when Row Level Security is active. Never place the database password, a Secret key, <code>service_role</code>, or <code>DIRECT_URL</code> in this website.</p>
      </div>
      <form id="cloudSignInForm" class="cloud-account-section cloud-sign-in-form" novalidate>
        <h3>Sign in to cloud builder storage</h3>
        <label class="field-label" for="cloudEmailInput">Email</label>
        <input id="cloudEmailInput" class="text-input" type="email" autocomplete="username" required>
        <label class="field-label" for="cloudPasswordInput">Password</label>
        <input id="cloudPasswordInput" class="text-input" type="password" autocomplete="current-password" required>
        <button id="cloudSignInButton" type="submit">Sign In</button>
      </form>
      <section id="cloudSignedInPanel" class="cloud-account-section" hidden>
        <p>Signed in as <strong id="cloudSignedInEmail"></strong></p>
        <p id="cloudDetailedStatus" class="cloud-detailed-status" role="status" aria-live="polite"></p>
        <div id="cloudConflictActions" class="cloud-action-card" hidden>
          <strong>Choose which workspace copy to keep</strong>
          <p class="small">Neither copy will be discarded until you choose.</p>
          <div class="cloud-action-row">
            <button id="cloudKeepLocalButton" type="button">Keep Local</button>
            <button id="cloudUseCloudButton" class="secondary-btn" type="button">Use Cloud Copy</button>
          </div>
        </div>
        <div id="cloudRestoreActions" class="cloud-action-card" hidden>
          <strong>A cloud copy is still available</strong>
          <p class="small">Your local copy was cleared. The cloud copy was intentionally retained.</p>
          <button id="cloudRestoreButton" type="button">Restore Cloud Copy</button>
        </div>
        <div id="cloudMigrationPanel" class="cloud-action-card" hidden>
          <strong>Local builder data was found</strong>
          <p id="cloudMigrationSummary" class="small"></p>
          <button id="cloudMigrationButton" type="button">Import Local Data to Cloud</button>
          <p class="small">Original browser copies are kept until every import succeeds. Temporary map handoffs and player game saves are not uploaded.</p>
        </div>
        <div id="cloudMigrationReport" class="cloud-migration-report small" hidden></div>
        <button id="cloudSignOutButton" class="secondary-btn" type="button">Sign Out</button>
      </section>
      <p id="cloudAccountError" class="message error" role="alert" hidden></p>
    </dialog>`;
}

function elements() {
  return {
    button: document.getElementById('cloudAccountButton'),
    buttonLabel: document.getElementById('cloudAccountButtonLabel'),
    dialog: document.getElementById('cloudAccountDialog'),
    close: document.getElementById('cloudAccountCloseButton'),
    setup: document.getElementById('cloudSetupPanel'),
    signInForm: document.getElementById('cloudSignInForm'),
    email: document.getElementById('cloudEmailInput'),
    password: document.getElementById('cloudPasswordInput'),
    signInButton: document.getElementById('cloudSignInButton'),
    signedInPanel: document.getElementById('cloudSignedInPanel'),
    signedInEmail: document.getElementById('cloudSignedInEmail'),
    detailedStatus: document.getElementById('cloudDetailedStatus'),
    conflictActions: document.getElementById('cloudConflictActions'),
    keepLocal: document.getElementById('cloudKeepLocalButton'),
    useCloud: document.getElementById('cloudUseCloudButton'),
    restoreActions: document.getElementById('cloudRestoreActions'),
    restore: document.getElementById('cloudRestoreButton'),
    migrationPanel: document.getElementById('cloudMigrationPanel'),
    migrationSummary: document.getElementById('cloudMigrationSummary'),
    migrationButton: document.getElementById('cloudMigrationButton'),
    migrationReport: document.getElementById('cloudMigrationReport'),
    signOut: document.getElementById('cloudSignOutButton'),
    error: document.getElementById('cloudAccountError'),
  };
}

function bindEvents() {
  const dom = elements();
  dom.button.addEventListener('click', openDialog);
  dom.close.addEventListener('click', closeDialog);
  dom.dialog.addEventListener('click', (event) => {
    if (event.target === dom.dialog) closeDialog();
  });
  dom.signInForm.addEventListener('submit', signIn);
  dom.signOut.addEventListener('click', () => client.signOut().catch(showError));
  dom.migrationButton.addEventListener('click', runMigration);
  dom.keepLocal.addEventListener('click', () => resolveWorkspaceConflict('local'));
  dom.useCloud.addEventListener('click', () => resolveWorkspaceConflict('cloud'));
  dom.restore.addEventListener('click', restoreCloudCopy);
  window.addEventListener('pixel-engine-workspace-loaded', () => {
    if (session && !migrationState?.offer) startWorkspaceSync();
  });
  window.addEventListener('lc-forge-cloud-draft-restored', (event) => {
    if (event.detail?.slotId === 'workspace' || event.detail?.slotId === 'workspace-assets') {
      window.pixelEngineWorkspace?.reloadFromLocal?.();
    }
  });
}

function openDialog() {
  const dialog = elements().dialog;
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

function closeDialog() {
  const dialog = elements().dialog;
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
}

async function signIn(event) {
  event.preventDefault();
  const dom = elements();
  clearError();
  dom.signInButton.disabled = true;
  dom.signInButton.textContent = 'Signing in…';
  try {
    await client.signInWithPassword({ email: dom.email.value, password: dom.password.value });
    dom.password.value = '';
  } catch (error) {
    showError(friendlyAuthMessage(error));
  } finally {
    dom.signInButton.disabled = false;
    dom.signInButton.textContent = 'Sign In';
  }
}

async function startCloudServices() {
  if (!session?.user?.id || !client.isConfigured()) return;
  migrationState = shouldOfferLocalMigration({ userId: session.user.id });
  renderAccount();
  if (document.getElementById('testingLevelList')) {
    testingController ??= new TestingCloudSyncController({ repository, onStatus: updateStatus });
    await testingController.start({ allowUploads: !migrationState.offer }).catch(showError);
  }
  if (!migrationState.offer) await startWorkspaceSync();
  else updateStatus({ state: 'migration-needed', label: 'Cloud: Local data found' });
}

async function startWorkspaceSync() {
  const workspace = window.pixelEngineWorkspace?.getState?.();
  if (!session || !workspace?.projectId) return;
  workspaceController ??= new WorkspaceSyncController({ repository, onStatus: updateStatus });
  await workspaceController.start({
    packageId: workspace.projectId,
    name: workspace.projectMeta?.name || workspace.manifest?.name || workspace.projectId,
    metadata: { engineVersion: workspace.manifest?.engineVersion || '' },
  }).catch(showError);
}

function stopCloudServices() {
  workspaceController?.stop();
  testingController?.stop();
  activeConflictSlot = '';
  cloudAvailableSlot = '';
  migrationState = null;
  updateStatus({ state: 'signed-out', label: 'Cloud: Signed out' });
}

async function runMigration() {
  if (!session?.user?.id) return;
  const dom = elements();
  clearError();
  dom.migrationButton.disabled = true;
  dom.migrationButton.textContent = 'Importing…';
  try {
    const report = await importLocalBuilderData({
      repository,
      userId: session.user.id,
      onProgress: ({ current, total }) => updateStatus({ state: 'saving', label: `Importing local data ${current}/${total}…` }),
    });
    dom.migrationReport.hidden = false;
    dom.migrationReport.textContent = `${report.imported} imported, ${report.duplicates} already matched, ${report.conflictsPreserved} conflict backup${report.conflictsPreserved === 1 ? '' : 's'} preserved, ${report.failed} failed. Original browser data was kept.${report.retainedLocal ? ' Unassigned texture preferences remain local until attached to a project.' : ''}`;
    migrationState = shouldOfferLocalMigration({ userId: session.user.id });
    renderAccount();
    if (!migrationState.offer) {
      await startWorkspaceSync();
      if (testingController) await testingController.start({ allowUploads: true });
    } else {
      updateStatus({ state: 'sync-failed', label: 'Import incomplete — local originals retained' });
    }
  } catch (error) {
    showError(error);
  } finally {
    dom.migrationButton.disabled = false;
    dom.migrationButton.textContent = 'Import Local Data to Cloud';
  }
}

async function resolveWorkspaceConflict(strategy) {
  if (!workspaceController || !activeConflictSlot) return;
  await workspaceController.resolveConflict(activeConflictSlot, strategy);
}

async function restoreCloudCopy() {
  if (!workspaceController || !cloudAvailableSlot) return;
  await workspaceController.restoreCloudCopy(cloudAvailableSlot);
}

function updateStatus(detail) {
  lastStatus = detail || lastStatus;
  if (detail?.conflict || detail?.state === 'conflict') activeConflictSlot = detail.slotId || activeConflictSlot;
  else if (detail?.slotId && detail.slotId === activeConflictSlot && !workspaceController?.conflictSlotIds?.().includes(activeConflictSlot)) activeConflictSlot = '';
  if (detail?.state === 'cloud-available') cloudAvailableSlot = detail.slotId || cloudAvailableSlot;
  else if (detail?.slotId && detail.slotId === cloudAvailableSlot && detail.state === 'saved-cloud') cloudAvailableSlot = '';
  renderStatus();
}

function renderAccount() {
  const dom = elements();
  const configured = client.isConfigured();
  const signedIn = Boolean(session?.user?.id);
  dom.setup.hidden = configured;
  dom.signInForm.hidden = signedIn || !configured;
  dom.signedInPanel.hidden = !signedIn;
  dom.signedInEmail.textContent = String(session?.user?.email || 'builder account');
  dom.migrationPanel.hidden = !signedIn || !migrationState?.offer;
  if (migrationState?.offer) {
    const { scan } = migrationState;
    dom.migrationSummary.textContent = `${scan.drafts.length} project draft${scan.drafts.length === 1 ? '' : 's'} and ${scan.testingLevels.length} Testing Space map${scan.testingLevels.length === 1 ? '' : 's'} can be imported. ${scan.retainedKeys.length ? `${scan.retainedKeys.length} unassigned texture preference set${scan.retainedKeys.length === 1 ? '' : 's'} will remain local for safety.` : ''}`;
  }
  if (!configured) lastStatus = { state: 'setup-needed', label: 'Cloud: Setup needed' };
  else if (!signedIn) lastStatus = { state: 'signed-out', label: 'Cloud: Signed out' };
  renderStatus();
}

function renderStatus() {
  const dom = elements();
  dom.button.dataset.cloudState = lastStatus.state || '';
  dom.buttonLabel.textContent = lastStatus.label || 'Cloud';
  dom.detailedStatus.textContent = lastStatus.label || '';
  dom.conflictActions.hidden = !activeConflictSlot;
  dom.restoreActions.hidden = !cloudAvailableSlot;
}

function showError(error) {
  const dom = elements();
  dom.error.hidden = false;
  dom.error.textContent = typeof error === 'string' ? error : friendlyAuthMessage(error);
}

function clearError() {
  const dom = elements();
  dom.error.hidden = true;
  dom.error.textContent = '';
}

function friendlyAuthMessage(error) {
  if (typeof error === 'string') return error;
  if (error?.code === 'configuration_missing') return error.message;
  if (error?.code === 'network_error') return 'Cloud service could not be reached. Your local work is still safe.';
  if (error?.status === 400 || error?.status === 401) return 'Sign-in failed. Check the email and password and try again.';
  return String(error?.message || 'Cloud account action failed.');
}

export const WORKSPACE_PUBLISH_SCHEMA_VERSION = 1;
export const WORKSPACE_PUBLISH_REPOSITORY = 'cm5wxjmcpv-bit/Game-v2';
export const WORKSPACE_PUBLISH_BASE_BRANCH = 'main';

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

export function cleanWorkspaceJson(value) {
  if (Array.isArray(value)) return value.map(cleanWorkspaceJson);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !key.startsWith('_workspace'))
    .map(([key, entry]) => [key, cleanWorkspaceJson(entry)]));
}

function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])]));
}

export function canonicalJson(value) {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  return JSON.stringify(sorted(parsed));
}

export function jsonFileText(value) {
  return `${JSON.stringify(cleanWorkspaceJson(value), null, 2)}\n`;
}

function safeId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function repoPathFromUrl(fileUrl, repositoryRootUrl) {
  const file = new URL(fileUrl);
  const root = new URL(repositoryRootUrl);
  if (file.origin !== root.origin || !file.pathname.startsWith(root.pathname)) {
    throw new Error('A publish target resolves outside this repository.');
  }
  const path = decodeURIComponent(file.pathname.slice(root.pathname.length)).replace(/^\/+/, '');
  if (!path || path.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('A publish target has an unsafe repository path.');
  }
  if (!path.endsWith('.json') || path.startsWith('.github/') || path.includes('/.github/')) {
    throw new Error(`Publishing is limited to package JSON files: ${path}`);
  }
  return path;
}

function changed(current, baseline) {
  return canonicalJson(cleanWorkspaceJson(current)) !== canonicalJson(cleanWorkspaceJson(baseline));
}

function pushFile(files, seen, file) {
  if (seen.has(file.path)) throw new Error(`Two workspace changes target the same file: ${file.path}`);
  seen.add(file.path);
  files.push(file);
}

export function buildWorkspacePublishPlan({
  projectId,
  manifest,
  contentRootUrl,
  repositoryRootUrl,
  actors,
  baselineActors,
  scenes,
  baselineScenes,
}) {
  const normalizedProjectId = safeId(projectId);
  const errors = [];
  const warnings = [];
  const files = [];
  const seen = new Set();
  if (!normalizedProjectId) errors.push('A game project is required.');
  if (!manifest || typeof manifest !== 'object') errors.push('The package manifest is unavailable.');

  const data = manifest?.data || {};
  const currentActors = cleanWorkspaceJson(actors || []);
  const originalActors = cleanWorkspaceJson(baselineActors || []);
  if (changed(currentActors, originalActors)) {
    if (!data.actors) {
      errors.push('Actor changes cannot be published because this package has no direct actors file in its manifest.');
    } else {
      try {
        const path = repoPathFromUrl(new URL(data.actors, contentRootUrl), repositoryRootUrl);
        pushFile(files, seen, {
          kind: 'actors',
          id: 'actors',
          path,
          operation: 'update',
          baselineContent: jsonFileText({ actors: originalActors }),
          content: jsonFileText({ actors: currentActors }),
        });
      } catch (error) {
        errors.push(error.message);
      }
    }
  }

  const originals = new Map((baselineScenes || []).map((scene) => [scene.id, scene]));
  for (const scene of scenes || []) {
    const original = originals.get(scene.id);
    if (!original) {
      errors.push(`New scene “${scene.id}” cannot be published until package scaffolding is supported.`);
      continue;
    }
    if (!changed(scene, original)) continue;
    if (!scene._workspacePath) {
      errors.push(`Scene “${scene.id}” has no repository path.`);
      continue;
    }
    try {
      const path = repoPathFromUrl(new URL(scene._workspacePath, contentRootUrl), repositoryRootUrl);
      pushFile(files, seen, {
        kind: 'scene',
        id: scene.id,
        path,
        operation: 'update',
        baselineContent: jsonFileText(original),
        content: jsonFileText(scene),
      });
    } catch (error) {
      errors.push(error.message);
    }
  }

  if (files.length > 50) errors.push('A single workspace publish is limited to 50 files.');
  if (!files.length && !errors.length) warnings.push('No actor or scene changes are ready to publish.');

  return {
    schemaVersion: WORKSPACE_PUBLISH_SCHEMA_VERSION,
    repository: WORKSPACE_PUBLISH_REPOSITORY,
    baseBranch: WORKSPACE_PUBLISH_BASE_BRANCH,
    projectId: normalizedProjectId,
    createdAt: new Date().toISOString(),
    files: clone(files),
    errors,
    warnings,
  };
}

export function validateWorkspacePublishPlan(plan) {
  if (!plan || plan.schemaVersion !== WORKSPACE_PUBLISH_SCHEMA_VERSION) {
    throw new Error('The workspace publish plan is missing or unsupported.');
  }
  if (plan.repository !== WORKSPACE_PUBLISH_REPOSITORY || plan.baseBranch !== WORKSPACE_PUBLISH_BASE_BRANCH) {
    throw new Error('The workspace publish target is not allowed.');
  }
  if (!safeId(plan.projectId)) throw new Error('The publish plan has no valid project ID.');
  if (plan.errors?.length) throw new Error(plan.errors.join(' '));
  if (!Array.isArray(plan.files) || !plan.files.length) throw new Error('No changed files are ready to publish.');
  if (plan.files.length > 50) throw new Error('The publish plan exceeds the 50-file limit.');
  const paths = new Set();
  for (const file of plan.files) {
    const operation = file?.operation || 'update';
    if (!file?.path || paths.has(file.path) || !file.path.endsWith('.json') || file.path.includes('..')) {
      throw new Error('The publish plan contains an unsafe or duplicate path.');
    }
    if (!['create', 'update'].includes(operation)) {
      throw new Error(`The publish plan contains an unsupported operation for ${file.path}.`);
    }
    if (file.path.startsWith('.github/') || file.path.includes('/.github/')) {
      throw new Error('The publish plan cannot modify GitHub configuration.');
    }
    if (plan.kind === 'new-game') {
      const packagePrefix = `games/${safeId(plan.projectId)}/`;
      if (operation === 'create' && !file.path.startsWith(packagePrefix)) {
        throw new Error(`New game files must stay inside ${packagePrefix}`);
      }
      if (operation === 'update' && file.path !== 'games/catalog.json') {
        throw new Error('A new game plan may update only games/catalog.json.');
      }
    }
    paths.add(file.path);
    if (operation === 'create') {
      if (file.baselineContent !== null && file.baselineContent !== undefined) {
        throw new Error(`New file ${file.path} must not include baseline content.`);
      }
    } else {
      canonicalJson(file.baselineContent);
    }
    canonicalJson(file.content);
  }
  return plan;
}

export function makeWorkspaceBranchName(projectId, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'z').toLowerCase();
  return `workspace/${safeId(projectId) || 'game'}-${stamp}`;
}

export function buildWorkspacePullRequestBody(plan) {
  validateWorkspacePublishPlan(plan);
  const fileList = plan.files
    .map((file) => `- \`${file.path}\` (${file.operation || 'update'})`)
    .join('\n');
  if (plan.kind === 'new-game') {
    return `## New Game Wizard\n\nPackage: \`${plan.projectId}\`\n\nThis draft pull request was generated by the Pixel Engine New Game Wizard. It creates a complete package scaffold and does not merge itself.\n\n### Files\n\n${fileList}\n\n### Safety\n\n- The catalog was compared with the current \`${plan.baseBranch}\` version before the branch was created.\n- Every new package path was confirmed absent from the exact base commit.\n- Only reviewed JSON files under the game package structure are included.\n- Engine Audit must pass before merge.\n`;
  }
  return `## Workspace publish\n\nPackage: \`${plan.projectId}\`\n\nThis draft pull request was created by the Pixel Engine project workspace. It does not merge itself.\n\n### Files\n\n${fileList}\n\n### Safety\n\n- Each file was compared with the current \`${plan.baseBranch}\` version before the branch was created.\n- Only manifest-resolved actor and scene JSON paths are included.\n- Engine Audit must pass before merge.\n`;
}

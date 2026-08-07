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

function safeSceneId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
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

function newScenePublishTarget(scene, manifest) {
  const data = manifest?.data || {};
  const kind = scene?.mapType === 'town' ? 'town'
    : scene?.mapType === 'level' ? 'level'
      : scene?._workspaceKind === 'town' ? 'town'
        : scene?._workspaceKind === 'level' ? 'level'
          : 'scene';
  const directory = kind === 'town' ? data.townsDirectory
    : kind === 'level' ? data.levelsDirectory
      : data.scenesDirectory;
  if (!directory) throw new Error(`New ${kind} “${scene?.id || '(unnamed)'}” cannot be published because this package has no ${kind} directory.`);
  const sceneId = safeSceneId(scene?.id);
  if (!sceneId || sceneId !== String(scene?.id || '')) throw new Error(`New scene “${scene?.id || '(unnamed)'}” has an unsafe ID.`);
  const cleanDirectory = String(directory).replace(/\/$/, '');
  if (!cleanDirectory || cleanDirectory.includes('..') || cleanDirectory.startsWith('/')) throw new Error('The package manifest contains an unsafe scene directory.');
  const expectedPath = `${cleanDirectory}/${sceneId}.json`;
  if (scene?._workspacePath && scene._workspacePath !== expectedPath) {
    throw new Error(`New scene “${sceneId}” does not match its manifest directory.`);
  }
  return { kind, path: expectedPath };
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
  assetFiles = [],
  contentFiles = [],
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
      try {
        const target = newScenePublishTarget(scene, manifest);
        const path = repoPathFromUrl(new URL(target.path, contentRootUrl), repositoryRootUrl);
        pushFile(files, seen, {
          kind: `new ${target.kind}`,
          id: scene.id,
          path,
          operation: 'create',
          baselineContent: null,
          content: jsonFileText(scene),
        });
      } catch (error) {
        errors.push(error.message);
      }
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

  const packagePrefix = `games/${normalizedProjectId}/`;
  for (const contentFile of contentFiles || []) {
    try {
      const path = String(contentFile?.path || '');
      if (!path.endsWith('.json') || path.includes('..') || path.startsWith('.github/') || path.includes('/.github/')) {
        throw new Error(`The project content publish target is unsafe: ${path || '(missing path)'}`);
      }
      if (!path.startsWith(packagePrefix) && !path.startsWith('data/')) {
        throw new Error(`Project content files must stay inside ${packagePrefix} or the manifest-resolved data directory.`);
      }
      if (!changed(contentFile.currentPayload, contentFile.baselinePayload)) continue;
      pushFile(files, seen, {
        kind: contentFile.kind || 'weapons/rewards/shops',
        id: contentFile.id || 'project-content',
        path,
        operation: 'update',
        baselineContent: jsonFileText(contentFile.baselinePayload),
        content: jsonFileText(contentFile.currentPayload),
      });
    } catch (error) {
      errors.push(error.message);
    }
  }
  for (const assetFile of assetFiles || []) {
    try {
      const path = String(assetFile?.path || '');
      if (!path.endsWith('.json') || path.includes('..') || path.startsWith('.github/') || path.includes('/.github/')) {
        throw new Error(`The custom texture publish target is unsafe: ${path || '(missing path)'}`);
      }
      if (!path.startsWith(packagePrefix)) {
        throw new Error(`Custom texture files must stay inside ${packagePrefix}`);
      }
      if (!changed(assetFile.currentPayload, assetFile.baselinePayload)) continue;
      pushFile(files, seen, {
        kind: 'tiles/textures',
        id: 'custom-assets',
        path,
        operation: 'update',
        baselineContent: jsonFileText(assetFile.baselinePayload),
        content: jsonFileText(assetFile.currentPayload),
      });
    } catch (error) {
      errors.push(error.message);
    }
  }

  if (files.length > 50) errors.push('A single workspace publish is limited to 50 files.');
  if (!files.length && !errors.length) warnings.push('No actor, scene, weapon, reward, shop, tile, or texture changes are ready to publish.');

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
      const newPackagePrefix = `games/${safeId(plan.projectId)}/`;
      if (operation === 'create' && !file.path.startsWith(newPackagePrefix)) {
        throw new Error(`New game files must stay inside ${newPackagePrefix}`);
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
  return `## Workspace publish\n\nPackage: \`${plan.projectId}\`\n\nThis draft pull request was created by the Pixel Engine project workspace. It includes reviewed level, actor, entity, scene-object, tile, and custom-texture JSON changes. It does not merge itself.\n\n### Files\n\n${fileList}\n\n### Safety\n\n- Each file was compared with the current \`${plan.baseBranch}\` version before the branch was created.\n- New scenes are created only in manifest-declared town, level, or scene directories.\n- Only manifest-resolved package JSON paths are included.\n- Custom textures are embedded as PNG data URLs inside the package texture JSON; no unrelated repository files are written.\n- Engine Audit must pass before merge.\n`;
}

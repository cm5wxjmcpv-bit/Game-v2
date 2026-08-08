import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWorkspacePublishPlan,
  canonicalJson,
  makeWorkspaceBranchName,
  repoPathFromUrl,
  validateWorkspacePublishPlan,
} from '../../builder/workspace-publish-model.js';
import { publishWorkspacePlan } from '../../builder/workspace-publisher.js';

const baselineActor = {
  id: 'scene_actor',
  name: 'Scene Explorer',
  components: {
    movement: { speed: 3 },
    health: { max: 12 },
    combat: { attack: 0, defense: 0, agility: 1, growth: {} },
    wallet: { starting: 0 },
    inventory: { slots: 0, maxStack: 99 },
    equipment: { starting: {} },
    progression: { enabled: false },
    render: { sprite: null, fallback: { shape: 'circle', color: '#38bdf8', size: 20 } },
  },
};

const baselineScene = {
  id: 'scene_lab',
  name: 'Scene Lab',
  width: 2,
  height: 2,
  tiles: [['floor', 'wall'], ['floor', 'floor']],
  objects: { portals: [], shops: [], fountains: [], enemySpawns: [], battleTriggers: [] },
  entities: [],
  spawn: { x: 0, y: 0 },
  _workspacePath: 'data/scenes/scene_lab.json',
};

function planWithActorChange() {
  return buildWorkspacePublishPlan({
    projectId: 'scene-demo',
    manifest: { data: { actors: 'data/actors.json' } },
    contentRootUrl: new URL('https://example.test/L-C-Forge/games/scene-demo/'),
    repositoryRootUrl: new URL('https://example.test/L-C-Forge/'),
    actors: [{ ...baselineActor, name: 'Published Explorer' }],
    baselineActors: [baselineActor],
    scenes: [baselineScene],
    baselineScenes: [baselineScene],
  });
}

test('publish plan resolves only changed manifest actor and scene JSON paths', () => {
  const changedScene = { ...baselineScene, name: 'Updated Scene' };
  const plan = buildWorkspacePublishPlan({
    projectId: 'scene-demo',
    manifest: { data: { actors: 'data/actors.json' } },
    contentRootUrl: new URL('https://example.test/L-C-Forge/games/scene-demo/'),
    repositoryRootUrl: new URL('https://example.test/L-C-Forge/'),
    actors: [{ ...baselineActor, name: 'Published Explorer' }],
    baselineActors: [baselineActor],
    scenes: [changedScene],
    baselineScenes: [baselineScene],
  });
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.files.map((file) => file.path), [
    'games/scene-demo/data/actors.json',
    'games/scene-demo/data/scenes/scene_lab.json',
  ]);
  assert.equal(JSON.parse(plan.files[0].content).actors[0].name, 'Published Explorer');
  assert.equal(JSON.parse(plan.files[1].content).name, 'Updated Scene');
  assert.equal(validateWorkspacePublishPlan(plan), plan);
});

test('actor changes are blocked when a package has no direct actors file', () => {
  const plan = buildWorkspacePublishPlan({
    projectId: 'sample-rpg',
    manifest: { data: {} },
    contentRootUrl: new URL('https://example.test/L-C-Forge/'),
    repositoryRootUrl: new URL('https://example.test/L-C-Forge/'),
    actors: [{ ...baselineActor, name: 'Changed' }],
    baselineActors: [baselineActor],
    scenes: [baselineScene],
    baselineScenes: [baselineScene],
  });
  assert.match(plan.errors.join(' '), /no direct actors file/i);
  assert.throws(() => validateWorkspacePublishPlan(plan), /no direct actors file/i);
});

test('repository paths cannot escape the GitHub Pages project root', () => {
  assert.equal(
    repoPathFromUrl('https://example.test/L-C-Forge/games/demo/data/actors.json', 'https://example.test/L-C-Forge/'),
    'games/demo/data/actors.json',
  );
  assert.throws(
    () => repoPathFromUrl('https://example.test/other/actors.json', 'https://example.test/L-C-Forge/'),
    /outside this repository/i,
  );
});

test('branch names are deterministic, safe, and workspace scoped', () => {
  assert.equal(
    makeWorkspaceBranchName('Scene Demo', new Date('2026-07-29T20:30:45.123Z')),
    'workspace/scene-demo-20260729t203045z',
  );
});

test('publisher verifies main, creates one commit and opens a draft PR', async () => {
  const plan = planWithActorChange();
  const rawBaseline = {
    actors: [{
      id: 'scene_actor',
      name: 'Scene Explorer',
      components: baselineActor.components,
    }],
  };
  plan.files[0].baselineContent = `${JSON.stringify(rawBaseline, null, 2)}\n`;
  const calls = [];
  const jsonResponse = (payload, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  });
  const fetchImpl = async (url, options = {}) => {
    const path = new URL(url).pathname;
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ path, method, body, authorization: options.headers.Authorization });
    if (path === '/repos/cm5wxjmcpv-bit/L-C-Forge') return jsonResponse({ full_name: 'cm5wxjmcpv-bit/L-C-Forge' });
    if (path.endsWith('/git/ref/heads/main')) return jsonResponse({ object: { sha: 'base-sha' } });
    if (path.includes('/contents/games/scene-demo/data/actors.json')) {
      return jsonResponse({ type: 'file', encoding: 'base64', content: Buffer.from(JSON.stringify(rawBaseline)).toString('base64') });
    }
    if (path.endsWith('/git/commits/base-sha')) return jsonResponse({ tree: { sha: 'base-tree' } });
    if (path.endsWith('/git/blobs')) return jsonResponse({ sha: 'blob-sha' }, 201);
    if (path.endsWith('/git/trees')) return jsonResponse({ sha: 'tree-sha' }, 201);
    if (path.endsWith('/git/commits')) return jsonResponse({ sha: 'commit-sha' }, 201);
    if (path.endsWith('/git/refs')) return jsonResponse({ ref: body.ref }, 201);
    if (path.endsWith('/pulls')) return jsonResponse({ number: 22, html_url: 'https://github.com/cm5wxjmcpv-bit/L-C-Forge/pull/22' }, 201);
    return jsonResponse({ message: `Unexpected ${method} ${path}` }, 404);
  };

  const result = await publishWorkspacePlan({
    token: 'github_pat_test',
    plan,
    title: 'Workspace publish test',
    commitMessage: 'Publish workspace test',
    fetchImpl,
  });

  assert.equal(result.pullRequestNumber, 22);
  assert.equal(result.commitSha, 'commit-sha');
  assert.match(result.branch, /^workspace\/scene-demo-/);
  assert.ok(calls.every((call) => call.authorization === 'Bearer github_pat_test'));
  const prCall = calls.find((call) => call.path.endsWith('/pulls'));
  assert.equal(prCall.body.draft, true);
  assert.equal(prCall.body.base, 'main');
  assert.equal(prCall.body.head, result.branch);
  assert.deepEqual(calls.find((call) => call.path.endsWith('/git/trees')).body.tree, [{
    path: 'games/scene-demo/data/actors.json',
    mode: '100644',
    type: 'blob',
    sha: 'blob-sha',
  }]);
});

test('publisher rejects a stale remote file before creating a branch', async () => {
  const plan = planWithActorChange();
  const fetchImpl = async (url, options = {}) => {
    const path = new URL(url).pathname;
    if (path === '/repos/cm5wxjmcpv-bit/L-C-Forge') return { ok: true, status: 200, json: async () => ({ full_name: plan.repository }) };
    if (path.endsWith('/git/ref/heads/main')) return { ok: true, status: 200, json: async () => ({ object: { sha: 'base-sha' } }) };
    if (path.includes('/contents/')) {
      return { ok: true, status: 200, json: async () => ({ type: 'file', encoding: 'base64', content: Buffer.from('{"actors":[]}').toString('base64') }) };
    }
    assert.fail(`Publisher continued after stale check: ${options.method || 'GET'} ${path}`);
  };
  await assert.rejects(
    publishWorkspacePlan({ token: 'github_pat_test', plan, fetchImpl }),
    /changed on main/i,
  );
});

test('canonical JSON comparison ignores formatting and key order', () => {
  assert.equal(canonicalJson('{"b":2,"a":1}'), canonicalJson('{\n  "a": 1,\n  "b": 2\n}'));
});

import {
  buildWorkspacePullRequestBody,
  canonicalJson,
  makeWorkspaceBranchName,
  validateWorkspacePublishPlan,
} from './workspace-publish-model.js';

const API_ROOT = 'https://api.github.com';
const API_VERSION = '2022-11-28';

function decodeBase64(value) {
  const binary = atob(String(value || '').replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function readError(response) {
  try {
    const payload = await response.json();
    return payload.message || `GitHub API returned ${response.status}.`;
  } catch {
    return `GitHub API returned ${response.status}.`;
  }
}

function apiClient(token, fetchImpl) {
  return async function request(path, options = {}) {
    const response = await fetchImpl(`${API_ROOT}${path}`, {
      ...options,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': API_VERSION,
        ...(options.headers || {}),
      },
    });
    if (!response.ok) throw new Error(await readError(response));
    if (response.status === 204) return null;
    return response.json();
  };
}

async function verifyRemoteFiles(request, owner, repo, baseSha, plan) {
  for (const file of plan.files) {
    const encodedPath = file.path.split('/').map(encodeURIComponent).join('/');
    const remote = await request(`/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(baseSha)}`);
    if (!remote || remote.type !== 'file' || remote.encoding !== 'base64') {
      throw new Error(`Unable to verify current repository file: ${file.path}`);
    }
    const remoteText = decodeBase64(remote.content);
    if (canonicalJson(remoteText) !== canonicalJson(file.baselineContent)) {
      throw new Error(`Publishing stopped because ${file.path} changed on main after this workspace loaded. Reload the project and review the newer file.`);
    }
  }
}

async function createUniqueBranch(request, owner, repo, commitSha, desiredName) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const suffix = attempt ? `-${Math.random().toString(36).slice(2, 7)}` : '';
    const branch = `${desiredName}${suffix}`;
    try {
      await request(`/repos/${owner}/${repo}/git/refs`, {
        method: 'POST',
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commitSha }),
      });
      return branch;
    } catch (error) {
      if (attempt === 2 || !/reference already exists|422/i.test(error.message)) throw error;
    }
  }
  throw new Error('Unable to create a unique workspace branch.');
}

export async function publishWorkspacePlan({
  token,
  plan,
  title,
  commitMessage,
  fetchImpl = fetch,
}) {
  validateWorkspacePublishPlan(plan);
  const trimmedToken = String(token || '').trim();
  if (!trimmedToken) throw new Error('A fine-grained GitHub token is required.');
  const [owner, repo] = plan.repository.split('/');
  const request = apiClient(trimmedToken, fetchImpl);

  const repository = await request(`/repos/${owner}/${repo}`);
  if (repository.full_name !== plan.repository) throw new Error('The token cannot access the configured repository.');

  const ref = await request(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(plan.baseBranch)}`);
  const baseSha = ref?.object?.sha;
  if (!baseSha) throw new Error('Unable to resolve the current main branch.');
  await verifyRemoteFiles(request, owner, repo, baseSha, plan);

  const baseCommit = await request(`/repos/${owner}/${repo}/git/commits/${baseSha}`);
  const treeEntries = [];
  for (const file of plan.files) {
    const blob = await request(`/repos/${owner}/${repo}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({ content: file.content, encoding: 'utf-8' }),
    });
    treeEntries.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha });
  }

  const tree = await request(`/repos/${owner}/${repo}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree: treeEntries }),
  });
  const commit = await request(`/repos/${owner}/${repo}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({
      message: String(commitMessage || '').trim() || `Update ${plan.projectId} workspace content`,
      tree: tree.sha,
      parents: [baseSha],
    }),
  });

  const branch = await createUniqueBranch(
    request,
    owner,
    repo,
    commit.sha,
    makeWorkspaceBranchName(plan.projectId),
  );
  const pullRequest = await request(`/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    body: JSON.stringify({
      title: String(title || '').trim() || `Update ${plan.projectId} workspace content`,
      head: branch,
      base: plan.baseBranch,
      body: buildWorkspacePullRequestBody(plan),
      draft: true,
    }),
  });

  return {
    branch,
    baseSha,
    commitSha: commit.sha,
    pullRequestNumber: pullRequest.number,
    pullRequestUrl: pullRequest.html_url,
  };
}

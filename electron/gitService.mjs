import { randomUUID } from 'node:crypto';
import { realpath, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assertAuthorizedFsPath } from './fsAccess.mjs';
import { GitCommandError, runGit } from './gitCommand.mjs';
import { parseGitHistory, parsePorcelainV2Status } from './gitParsing.mjs';
import {
  requireAllowedRemoteUrl,
  requireSafeRemoteName,
  resolveRelativeGitPath,
  sanitizeRemoteUrl,
} from './gitValidation.mjs';
import { readGitWorkingDiff } from './gitWorkingDiff.mjs';

const MAX_COMMIT_MESSAGE_CHARS = 16 * 1024;
const MAX_HISTORY_ENTRIES = 100;
const MAX_SELECTED_PATHS = 2000;
const REMOTE_CHECK_TIMEOUT_MS = 30_000;
const MUTATION_TIMEOUT_MS = 120_000;
const NETWORK_MUTATION_TIMEOUT_MS = 30_000;
const DIFF_MAX_BUFFER_BYTES = 16 * 1024 * 1024;

function samePath(left, right) {
  const normalize = (value) => process.platform === 'win32' ? value.toLowerCase() : value;
  return normalize(path.resolve(left)) === normalize(path.resolve(right));
}

function isNotRepositoryError(error) {
  return error instanceof GitCommandError && (
    error.stderr.includes('not a git repository')
    || error.stderr.includes('must be run in a work tree')
  );
}

async function resolveRepositoryRoot(rootPath, nullable = false) {
  const resolvedRoot = await assertAuthorizedFsPath(rootPath);
  const info = await stat(resolvedRoot).catch(() => null);
  if (!info?.isDirectory()) {
    if (nullable) return null;
    throw new Error('Git repository root must be an existing directory.');
  }

  let repositoryInfo;
  try {
    repositoryInfo = await runGit(resolvedRoot, [
      'rev-parse', '--show-toplevel', '--is-inside-work-tree',
    ]);
  } catch (error) {
    if (nullable && isNotRepositoryError(error)) return null;
    throw error;
  }

  const [topLevelLine, workTreeLine] = repositoryInfo.stdout.trim().split(/\r?\n/);
  const topLevel = path.resolve(topLevelLine ?? '');
  const authorizedTopLevel = await assertAuthorizedFsPath(topLevel);
  const [realRoot, realTopLevel] = await Promise.all([
    realpath(resolvedRoot),
    realpath(authorizedTopLevel),
  ]);
  if (!samePath(realRoot, realTopLevel)) {
    throw new Error('Git operations require the exact authorized repository root.');
  }

  if (workTreeLine?.trim() !== 'true') {
    if (nullable) return null;
    throw new Error('Git repository must have a working tree.');
  }
  return resolvedRoot;
}

async function readOptionalConfig(rootPath, key) {
  const result = await runGit(rootPath, ['config', '--get', key], { allowedExitCodes: [1] });
  return result.code === 0 ? result.stdout.replace(/\r?\n$/, '') : null;
}

async function readTracking(rootPath, branch, { allowOriginFallback = false, push = false } = {}) {
  const [remoteResult, mergeResult] = await Promise.all([
    readOptionalConfig(rootPath, `branch.${branch}.remote`),
    readOptionalConfig(rootPath, `branch.${branch}.merge`),
  ]);
  let remote = remoteResult;
  let mergeRef = mergeResult;
  let setUpstream = false;
  if ((!remote || !mergeRef) && allowOriginFallback) {
    remote = 'origin';
    mergeRef = `refs/heads/${branch}`;
    setUpstream = true;
  }
  if (!remote || !mergeRef) return null;

  requireSafeRemoteName(remote);
  if (!mergeRef.startsWith('refs/heads/')) {
    throw new Error('Git upstream branch is invalid.');
  }
  const pushUrl = push ? await readOptionalConfig(rootPath, `remote.${remote}.pushurl`) : null;
  const remoteUrl = pushUrl ?? await readOptionalConfig(rootPath, `remote.${remote}.url`);
  return { mergeRef, remote, remoteUrl, setUpstream };
}

async function readStatus(rootPath) {
  const result = await runGit(rootPath, [
    'status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all',
  ]);
  const parsed = parsePorcelainV2Status(result.stdout);
  const tracking = parsed.branch
    ? await readTracking(rootPath, parsed.branch) ?? await readTracking(rootPath, parsed.branch, {
        allowOriginFallback: true,
      })
    : null;
  let remoteProtocolSupported = false;
  if (tracking?.remoteUrl) {
    try {
      requireAllowedRemoteUrl(tracking.remoteUrl);
      remoteProtocolSupported = true;
    } catch {
      // Status remains available so the renderer can explain the blocked remote.
    }
  }
  return {
    rootPath,
    head: parsed.head,
    branch: parsed.branch,
    detached: parsed.detached,
    upstream: parsed.upstream,
    ahead: parsed.ahead,
    behind: parsed.behind,
    remoteUrl: sanitizeRemoteUrl(tracking?.remoteUrl),
    remoteConfigured: Boolean(tracking?.remoteUrl),
    remoteProtocolSupported,
    changes: parsed.changes,
  };
}

export async function getGitStatus(rootPath) {
  const resolvedRoot = await resolveRepositoryRoot(rootPath, true);
  return resolvedRoot ? readStatus(resolvedRoot) : null;
}

export async function fetchGitStatus(rootPath) {
  const resolvedRoot = await resolveRepositoryRoot(rootPath);
  const status = await readStatus(resolvedRoot);
  if (!status.branch || status.detached) return status;
  const tracking = await readTracking(resolvedRoot, status.branch, { allowOriginFallback: true });
  if (!tracking?.remoteUrl) return status;
  requireAllowedRemoteUrl(tracking.remoteUrl);
  await runGit(resolvedRoot, [
    ...networkGitConfig, 'fetch', '--prune', tracking.remote,
  ], { timeout: REMOTE_CHECK_TIMEOUT_MS });
  return readStatus(resolvedRoot);
}

export async function getGitWorkingDiffs(rootPath, filePaths) {
  const resolvedRoot = await resolveRepositoryRoot(rootPath);
  return readGitWorkingDiff(resolvedRoot, filePaths);
}

export async function getGitWorkingDiff(rootPath, filePath) {
  return getGitWorkingDiffs(rootPath, [filePath]);
}

export async function getGitHistory(rootPath, limit = 10) {
  const resolvedRoot = await resolveRepositoryRoot(rootPath);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_HISTORY_ENTRIES) {
    throw new Error(`Git history limit must be between 1 and ${MAX_HISTORY_ENTRIES}.`);
  }
  const head = await runGit(resolvedRoot, ['rev-parse', '--verify', 'HEAD'], { allowedExitCodes: [128] });
  if (head.code !== 0) return [];
  const result = await runGit(resolvedRoot, [
    'log', '-z', `--max-count=${limit}`,
    '--pretty=format:%H%x00%h%x00%s%x00%an%x00%aI',
  ]);
  return parseGitHistory(result.stdout);
}

export async function getGitCommitDiff(rootPath, hash) {
  const resolvedRoot = await resolveRepositoryRoot(rootPath);
  if (typeof hash !== 'string' || !/^[0-9a-f]{7,64}$/i.test(hash)) {
    throw new Error('A valid Git commit hash is required.');
  }
  const verified = await runGit(resolvedRoot, ['rev-parse', '--verify', `${hash}^{commit}`]);
  const fullHash = verified.stdout.trim();
  return (await runGit(resolvedRoot, [
    'show', '--format=', '--no-ext-diff', '--no-textconv', '--no-color', fullHash, '--',
  ], { maxBuffer: DIFF_MAX_BUFFER_BYTES })).stdout;
}

function normalizeCommitOptions(options) {
  const message = options?.message;
  if (typeof message !== 'string' || !message.trim() || message.length > MAX_COMMIT_MESSAGE_CHARS) {
    throw new Error('Git commit message must be a non-empty string within the size limit.');
  }
  const paths = options?.paths;
  if (!Array.isArray(paths) || paths.length < 1 || paths.length > MAX_SELECTED_PATHS) {
    throw new Error('Git commit requires one or more selected file paths.');
  }
  return { message, paths };
}

export async function commitGitChanges(rootPath, options) {
  const resolvedRoot = await resolveRepositoryRoot(rootPath);
  const { message, paths } = normalizeCommitOptions(options);
  const selectedPaths = Array.from(new Set(await Promise.all(
    paths.map((filePath) => resolveRelativeGitPath(resolvedRoot, filePath)),
  )));
  const status = await readStatus(resolvedRoot);
  if (!status.branch || status.detached) {
    throw new Error('Git commit requires an attached branch.');
  }
  if (status.changes.some((change) => change.status === 'conflicted')) {
    throw new Error('Git commit is unavailable while merge conflicts remain.');
  }
  const head = await runGit(resolvedRoot, ['rev-parse', '--verify', 'HEAD'], {
    allowedExitCodes: [128],
  });
  const originalIndexTree = (await runGit(resolvedRoot, ['write-tree'])).stdout.trim();
  const temporaryIndexPath = path.join(os.tmpdir(), `vlaina-git-index-${randomUUID()}`);
  let committed = false;
  try {
    const trackedPaths = new Set((await runGit(resolvedRoot, [
      '--literal-pathspecs', 'ls-files', '-z', '--', ...selectedPaths,
    ])).stdout.split('\0').filter(Boolean));
    const existingPaths = await Promise.all(selectedPaths.map(async (filePath) => (
      await stat(path.join(resolvedRoot, filePath)).catch(() => null) ? filePath : null
    )));
    const stageablePaths = selectedPaths.filter((filePath) => (
      trackedPaths.has(filePath) || existingPaths.includes(filePath)
    ));
    if (stageablePaths.length === 0) {
      throw new Error('No selected Git changes remain.');
    }
    if (stageablePaths.length > 0) {
      await runGit(resolvedRoot, ['--literal-pathspecs', 'add', '--all', '--', ...stageablePaths], {
        timeout: MUTATION_TIMEOUT_MS,
      });
    }
    const env = { GIT_INDEX_FILE: temporaryIndexPath };
    await runGit(resolvedRoot, head.code === 0 ? ['read-tree', 'HEAD'] : ['read-tree', '--empty'], { env });
    await runGit(resolvedRoot, ['--literal-pathspecs', 'add', '--all', '--', ...selectedPaths], {
      env,
      timeout: MUTATION_TIMEOUT_MS,
    });
    await runGit(resolvedRoot, [
      'commit', '--no-gpg-sign', '--no-verify', '-m', message,
    ], { env, timeout: MUTATION_TIMEOUT_MS });
    committed = true;
  } finally {
    if (!committed) {
      await runGit(resolvedRoot, ['read-tree', originalIndexTree]).catch(() => {});
    }
    await Promise.all([
      rm(temporaryIndexPath, { force: true }),
      rm(`${temporaryIndexPath}.lock`, { force: true }),
    ]).catch(() => {});
  }
  return readStatus(resolvedRoot);
}

const networkGitConfig = [
  '-c', 'protocol.ext.allow=never',
  '-c', 'protocol.file.allow=never',
  '-c', 'core.sshCommand=ssh',
];

export async function pullGitChanges(rootPath) {
  const resolvedRoot = await resolveRepositoryRoot(rootPath);
  const status = await readStatus(resolvedRoot);
  if (!status.branch || status.detached) throw new Error('Git pull requires an attached branch.');
  if (status.changes.some((change) => change.status === 'conflicted')) {
    throw new Error('Git pull is unavailable while merge conflicts remain.');
  }
  if (status.ahead > 0 && status.behind > 0) {
    throw new Error('Git pull is unavailable because local and remote history have diverged.');
  }
  const tracking = await readTracking(resolvedRoot, status.branch);
  if (!tracking) throw new Error('Git pull requires an upstream branch.');
  requireAllowedRemoteUrl(tracking.remoteUrl);
  await runGit(resolvedRoot, [
    ...networkGitConfig, 'pull', '--ff-only', tracking.remote, tracking.mergeRef,
  ], { timeout: NETWORK_MUTATION_TIMEOUT_MS });
  return readStatus(resolvedRoot);
}

export async function pushGitChanges(rootPath) {
  const resolvedRoot = await resolveRepositoryRoot(rootPath);
  const status = await readStatus(resolvedRoot);
  if (!status.branch || status.detached) throw new Error('Git push requires an attached branch.');
  if (status.changes.some((change) => change.status === 'conflicted')) {
    throw new Error('Git push is unavailable while merge conflicts remain.');
  }
  if (status.ahead > 0 && status.behind > 0) {
    throw new Error('Git push is unavailable because local and remote history have diverged.');
  }
  const tracking = await readTracking(resolvedRoot, status.branch, {
    allowOriginFallback: true,
    push: true,
  });
  if (!tracking?.remoteUrl) throw new Error('Git push requires a remote repository.');
  requireAllowedRemoteUrl(tracking?.remoteUrl);
  const args = tracking.setUpstream
    ? ['push', '--set-upstream', tracking.remote, 'HEAD']
    : ['push', tracking.remote, `HEAD:${tracking.mergeRef}`];
  await runGit(resolvedRoot, [...networkGitConfig, ...args], { timeout: NETWORK_MUTATION_TIMEOUT_MS });
  return readStatus(resolvedRoot);
}

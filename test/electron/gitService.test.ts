import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const execFileAsync = promisify(execFile);
const hoisted = vi.hoisted(() => ({ userDataPath: '' }));

vi.mock('electron', () => ({
  default: {
    app: {
      getPath: vi.fn(() => hoisted.userDataPath),
      isPackaged: true,
    },
  },
}));

import {
  commitGitChanges,
  fetchGitStatus,
  getGitCommitDiff,
  getGitHistory,
  getGitStatus,
  getGitWorkingDiff,
  getGitWorkingDiffs,
  pullGitChanges,
  pushGitChanges,
} from '../../electron/gitService.mjs';
import { authorizeFsPath, resetAuthorizedFsPathsForTests } from '../../electron/fsAccess.mjs';
import { requireAllowedRemoteUrl, sanitizeRemoteUrl } from '../../electron/gitValidation.mjs';

async function git(cwd: string, args: string[], env: Record<string, string> = {}) {
  return execFileAsync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    windowsHide: true,
  });
}

async function createRepository(basePath: string) {
  const repositoryPath = path.join(basePath, 'repository');
  await mkdir(repositoryPath, { recursive: true });
  await git(repositoryPath, ['init', '-b', 'main']);
  await git(repositoryPath, ['config', 'user.name', 'Test Author']);
  await git(repositoryPath, ['config', 'user.email', 'test-author@example.invalid']);
  await writeFile(path.join(repositoryPath, 'README.md'), 'first\n', 'utf8');
  await writeFile(path.join(repositoryPath, 'old.md'), 'old\n', 'utf8');
  await git(repositoryPath, ['add', '--all']);
  await git(repositoryPath, ['commit', '-m', 'Initial commit'], {
    GIT_AUTHOR_DATE: '2024-01-01T00:00:00Z',
    GIT_COMMITTER_DATE: '2024-01-01T00:00:00Z',
  });
  return repositoryPath;
}

describe('desktop Git service', () => {
  let tempDir = '';

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'vlaina-git-service-'));
    hoisted.userDataPath = path.join(tempDir, 'user-data');
    await mkdir(hoisted.userDataPath, { recursive: true });
    resetAuthorizedFsPathsForTests();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('reports changes, renders diffs, commits all files, and reads bounded history', async () => {
    const repositoryPath = await createRepository(tempDir);
    await authorizeFsPath(repositoryPath, 'root');
    await writeFile(path.join(repositoryPath, 'README.md'), 'first\nchanged\n', 'utf8');
    await writeFile(path.join(repositoryPath, 'staged.md'), 'staged\n', 'utf8');
    await writeFile(path.join(repositoryPath, 'untracked.md'), 'untracked\n', 'utf8');
    await writeFile(path.join(repositoryPath, '中文.md'), 'localized path\n', 'utf8');
    await writeFile(path.join(repositoryPath, '-literal.md'), 'literal\n', 'utf8');
    await git(repositoryPath, ['add', 'staged.md']);
    await git(repositoryPath, ['mv', 'old.md', 'renamed.md']);

    const status = await getGitStatus(repositoryPath);
    expect(status).toMatchObject({
      rootPath: repositoryPath,
      head: expect.stringMatching(/^[0-9a-f]{40,64}$/),
      branch: 'main',
      detached: false,
      upstream: null,
      ahead: 0,
      behind: 0,
      remoteUrl: null,
    });
    expect(status?.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: 'README.md',
        indexStatus: '.',
        workTreeStatus: 'M',
        status: 'modified',
        staged: false,
        unstaged: true,
      }),
      expect.objectContaining({
        path: 'renamed.md',
        previousPath: 'old.md',
        status: 'renamed',
        staged: true,
      }),
      expect.objectContaining({ path: 'staged.md', status: 'added', staged: true }),
      expect.objectContaining({ path: 'untracked.md', status: 'untracked', unstaged: true }),
      expect.objectContaining({ path: '中文.md', status: 'untracked', unstaged: true }),
    ]));
    await expect(fetchGitStatus(repositoryPath)).resolves.toMatchObject({
      branch: 'main',
      remoteUrl: null,
    });

    await expect(getGitWorkingDiff(repositoryPath, 'README.md')).resolves.toContain('+changed');
    await expect(getGitWorkingDiffs(repositoryPath, ['README.md', 'untracked.md'])).resolves.toEqual(
      expect.stringContaining('+changed'),
    );
    await expect(getGitWorkingDiff(repositoryPath, 'untracked.md')).resolves.toContain('+untracked');
    await expect(getGitWorkingDiff(repositoryPath, '-literal.md')).resolves.toContain('+literal');

    const markerPath = path.join(tempDir, 'must-not-exist');
    const committed = await commitGitChanges(repositoryPath, {
      message: `Safe message $(touch ${markerPath})`,
      paths: status!.changes.flatMap((change) => (
        change.previousPath ? [change.previousPath, change.path] : [change.path]
      )),
    });
    expect(committed.changes).toEqual([]);
    await expect(stat(markerPath)).rejects.toThrow();

    const history = await getGitHistory(repositoryPath, 1);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      subject: `Safe message $(touch ${markerPath})`,
      author: 'Test Author',
    });
    const commitDiff = await getGitCommitDiff(repositoryPath, history[0].hash);
    expect(commitDiff).toContain('staged.md');
    expect(commitDiff).toContain('中文.md');
  });

  it('requires authorization, the exact repository root, and repository-contained paths', async () => {
    const repositoryPath = await createRepository(tempDir);
    const childPath = path.join(repositoryPath, 'docs');
    const outsidePath = path.join(tempDir, 'outside.md');
    await mkdir(childPath, { recursive: true });
    await writeFile(outsidePath, 'outside\n', 'utf8');

    await expect(getGitStatus(repositoryPath)).rejects.toThrow('not authorized');
    await authorizeFsPath(childPath, 'root');
    await expect(getGitStatus(childPath)).rejects.toThrow('not authorized');

    resetAuthorizedFsPathsForTests();
    await authorizeFsPath(repositoryPath, 'root');
    await expect(getGitWorkingDiff(repositoryPath, outsidePath)).rejects.toThrow(
      'must stay inside the repository',
    );
    await expect(getGitCommitDiff(repositoryPath, '--all')).rejects.toThrow(
      'valid Git commit hash',
    );
    await expect(getGitHistory(repositoryPath, 101)).rejects.toThrow(
      'between 1 and 100',
    );
  });

  it('returns null for an authorized non-repository', async () => {
    const folderPath = path.join(tempDir, 'plain-folder');
    await mkdir(folderPath, { recursive: true });
    await authorizeFsPath(folderPath, 'root');
    await expect(getGitStatus(folderPath)).resolves.toBeNull();

  });

  it('reports and commits an untracked binary image', async () => {
    const repositoryPath = await createRepository(tempDir);
    const imagePath = path.join(repositoryPath, 'assets', 'cover.png');
    await mkdir(path.dirname(imagePath), { recursive: true });
    await writeFile(imagePath, Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    ]));
    await authorizeFsPath(repositoryPath, 'root');

    const status = await getGitStatus(repositoryPath);
    expect(status?.changes).toContainEqual(expect.objectContaining({
      path: 'assets/cover.png',
      status: 'untracked',
    }));
    await expect(getGitWorkingDiff(repositoryPath, 'assets/cover.png'))
      .resolves.toContain('Binary files');

    const committed = await commitGitChanges(repositoryPath, {
      message: 'Add cover image',
      paths: ['assets/cover.png'],
    });
    expect(committed.changes).toEqual([]);
    expect((await git(repositoryPath, ['show', '--format=', '--name-only', 'HEAD'])).stdout.trim())
      .toBe('assets/cover.png');
  });

  it('commits only selected paths and preserves unrelated staged changes', async () => {
    const repositoryPath = await createRepository(tempDir);
    await authorizeFsPath(repositoryPath, 'root');
    await writeFile(path.join(repositoryPath, 'README.md'), 'selected\n', 'utf8');
    await writeFile(path.join(repositoryPath, 'staged.md'), 'keep staged\n', 'utf8');
    await git(repositoryPath, ['add', 'staged.md']);

    const committed = await commitGitChanges(repositoryPath, {
      message: 'Commit selected file',
      paths: ['README.md'],
    });

    expect((await git(repositoryPath, ['show', '--format=', '--name-only', 'HEAD'])).stdout.trim())
      .toBe('README.md');
    expect((await git(repositoryPath, ['diff', '--cached', '--name-only'])).stdout.trim())
      .toBe('staged.md');
    expect(committed.changes).toContainEqual(expect.objectContaining({
      path: 'staged.md',
      staged: true,
    }));
  });

  it('creates the first commit in an empty repository', async () => {
    const repositoryPath = path.join(tempDir, 'empty-repository');
    await mkdir(repositoryPath, { recursive: true });
    await git(repositoryPath, ['init', '-b', 'main']);
    await git(repositoryPath, ['config', 'user.name', 'Test Author']);
    await git(repositoryPath, ['config', 'user.email', 'test-author@example.invalid']);
    await writeFile(path.join(repositoryPath, 'first.md'), 'first commit\n', 'utf8');
    await authorizeFsPath(repositoryPath, 'root');

    const status = await commitGitChanges(repositoryPath, {
      message: 'First commit',
      paths: ['first.md'],
    });

    expect(status.changes).toEqual([]);
    await expect(getGitHistory(repositoryPath, 1)).resolves.toEqual([
      expect.objectContaining({ subject: 'First commit' }),
    ]);
  });

  it('blocks commits from detached HEAD and unresolved merge conflicts', async () => {
    const repositoryPath = await createRepository(tempDir);
    await authorizeFsPath(repositoryPath, 'root');
    await git(repositoryPath, ['checkout', '--detach']);
    await writeFile(path.join(repositoryPath, 'README.md'), 'detached change\n', 'utf8');
    await expect(commitGitChanges(repositoryPath, {
      message: 'Detached commit',
      paths: ['README.md'],
    })).rejects.toThrow('attached branch');

    await git(repositoryPath, ['checkout', 'main']);
    await git(repositoryPath, ['checkout', '-b', 'conflicting-change']);
    await writeFile(path.join(repositoryPath, 'README.md'), 'branch change\n', 'utf8');
    await git(repositoryPath, ['add', 'README.md']);
    await git(repositoryPath, ['commit', '-m', 'Branch change']);
    await git(repositoryPath, ['checkout', 'main']);
    await writeFile(path.join(repositoryPath, 'README.md'), 'main change\n', 'utf8');
    await git(repositoryPath, ['add', 'README.md']);
    await git(repositoryPath, ['commit', '-m', 'Main change']);
    await expect(git(repositoryPath, ['merge', 'conflicting-change'])).rejects.toThrow();

    const conflictedStatus = await getGitStatus(repositoryPath);
    expect(conflictedStatus?.changes).toContainEqual(expect.objectContaining({
      path: 'README.md',
      status: 'conflicted',
    }));
    await expect(commitGitChanges(repositoryPath, {
      message: 'Conflict commit',
      paths: ['README.md'],
    })).rejects.toThrow('merge conflicts remain');
  });

  it('rejects missing and out-of-repository commit paths before staging', async () => {
    const repositoryPath = await createRepository(tempDir);
    await authorizeFsPath(repositoryPath, 'root');
    await writeFile(path.join(repositoryPath, 'pending.md'), 'pending\n', 'utf8');

    await expect(commitGitChanges(repositoryPath, {
      message: 'No selection',
      paths: [],
    })).rejects.toThrow('selected file paths');
    await expect(commitGitChanges(repositoryPath, {
      message: 'Outside selection',
      paths: ['../outside.md'],
    })).rejects.toThrow('must stay inside the repository');

    expect((await git(repositoryPath, ['diff', '--cached', '--name-only'])).stdout).toBe('');
  });

  it('sanitizes HTTPS credentials and rejects non-network pull and push remotes', async () => {
    const repositoryPath = await createRepository(tempDir);
    await authorizeFsPath(repositoryPath, 'root');
    await git(repositoryPath, [
      'remote', 'add', 'origin', 'https://user:secret-token@github.com/example/repository.git',
    ]);

    const untrackedRemoteStatus = await getGitStatus(repositoryPath);
    expect(untrackedRemoteStatus).toMatchObject({
      upstream: null,
      remoteUrl: 'https://github.com/example/repository.git',
    });

    await git(repositoryPath, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
    await git(repositoryPath, ['branch', '--set-upstream-to=origin/main', 'main']);

    const status = await getGitStatus(repositoryPath);
    expect(status?.remoteUrl).toBe('https://github.com/example/repository.git');
    expect(JSON.stringify(status)).not.toContain('secret-token');
    expect(status?.remoteConfigured).toBe(true);
    expect(status?.remoteProtocolSupported).toBe(false);

    await git(repositoryPath, ['remote', 'set-url', 'origin', 'ssh://secret-user@github.com/example/repository.git']);
    expect(sanitizeRemoteUrl('ssh://secret-user:secret-token@github.com/example/repository.git'))
      .toBe('ssh://github.com/example/repository.git');
    expect(sanitizeRemoteUrl('git@github.com:example/repository.git'))
      .toBe('github.com:example/repository.git');

    const localRemotePath = path.join(tempDir, 'local-remote.git');
    await git(tempDir, ['init', '--bare', localRemotePath]);
    await git(repositoryPath, ['remote', 'set-url', 'origin', localRemotePath]);
    await expect(fetchGitStatus(repositoryPath)).rejects.toThrow('must use HTTPS or SSH');
    await expect(pullGitChanges(repositoryPath)).rejects.toThrow('must use HTTPS or SSH');
    await expect(pushGitChanges(repositoryPath)).rejects.toThrow('must use HTTPS or SSH');

    await git(repositoryPath, ['remote', 'set-url', 'origin', 'C:\\local-remote.git']);
    await expect(fetchGitStatus(repositoryPath)).rejects.toThrow('must use HTTPS or SSH');
    await expect(pullGitChanges(repositoryPath)).rejects.toThrow('must use HTTPS or SSH');
    await expect(pushGitChanges(repositoryPath)).rejects.toThrow('must use HTTPS or SSH');
    await expect(readFile(path.join(repositoryPath, 'README.md'), 'utf8')).resolves.toBe('first\n');
  });

  it('rejects URL-like, local, and extended Git transports while accepting HTTPS and SSH', () => {
    expect(() => requireAllowedRemoteUrl('https://github.com/example/repository.git')).not.toThrow();
    expect(() => requireAllowedRemoteUrl('ssh://git@github.com/example/repository.git')).not.toThrow();
    expect(() => requireAllowedRemoteUrl('git@github.com:example/repository.git')).not.toThrow();
    for (const remote of [
      'http://github.com/example/repository.git',
      'git://github.com/example/repository.git',
      'ftp://github.com/example/repository.git',
      'file:///tmp/repository.git',
      'ext::sh -c whoami',
      '/tmp/repository.git',
    ]) {
      expect(() => requireAllowedRemoteUrl(remote)).toThrow('must use HTTPS or SSH');
    }
  });
});

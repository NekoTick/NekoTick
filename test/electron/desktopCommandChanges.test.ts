import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  captureDesktopCommandSnapshot,
  compareDesktopCommandSnapshots,
} from '../../electron/desktopCommandChanges.mjs';

describe('desktop command file changes', () => {
  let tempDir = '';

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'vlaina-command-changes-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('captures added, modified, and deleted text files', async () => {
    await writeFile(path.join(tempDir, 'modified.txt'), 'before\nshared\n', 'utf8');
    await writeFile(path.join(tempDir, 'deleted.txt'), 'removed\n', 'utf8');
    const before = await captureDesktopCommandSnapshot(tempDir);

    await writeFile(path.join(tempDir, 'modified.txt'), 'after\nshared\n', 'utf8');
    await writeFile(path.join(tempDir, 'added.txt'), 'created\n', 'utf8');
    await rm(path.join(tempDir, 'deleted.txt'));
    const after = await captureDesktopCommandSnapshot(tempDir);
    const result = compareDesktopCommandSnapshots(before, after);

    expect(result.truncated).toBe(false);
    expect(result.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'added.txt', kind: 'added', additions: 1, deletions: 0 }),
      expect.objectContaining({ path: 'deleted.txt', kind: 'deleted', additions: 0, deletions: 1 }),
      expect.objectContaining({ path: 'modified.txt', kind: 'modified', additions: 1, deletions: 1 }),
    ]));
    expect(result.changes.find((change) => change.path === 'modified.txt')?.patch)
      .toContain('-before\n+after');
  });

  it('keeps unchanged lines between separate edits out of addition and deletion counts', async () => {
    await writeFile(path.join(tempDir, 'multi.txt'), 'first\nkeep one\nkeep two\nlast\n', 'utf8');
    const before = await captureDesktopCommandSnapshot(tempDir);
    await writeFile(path.join(tempDir, 'multi.txt'), 'FIRST\nkeep one\nkeep two\nLAST\n', 'utf8');
    const after = await captureDesktopCommandSnapshot(tempDir);

    const change = compareDesktopCommandSnapshots(before, after).changes[0];
    expect(change).toMatchObject({ additions: 2, deletions: 2, truncated: false });
    expect(change.patch).toContain(' keep one\n keep two');
  });

  it.skipIf(process.platform === 'win32')('does not follow symlinked files outside the working directory', async () => {
    const outside = path.join(os.tmpdir(), `vlaina-command-outside-${Date.now()}.txt`);
    await writeFile(outside, 'secret\n', 'utf8');
    try {
      const { symlink } = await import('node:fs/promises');
      await symlink(outside, path.join(tempDir, 'linked.txt'));
      const snapshot = await captureDesktopCommandSnapshot(tempDir);
      expect(snapshot.files.has('linked.txt')).toBe(false);
    } finally {
      await rm(outside, { force: true });
    }
  });

  it('does not capture hidden files or credential directories', async () => {
    await mkdir(path.join(tempDir, '.codex'), { recursive: true });
    await mkdir(path.join(tempDir, 'secrets'), { recursive: true });
    await writeFile(path.join(tempDir, '.env'), 'TOKEN=fake-test-token\n', 'utf8');
    await writeFile(path.join(tempDir, '.codex', 'config.toml'), 'api_key = "fake-test-key"\n', 'utf8');
    await writeFile(path.join(tempDir, 'secrets', 'credentials.json'), '{"token":"fake"}\n', 'utf8');
    await writeFile(path.join(tempDir, 'visible.txt'), 'safe\n', 'utf8');

    const snapshot = await captureDesktopCommandSnapshot(tempDir);

    expect([...snapshot.files.keys()]).toEqual(['visible.txt']);
  });
});

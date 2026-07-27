import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, symlink, truncate, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const hoisted = vi.hoisted(() => ({
  userDataPath: '',
  tempPath: '',
}));

vi.mock('electron', () => ({
  default: {
    app: {
      getPath: vi.fn((name: string) => {
        if (name === 'userData') return hoisted.userDataPath;
        if (name === 'temp') return hoisted.tempPath || os.tmpdir();
        if (name === 'home') return os.homedir();
        return hoisted.userDataPath;
      }),
    },
    BrowserWindow: vi.fn(),
    clipboard: {
      writeText: vi.fn(),
      writeImage: vi.fn(),
    },
    dialog: {},
    nativeImage: {
      createFromDataURL: vi.fn(() => ({ isEmpty: () => false })),
    },
    shell: {
      openExternal: vi.fn(),
      openPath: vi.fn(),
      trashItem: vi.fn(),
      showItemInFolder: vi.fn(),
    },
  },
}));

import { registerDesktopIpc } from '../../electron/desktopIpc.mjs';
import { authorizeFsPath, resetAuthorizedFsPathsForTests } from '../../electron/fsAccess.mjs';

function registerHarness() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();

  registerDesktopIpc({
    handleIpc: (name: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(name, handler);
    },
    normalizeExternalUrl: (url: string) => url,
    resolveTargetWindow: vi.fn(() => null),
    requireNonEmptyString: (value: string) => value,
    requireStringArray: (value: string[]) => value,
  });

  return { handlers };
}

describe('desktop filesystem ipc', () => {
  let tempDir = '';

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'vlaina-desktop-fs-ipc-'));
    hoisted.userDataPath = path.join(tempDir, 'user-data');
    hoisted.tempPath = path.join(tempDir, 'tmp');
    await mkdir(hoisted.userDataPath, { recursive: true });
    await mkdir(hoisted.tempPath, { recursive: true });
    resetAuthorizedFsPathsForTests();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('reads small authorized files through the filesystem bridge', async () => {
    const rootPath = path.join(tempDir, 'notesRoot');
    const filePath = path.join(rootPath, 'note.md');
    await mkdir(rootPath, { recursive: true });
    await writeFile(filePath, 'hello', 'utf8');
    await authorizeFsPath(rootPath, 'root');
    const { handlers } = registerHarness();

    await expect(handlers.get('desktop:fs:read-text')?.({}, filePath)).resolves.toBe('hello');
    await expect(handlers.get('desktop:fs:read-binary')?.({}, filePath)).resolves.toEqual(
      new Uint8Array([104, 101, 108, 108, 111]),
    );
  });

  it('rejects oversized authorized files before reading them through the filesystem bridge', async () => {
    const rootPath = path.join(tempDir, 'notesRoot');
    const filePath = path.join(rootPath, 'huge.bin');
    await mkdir(rootPath, { recursive: true });
    await writeFile(filePath, '', 'utf8');
    await truncate(filePath, 64 * 1024 * 1024 + 1);
    await authorizeFsPath(rootPath, 'root');
    const { handlers } = registerHarness();

    await expect(handlers.get('desktop:fs:read-binary')?.({}, filePath)).rejects.toThrow(
      'Desktop file is too large to read',
    );
    await expect(handlers.get('desktop:fs:read-text')?.({}, filePath)).rejects.toThrow(
      'Desktop file is too large to read',
    );
  });

  it('honors caller-provided binary read byte limits', async () => {
    const rootPath = path.join(tempDir, 'notesRoot');
    const filePath = path.join(rootPath, 'note.md');
    await mkdir(rootPath, { recursive: true });
    await writeFile(filePath, 'hello', 'utf8');
    await authorizeFsPath(rootPath, 'root');
    const { handlers } = registerHarness();

    await expect(handlers.get('desktop:fs:read-binary')?.({}, filePath, 5)).resolves.toEqual(
      new Uint8Array([104, 101, 108, 108, 111]),
    );
    await expect(handlers.get('desktop:fs:read-binary')?.({}, filePath, 4)).rejects.toThrow(
      'Desktop file is too large to read',
    );
  });

  it('honors caller-provided text read byte limits', async () => {
    const rootPath = path.join(tempDir, 'notesRoot');
    const filePath = path.join(rootPath, 'note.md');
    await mkdir(rootPath, { recursive: true });
    await writeFile(filePath, 'hello', 'utf8');
    await authorizeFsPath(rootPath, 'root');
    const { handlers } = registerHarness();

    await expect(handlers.get('desktop:fs:read-text')?.({}, filePath, 5)).resolves.toBe('hello');
    await expect(handlers.get('desktop:fs:read-text')?.({}, filePath, 4)).rejects.toThrow(
      'Desktop file is too large to read',
    );
  });

  it('accepts explicit unbounded text reads and writes', async () => {
    const rootPath = path.join(tempDir, 'notesRoot');
    const filePath = path.join(rootPath, 'board.json');
    const backupPath = path.join(rootPath, 'board.json.bak');
    await mkdir(rootPath, { recursive: true });
    await authorizeFsPath(rootPath, 'root');
    const { handlers } = registerHarness();

    await handlers.get('desktop:fs:write-text')?.({}, filePath, 'content', {
      maxBytes: null,
      recursive: true,
    });
    await handlers.get('desktop:fs:copy-file')?.({}, filePath, backupPath, null);

    await expect(handlers.get('desktop:fs:read-text')?.({}, filePath, null)).resolves.toBe('content');
    await expect(readFile(backupPath, 'utf8')).resolves.toBe('content');
  });

  it('rejects invalid binary write payloads through the filesystem bridge', async () => {
    const rootPath = path.join(tempDir, 'notesRoot');
    const filePath = path.join(rootPath, 'note.bin');
    await mkdir(rootPath, { recursive: true });
    await authorizeFsPath(rootPath, 'root');
    const { handlers } = registerHarness();

    await expect(handlers.get('desktop:fs:write-binary')?.({}, filePath, 'not bytes')).rejects.toThrow(
      'Desktop binary content must be a byte array',
    );
    await expect(handlers.get('desktop:fs:write-binary')?.({}, filePath, [0, 256])).rejects.toThrow(
      'Desktop binary content must contain only byte values',
    );
  });

  it('rejects oversized binary write payloads before materializing buffers', async () => {
    const rootPath = path.join(tempDir, 'notesRoot');
    const filePath = path.join(rootPath, 'huge.bin');
    await mkdir(rootPath, { recursive: true });
    await authorizeFsPath(rootPath, 'root');
    const oversizedBytes: number[] = [];
    oversizedBytes.length = 64 * 1024 * 1024 + 1;
    const { handlers } = registerHarness();

    await expect(handlers.get('desktop:fs:write-binary')?.({}, filePath, oversizedBytes)).rejects.toThrow(
      'Desktop content is too large to write',
    );
  });

  it('rejects appending text past the desktop write size limit', async () => {
    const rootPath = path.join(tempDir, 'notesRoot');
    const filePath = path.join(rootPath, 'huge.md');
    await mkdir(rootPath, { recursive: true });
    await writeFile(filePath, '', 'utf8');
    await truncate(filePath, 64 * 1024 * 1024);
    await authorizeFsPath(rootPath, 'root');
    const { handlers } = registerHarness();

    await expect(handlers.get('desktop:fs:write-text')?.({}, filePath, 'x', { append: true })).rejects.toThrow(
      'Desktop content is too large to write',
    );
    await expect(readFile(filePath)).resolves.toHaveLength(64 * 1024 * 1024);
  });

  it('rejects hostile text write payloads without coercion', async () => {
    const rootPath = path.join(tempDir, 'notesRoot');
    const filePath = path.join(rootPath, 'note.md');
    await mkdir(rootPath, { recursive: true });
    await authorizeFsPath(rootPath, 'root');
    const { handlers } = registerHarness();
    const hostileContent = {
      toString() {
        throw new Error('text content coercion');
      },
    };

    await expect(handlers.get('desktop:fs:write-text')?.({}, filePath, hostileContent)).rejects.toThrow(
      'Desktop text content must be a string',
    );
  });

  it('rejects oversized copy-file sources before copying through the filesystem bridge', async () => {
    const rootPath = path.join(tempDir, 'notesRoot');
    const sourcePath = path.join(rootPath, 'huge.md');
    const targetPath = path.join(rootPath, 'huge-copy.md');
    await mkdir(rootPath, { recursive: true });
    await writeFile(sourcePath, '', 'utf8');
    await truncate(sourcePath, 64 * 1024 * 1024 + 1);
    await authorizeFsPath(rootPath, 'root');
    const { handlers } = registerHarness();

    await expect(handlers.get('desktop:fs:copy-file')?.({}, sourcePath, targetPath)).rejects.toThrow(
      'Desktop file is too large to copy',
    );
    await expect(readFile(targetPath)).rejects.toThrow();
  });

  it('rejects protected app data files during drag-drop authorization', async () => {
    const protectedPath = path.join(hoisted.userDataPath, '.vlaina', 'app', 'secrets', 'account.json');
    await mkdir(path.dirname(protectedPath), { recursive: true });
    await writeFile(protectedPath, '{}', 'utf8');
    const { handlers } = registerHarness();

    await expect(handlers.get('desktop:drag-drop:authorize-path')?.({}, protectedPath)).rejects.toThrow(
      'File path is reserved for internal desktop storage',
    );
  });

  it('rejects protected drag-drop paths before probing the filesystem', async () => {
    const protectedPath = path.join(hoisted.userDataPath, '.vlaina', 'app', 'secrets', 'account.json');
    const { handlers } = registerHarness();

    await expect(handlers.get('desktop:drag-drop:authorize-path')?.({}, protectedPath)).rejects.toThrow(
      'File path is reserved for internal desktop storage',
    );
  });

  it('resolves and authorizes the Git root for an opened Markdown file', async () => {
    const projectPath = path.join(tempDir, 'project');
    const docsPath = path.join(projectPath, 'docs', 'guides');
    const filePath = path.join(docsPath, 'setup.md');
    await mkdir(path.join(projectPath, '.git'), { recursive: true });
    await writeFile(path.join(projectPath, '.git', 'HEAD'), 'ref: refs/heads/main\n', 'utf8');
    await mkdir(docsPath, { recursive: true });
    await writeFile(filePath, '# Setup', 'utf8');
    await authorizeFsPath(filePath, 'file');
    const { handlers } = registerHarness();

    await expect(
      handlers.get('desktop:app:find-markdown-git-root')?.({}, filePath),
    ).resolves.toBe(projectPath);
    await expect(handlers.get('desktop:fs:list-dir')?.({}, projectPath)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'docs',
          path: path.join(projectPath, 'docs'),
          isDirectory: true,
        }),
      ]),
    );
  });

  it('lists authorized symlinked markdown files as readable files', async () => {
    const rootPath = path.join(tempDir, 'notesRoot');
    const targetPath = path.join(rootPath, 'target.md');
    const linkPath = path.join(rootPath, 'linked.md');
    await mkdir(rootPath, { recursive: true });
    await writeFile(targetPath, '# target', 'utf8');
    await symlink(targetPath, linkPath, 'file');
    await authorizeFsPath(rootPath, 'root');
    const { handlers } = registerHarness();

    await expect(handlers.get('desktop:fs:list-dir')?.({}, rootPath)).resolves.toEqual(
      expect.arrayContaining([
        {
          name: 'linked.md',
          path: linkPath,
          isDirectory: false,
          isFile: true,
        },
      ]),
    );
    await expect(handlers.get('desktop:fs:read-text')?.({}, linkPath)).resolves.toBe('# target');
  });

  it('lists authorized symlinked directories as readable directories', async () => {
    const rootPath = path.join(tempDir, 'notesRoot');
    const targetDirPath = path.join(rootPath, 'target-docs');
    const targetPath = path.join(targetDirPath, 'inside.md');
    const linkPath = path.join(rootPath, 'linked-docs');
    await mkdir(targetDirPath, { recursive: true });
    await writeFile(targetPath, '# inside', 'utf8');
    await symlink(targetDirPath, linkPath, 'dir');
    await authorizeFsPath(rootPath, 'root');
    const { handlers } = registerHarness();

    await expect(handlers.get('desktop:fs:list-dir')?.({}, rootPath)).resolves.toEqual(
      expect.arrayContaining([
        {
          name: 'linked-docs',
          path: linkPath,
          isDirectory: true,
          isFile: false,
        },
      ]),
    );
    await expect(handlers.get('desktop:fs:list-dir')?.({}, linkPath)).resolves.toEqual(
      expect.arrayContaining([
        {
          name: 'inside.md',
          path: path.join(linkPath, 'inside.md'),
          isDirectory: false,
          isFile: true,
        },
      ]),
    );
  });

  it('does not list symlinked files that resolve outside authorized roots as readable files', async () => {
    const rootPath = path.join(tempDir, 'notesRoot');
    const outsidePath = path.join(tempDir, 'outside.md');
    const linkPath = path.join(rootPath, 'outside.md');
    await mkdir(rootPath, { recursive: true });
    await writeFile(outsidePath, '# outside', 'utf8');
    await symlink(outsidePath, linkPath, 'file');
    await authorizeFsPath(rootPath, 'root');
    const { handlers } = registerHarness();

    await expect(handlers.get('desktop:fs:list-dir')?.({}, rootPath)).resolves.toEqual(
      expect.arrayContaining([
        {
          name: 'outside.md',
          path: linkPath,
          isDirectory: false,
          isFile: false,
        },
      ]),
    );
    await expect(handlers.get('desktop:fs:read-text')?.({}, linkPath)).rejects.toThrow(
      'File path is not authorized for desktop access',
    );
  });

});

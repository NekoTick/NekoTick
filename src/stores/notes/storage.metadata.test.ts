import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEmptyMetadataFile,
  loadGlobalNoteIconSize,
  loadRecentNotes,
  loadWorkspaceState,
  loadNoteMetadata,
  persistGlobalNoteIconSize,
  saveWorkspaceState,
  setNoteEntry,
} from './storage';
import { getNotesRootStorageKey } from './systemStoragePaths';
import type { MetadataFile } from './types';

const MAX_METADATA_READ_BYTES = 5 * 1024 * 1024;
const MAX_METADATA_TOTAL_READ_BYTES = 32 * 1024 * 1024;

const adapter = {
  exists: vi.fn<(path: string) => Promise<boolean>>(),
  readFile: vi.fn<(path: string, maxBytes?: number) => Promise<string>>(),
  writeFile: vi.fn<(path: string, content: string) => Promise<void>>(),
  mkdir: vi.fn<(path: string, recursive?: boolean) => Promise<void>>(),
  getBasePath: vi.fn<() => Promise<string>>(),
  stat: vi.fn<(path: string) => Promise<{ modifiedAt?: number; size?: number } | null>>(),
  listDir: vi.fn<
    (
      path: string,
      options?: { includeHidden?: boolean; recursive?: boolean },
    ) => Promise<Array<{ name: string; isDirectory?: boolean; isFile?: boolean }>>
  >(),
};

vi.mock('@/lib/storage/adapter', () => ({
  getStorageAdapter: () => adapter,
  isAbsolutePath: (path: string) => path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path),
  joinPath: (...segments: string[]) => Promise.resolve(segments.join('/')),
}));

describe('notes metadata storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    adapter.exists.mockResolvedValue(false);
    adapter.getBasePath.mockResolvedValue('/app');
    adapter.stat.mockImplementation(async (path: string) => ({
      modifiedAt: path.includes('alpha') ? 1 : 2,
      size: path.includes('alpha') ? 100 : 200,
    }));
  });

  it('scans markdown frontmatter into the runtime metadata index', async () => {
    adapter.listDir.mockImplementation(async (path: string) => {
      if (path === '/notes-root-a') {
        return [
          { name: 'alpha.md', isFile: true },
          { name: 'docs', isDirectory: true },
          { name: '.vlaina', isDirectory: true },
        ];
      }

      if (path === '/notes-root-a/docs') {
        return [{ name: 'beta.md', isFile: true }];
      }

      return [];
    });

    adapter.readFile.mockImplementation(async (path: string) => {
      if (path === '/notes-root-a/alpha.md') {
        return [
          '---',
          'vlaina_cover: "assets/alpha.webp" x=12 y=24 height=260 scale=1.4',
          'vlaina_icon: "🐱" size=84',
          'vlaina_created: "2026-04-15T00:00:00.000Z"',
          'vlaina_updated: "2026-04-16T00:00:00.000Z"',
          '---',
          '',
          '# Alpha',
        ].join('\n');
      }

      return [
        '---',
        'title: Beta',
        '',
        'vlaina_updated: "2026-04-17T00:00:00.000Z"',
        '---',
        '',
        '# Beta',
      ].join('\n');
    });

    await expect(loadNoteMetadata('/notes-root-a')).resolves.toEqual({
      version: 2,
      notes: {
        'alpha.md': {
          cover: {
            assetPath: 'assets/alpha.webp',
            positionX: 12,
            positionY: 24,
            height: 260,
            scale: 1.4,
          },
          icon: '🐱',
          iconSize: 84,
          updatedAt: 1,
        },
        'docs/beta.md': {
          updatedAt: 2,
        },
      },
    });
  });

  it('scans metadata from every supported markdown extension', async () => {
    adapter.listDir.mockResolvedValue([
      { name: 'alpha.md', isFile: true },
      { name: 'beta.markdown', isFile: true },
      { name: 'gamma.mdown', isFile: true },
      { name: 'delta.mkd', isFile: true },
      { name: 'image.png', isFile: true },
    ]);
    adapter.readFile.mockResolvedValue('# Note');

    await expect(loadNoteMetadata('/notes-root-extensions')).resolves.toEqual({
      version: 2,
      notes: {
        'alpha.md': { updatedAt: 1 },
        'beta.markdown': { updatedAt: 2 },
        'gamma.mdown': { updatedAt: 2 },
        'delta.mkd': { updatedAt: 2 },
      },
    });
    expect(adapter.readFile).toHaveBeenCalledWith('/notes-root-extensions/alpha.md', MAX_METADATA_READ_BYTES);
    expect(adapter.readFile).toHaveBeenCalledWith('/notes-root-extensions/beta.markdown', MAX_METADATA_READ_BYTES);
    expect(adapter.readFile).toHaveBeenCalledWith('/notes-root-extensions/gamma.mdown', MAX_METADATA_READ_BYTES);
    expect(adapter.readFile).toHaveBeenCalledWith('/notes-root-extensions/delta.mkd', MAX_METADATA_READ_BYTES);
    expect(adapter.readFile).not.toHaveBeenCalledWith('/notes-root-extensions/image.png');
  });

  it('scans user dotfile notes while hiding internal app and git folders', async () => {
    adapter.listDir.mockImplementation(async (path: string) => {
      if (path === '/notes-root-dot-notes') {
        return [
          { name: '.journal.md', isFile: true },
          { name: '.notes', isDirectory: true },
          { name: '.vlaina', isDirectory: true },
          { name: '.git', isDirectory: true },
          { name: '.VLAINA', isDirectory: true },
          { name: '.GIT', isDirectory: true },
        ];
      }

      if (path === '/notes-root-dot-notes/.notes') {
        return [{ name: 'alpha.md', isFile: true }];
      }

      return [];
    });
    adapter.readFile.mockImplementation(async (path: string) => {
      const date = path.includes('alpha')
        ? '2026-04-18T00:00:00.000Z'
        : '2026-04-17T00:00:00.000Z';

      return [
        '---',
        `vlaina_updated: "${date}"`,
        '---',
        '',
        '# Note',
      ].join('\n');
    });

    await expect(loadNoteMetadata('/notes-root-dot-notes')).resolves.toEqual({
      version: 2,
      notes: {
        '.journal.md': {
          updatedAt: 2,
        },
        '.notes/alpha.md': {
          updatedAt: 1,
        },
      },
    });
    expect(adapter.listDir).toHaveBeenCalledWith('/notes-root-dot-notes', { includeHidden: true });
    expect(adapter.listDir).toHaveBeenCalledWith('/notes-root-dot-notes/.notes', { includeHidden: true });
    expect(adapter.listDir).not.toHaveBeenCalledWith('/notes-root-dot-notes/.vlaina');
    expect(adapter.listDir).not.toHaveBeenCalledWith('/notes-root-dot-notes/.git');
    expect(adapter.listDir).not.toHaveBeenCalledWith('/notes-root-dot-notes/.VLAINA');
    expect(adapter.listDir).not.toHaveBeenCalledWith('/notes-root-dot-notes/.GIT');
  });

  it('ignores unsafe storage entry names during metadata scans', async () => {
    adapter.listDir.mockImplementation(async (path: string) => {
      if (path === '/notes-root-unsafe') {
        return [
          { name: 'alpha.md', isFile: true },
          { name: '../secret.md', isFile: true },
          { name: 'nested/evil.md', isFile: true },
          { name: 'bad\\evil.md', isFile: true },
          { name: '..', isDirectory: true },
          { name: 'docs', isDirectory: true },
        ];
      }

      if (path === '/notes-root-unsafe/docs') {
        return [{ name: 'beta.md', isFile: true }];
      }

      return [];
    });
    adapter.readFile.mockResolvedValue('# Note');

    await expect(loadNoteMetadata('/notes-root-unsafe')).resolves.toEqual({
      version: 2,
      notes: {
        'alpha.md': { updatedAt: 1 },
        'docs/beta.md': { updatedAt: 2 },
      },
    });
    expect(adapter.listDir).not.toHaveBeenCalledWith('/notes-root-unsafe/..');
    expect(adapter.readFile).toHaveBeenCalledWith('/notes-root-unsafe/alpha.md', MAX_METADATA_READ_BYTES);
    expect(adapter.readFile).toHaveBeenCalledWith('/notes-root-unsafe/docs/beta.md', MAX_METADATA_READ_BYTES);
    expect(adapter.readFile).not.toHaveBeenCalledWith('/notes-root-unsafe/../secret.md');
    expect(adapter.readFile).not.toHaveBeenCalledWith('/notes-root-unsafe/nested/evil.md');
    expect(adapter.readFile).not.toHaveBeenCalledWith('/notes-root-unsafe/bad\\evil.md');
  });

  it('reuses cached metadata when file stats are unchanged', async () => {
    adapter.listDir.mockResolvedValue([
      { name: 'alpha.md', isFile: true },
    ]);
    adapter.readFile.mockResolvedValue([
      '---',
      'vlaina_updated: "2026-04-17T00:00:00.000Z"',
      '---',
      '',
      '# Alpha',
    ].join('\n'));
    adapter.stat.mockResolvedValue({ modifiedAt: 7, size: 80 });

    await loadNoteMetadata('/notes-root-cache');
    await loadNoteMetadata('/notes-root-cache');

    expect(adapter.readFile).toHaveBeenCalledTimes(1);
  });

  it('does not cache metadata using invalid modified timestamps', async () => {
    adapter.listDir.mockResolvedValue([
      { name: 'alpha.md', isFile: true },
    ]);
    adapter.readFile.mockResolvedValue([
      '---',
      'vlaina_updated: "2026-04-17T00:00:00.000Z"',
      '---',
      '',
      '# Alpha',
    ].join('\n'));
    adapter.stat.mockResolvedValue({ modifiedAt: Number.POSITIVE_INFINITY, size: 80 });

    await loadNoteMetadata('/notes-root-invalid-mtime');
    await loadNoteMetadata('/notes-root-invalid-mtime');

    expect(adapter.readFile).toHaveBeenCalledTimes(2);
  });

  it('does not read metadata when file stats are unavailable', async () => {
    adapter.listDir.mockResolvedValue([
      { name: 'alpha.md', isFile: true },
    ]);
    adapter.readFile.mockResolvedValue('# Alpha');
    adapter.stat.mockResolvedValue(null);

    await loadNoteMetadata('/notes-root-no-stat');
    await loadNoteMetadata('/notes-root-no-stat');

    expect(adapter.readFile).not.toHaveBeenCalled();
  });

  it('does not read oversized markdown files during metadata scans', async () => {
    adapter.listDir.mockResolvedValue([
      { name: 'huge.md', isFile: true },
    ]);
    adapter.stat.mockResolvedValue({ modifiedAt: 7, size: 6 * 1024 * 1024 });

    await expect(loadNoteMetadata('/notes-root-huge')).resolves.toEqual({
      version: 2,
      notes: {
        'huge.md': { updatedAt: 7 },
      },
    });
    expect(adapter.readFile).not.toHaveBeenCalled();
  });

  it('does not read markdown metadata when stat reports an invalid negative size', async () => {
    adapter.listDir.mockResolvedValue([
      { name: 'invalid.md', isFile: true },
    ]);
    adapter.stat.mockResolvedValue({ modifiedAt: 7, size: -1 });

    await expect(loadNoteMetadata('/notes-root-invalid-size')).resolves.toEqual({
      version: 2,
      notes: {
        'invalid.md': { updatedAt: 7 },
      },
    });
    expect(adapter.readFile).not.toHaveBeenCalled();
  });

  it('does not parse metadata content that exceeds the metadata limit after read', async () => {
    adapter.listDir.mockResolvedValue([
      { name: 'huge.md', isFile: true },
    ]);
    adapter.stat.mockResolvedValue({ modifiedAt: 7, size: 32 });
    adapter.readFile.mockResolvedValue('你'.repeat(Math.floor(MAX_METADATA_READ_BYTES / 3) + 1));

    await expect(loadNoteMetadata('/notes-root-huge-after-read')).resolves.toEqual({
      version: 2,
      notes: {
        'huge.md': { updatedAt: 7 },
      },
    });
    expect(adapter.readFile).toHaveBeenCalledWith('/notes-root-huge-after-read/huge.md', MAX_METADATA_READ_BYTES);
  });

  it('caps aggregate markdown reads during metadata scans', async () => {
    const fileSize = 1024 * 1024;
    const fileCount = Math.floor(MAX_METADATA_TOTAL_READ_BYTES / fileSize) + 8;
    adapter.listDir.mockResolvedValue(Array.from(
      { length: fileCount },
      (_value, index) => ({ name: `note-${index}.md`, isFile: true }),
    ));
    adapter.stat.mockResolvedValue({ modifiedAt: 7, size: fileSize });
    adapter.readFile.mockResolvedValue('x'.repeat(fileSize));

    await loadNoteMetadata('/notes-root-aggregate-budget');

    expect(adapter.readFile).toHaveBeenCalledTimes(MAX_METADATA_TOTAL_READ_BYTES / fileSize);
  });

  it('keeps generated folders low priority without hiding markdown metadata', async () => {
    adapter.listDir.mockImplementation(async (path: string) => {
      if (path === '/notes-root-heavy') {
        return [
          { name: 'node_modules', isDirectory: true },
          { name: 'Node_Modules', isDirectory: true },
          { name: 'Dist', isDirectory: true },
          { name: 'docs', isDirectory: true },
        ];
      }

      if (path === '/notes-root-heavy/docs') {
        return [{ name: 'alpha.md', isFile: true }];
      }

      if (path === '/notes-root-heavy/node_modules') {
        return [{ name: 'package.md', isFile: true }];
      }

      if (path === '/notes-root-heavy/Node_Modules') {
        return [{ name: 'package.md', isFile: true }];
      }

      if (path === '/notes-root-heavy/Dist') {
        return [{ name: 'bundle.md', isFile: true }];
      }

      return [];
    });
    adapter.readFile.mockResolvedValue([
      '---',
      'vlaina_updated: "2026-04-17T00:00:00.000Z"',
      '---',
      '',
      '# Alpha',
    ].join('\n'));

    await expect(loadNoteMetadata('/notes-root-heavy')).resolves.toEqual({
      version: 2,
      notes: {
        'Dist/bundle.md': {
          updatedAt: 2,
        },
        'docs/alpha.md': {
          updatedAt: 1,
        },
        'node_modules/package.md': {
          updatedAt: 2,
        },
        'Node_Modules/package.md': {
          updatedAt: 2,
        },
      },
    });
    expect(adapter.listDir).toHaveBeenCalledWith('/notes-root-heavy/node_modules', { includeHidden: true });
    expect(adapter.listDir).toHaveBeenCalledWith('/notes-root-heavy/Node_Modules', { includeHidden: true });
    expect(adapter.listDir).toHaveBeenCalledWith('/notes-root-heavy/Dist', { includeHidden: true });
  });

  it('prioritizes markdown and folders before capping non-markdown metadata scanning', async () => {
    adapter.listDir.mockImplementation(async (path: string) => {
      if (path === '/notes-root-many-assets') {
        return [
          ...Array.from({ length: 10_000 }, (_, index) => ({ name: `asset-${index}.png`, isFile: true })),
          { name: 'late.md', isFile: true },
          { name: 'late-folder', isDirectory: true },
        ];
      }

      if (path === '/notes-root-many-assets/late-folder') {
        return [{ name: 'nested.md', isFile: true }];
      }

      return [];
    });
    adapter.readFile.mockResolvedValue([
      '---',
      'vlaina_updated: "2026-04-17T00:00:00.000Z"',
      '---',
      '',
      '# Late',
    ].join('\n'));

    await expect(loadNoteMetadata('/notes-root-many-assets')).resolves.toEqual({
      version: 2,
      notes: {
        'late-folder/nested.md': {
          updatedAt: 2,
        },
        'late.md': {
          updatedAt: 2,
        },
      },
    });
    expect(adapter.readFile).toHaveBeenCalledWith('/notes-root-many-assets/late.md', MAX_METADATA_READ_BYTES);
    expect(adapter.readFile).toHaveBeenCalledWith('/notes-root-many-assets/late-folder/nested.md', MAX_METADATA_READ_BYTES);
  });

  it('keeps readable sibling metadata when one nested folder cannot be listed', async () => {
    adapter.listDir.mockImplementation(async (path: string) => {
      if (path === '/notes-root-partial-failure') {
        return [
          { name: 'root.md', isFile: true },
          { name: 'docs', isDirectory: true },
          { name: 'locked', isDirectory: true },
        ];
      }

      if (path === '/notes-root-partial-failure/docs') {
        return [{ name: 'inside.md', isFile: true }];
      }

      if (path === '/notes-root-partial-failure/locked') {
        throw new Error('Permission denied');
      }

      return [];
    });
    adapter.readFile.mockImplementation(async (path: string) => {
      const date = path.includes('inside')
        ? '2026-04-18T00:00:00.000Z'
        : '2026-04-17T00:00:00.000Z';

      return [
        '---',
        `vlaina_updated: "${date}"`,
        '---',
        '',
        '# Note',
      ].join('\n');
    });

    await expect(loadNoteMetadata('/notes-root-partial-failure')).resolves.toEqual({
      version: 2,
      notes: {
        'root.md': {
          updatedAt: 2,
        },
        'docs/inside.md': {
          updatedAt: 2,
        },
      },
    });
  });

  it('creates an empty metadata file shape when needed', () => {
    expect(createEmptyMetadataFile()).toEqual({
      version: 2,
      notes: {},
    });
  });

  it('normalizes global note icon size from storage and persistence writes', () => {
    localStorage.setItem('vlaina-note-icon-size', '72');
    expect(loadGlobalNoteIconSize()).toBe(72);

    expect(persistGlobalNoteIconSize(-1)).toBe(60);
    expect(localStorage.getItem('vlaina-note-icon-size')).toBe('60');
  });

  it('normalizes hostile runtime note icon sizes without coercion', () => {
    const hostileSize = {
      toString() {
        throw new Error('icon size coercion');
      },
    };

    expect(persistGlobalNoteIconSize(hostileSize as never)).toBe(60);
    expect(localStorage.getItem('vlaina-note-icon-size')).toBe('60');
  });

  it('stores workspace state in the system config folder instead of the notesRoot folder', async () => {
    const workspaceDir = `/app/.vlaina/notes/notes-roots/${getNotesRootStorageKey('/notes-root-a')}`;

    await saveWorkspaceState('/notes-root-a', {
      currentNotePath: 'alpha.md',
      expandedFolders: ['docs'],
      fileTreeSortMode: 'updated-desc',
    });

    expect(adapter.mkdir).toHaveBeenCalledWith(
      workspaceDir,
      true
    );
    expect(adapter.writeFile).toHaveBeenCalledWith(
      `${workspaceDir}/workspace.json`,
      JSON.stringify({
        currentNotePath: 'alpha.md',
        expandedFolders: ['docs'],
        fileTreeSortMode: 'updated-desc',
      }, null, 2)
    );
  });

  it('propagates workspace state write failures to the persistence coordinator', async () => {
    adapter.writeFile.mockRejectedValueOnce(new Error('Workspace disk unavailable'));

    await expect(saveWorkspaceState('/notes-root-a', {
      currentNotePath: 'alpha.md',
      expandedFolders: ['docs'],
      fileTreeSortMode: 'updated-desc',
    })).rejects.toThrow('Workspace disk unavailable');
  });

  it('overwrites expanded workspace folders when saving a current snapshot', async () => {
    const workspaceFile = `/app/.vlaina/notes/notes-roots/${getNotesRootStorageKey('/notes-root-a')}/workspace.json`;

    adapter.exists.mockResolvedValue(true);
    adapter.stat.mockResolvedValue({ size: 128 });
    adapter.readFile.mockResolvedValue(JSON.stringify({
      currentNotePath: 'beta.md',
      expandedFolders: ['archive'],
      fileTreeSortMode: 'name-asc',
    }));

    await saveWorkspaceState('/notes-root-a', {
      currentNotePath: 'alpha.md',
      expandedFolders: ['docs'],
      fileTreeSortMode: 'updated-desc',
    });

    expect(adapter.writeFile).toHaveBeenCalledWith(
      workspaceFile,
      JSON.stringify({
        currentNotePath: 'alpha.md',
        expandedFolders: ['docs'],
        fileTreeSortMode: 'updated-desc',
      }, null, 2)
    );
  });

  it('caps current expanded workspace folders before saving', async () => {
    adapter.exists.mockResolvedValue(true);
    adapter.stat.mockResolvedValue({ size: 128 });
    adapter.readFile.mockResolvedValue(JSON.stringify({
      currentNotePath: 'beta.md',
      expandedFolders: Array.from({ length: 5000 }, (_, index) => `disk-${index}`),
      fileTreeSortMode: 'name-asc',
    }));

    await saveWorkspaceState('/notes-root-a', {
      currentNotePath: 'alpha.md',
      expandedFolders: Array.from({ length: 5000 }, (_, index) => `current-${index}`),
      fileTreeSortMode: 'updated-desc',
    });

    const [, writtenContent] = adapter.writeFile.mock.calls.at(-1) ?? [];
    expect(JSON.parse(writtenContent as string)).toEqual({
      currentNotePath: 'alpha.md',
      expandedFolders: Array.from({ length: 5000 }, (_, index) => `current-${index}`),
      fileTreeSortMode: 'updated-desc',
    });
  });

  it('sanitizes recent note paths loaded from localStorage', () => {
    localStorage.setItem(
      'vlaina-recent-notes',
      JSON.stringify(['docs/alpha.md', '../secret.md', '/etc/passwd.md', 'docs/alpha.md', 'draft:local.md', 'image.png'])
    );

    expect(loadRecentNotes()).toEqual(['docs/alpha.md']);
  });

  it('sanitizes workspace state loaded from disk', async () => {
    adapter.exists.mockResolvedValue(true);
    adapter.stat.mockResolvedValue({ size: 128 });
    adapter.readFile.mockResolvedValue(
      JSON.stringify({
        currentNotePath: '../secret.md',
        expandedFolders: ['docs', '../escape', 'docs', '/tmp'],
        fileTreeSortMode: 'unexpected',
      })
    );

    await expect(loadWorkspaceState('/notes-root-a')).resolves.toEqual({
      currentNotePath: null,
      expandedFolders: ['docs'],
      fileTreeSortMode: undefined,
    });
  });

  it('does not restore draft pseudo paths from workspace state', async () => {
    adapter.exists.mockResolvedValue(true);
    adapter.stat.mockResolvedValue({ size: 128 });
    adapter.readFile.mockResolvedValue(
      JSON.stringify({
        currentNotePath: 'draft:local.md',
      })
    );

    await expect(loadWorkspaceState('/notes-root-a')).resolves.toEqual({
      currentNotePath: null,
      expandedFolders: [],
      fileTreeSortMode: undefined,
    });
  });

  it('reads workspace state files when stat has no size', async () => {
    adapter.exists.mockResolvedValue(true);
    adapter.stat.mockResolvedValue(null);
    adapter.readFile.mockResolvedValue(JSON.stringify({
      currentNotePath: 'docs/alpha.md',
      expandedFolders: ['docs'],
      fileTreeSortMode: 'name-asc',
    }));

    await expect(loadWorkspaceState('/notes-root-a')).resolves.toEqual({
      currentNotePath: 'docs/alpha.md',
      expandedFolders: ['docs'],
      fileTreeSortMode: 'name-asc',
    });
    expect(adapter.readFile).toHaveBeenCalledWith(expect.stringContaining('/workspace.json'), 256 * 1024);
  });

  it('does not read oversized workspace state files', async () => {
    adapter.exists.mockResolvedValue(true);
    adapter.stat.mockResolvedValue({ size: 300 * 1024 });

    await expect(loadWorkspaceState('/notes-root-a')).resolves.toBeNull();
    expect(adapter.readFile).not.toHaveBeenCalled();
  });

  it('does not read workspace state files with invalid negative stat sizes', async () => {
    adapter.exists.mockResolvedValue(true);
    adapter.stat.mockResolvedValue({ size: -1 });

    await expect(loadWorkspaceState('/notes-root-a')).resolves.toBeNull();
    expect(adapter.readFile).not.toHaveBeenCalled();
  });

  it('does not parse workspace state content that exceeds the limit after read', async () => {
    adapter.exists.mockResolvedValue(true);
    adapter.stat.mockResolvedValue({ size: 128 });
    adapter.readFile.mockResolvedValue('x'.repeat(256 * 1024 + 1));

    await expect(loadWorkspaceState('/notes-root-a')).resolves.toBeNull();
    expect(adapter.readFile).toHaveBeenCalled();
  });

  it('drops empty cover payloads when updating metadata', () => {
    const metadata: MetadataFile = {
      version: 2,
      notes: {
        'alpha.md': {
          cover: {
            assetPath: 'assets/alpha.webp',
            positionX: 50,
            positionY: 50,
          },
        },
      },
    };

    expect(setNoteEntry(metadata, 'alpha.md', { cover: undefined })).toEqual({
      version: 2,
      notes: {},
    });
  });
});

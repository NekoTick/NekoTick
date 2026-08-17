import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findImageFileReferences } from './imageFileReferences';

const hoisted = vi.hoisted(() => ({
  exists: vi.fn(async () => false),
  readFile: vi.fn(async () => ''),
  resolveNotesRootAssetPathCandidates: vi.fn(async (
    notesPath: string,
    source: string,
    notePath?: string,
  ) => {
    const noteDir = notePath?.includes('/') ? notePath.slice(0, notePath.lastIndexOf('/')) : '';
    const normalizedSource = decodeURIComponent(source).replace(/^\.\//, '');
    return [normalizedSource.startsWith('../')
      ? `${notesPath}/${normalizedSource.replace('../', '')}`
      : `${notesPath}/${noteDir ? `${noteDir}/` : ''}${normalizedSource}`];
  }),
}));

vi.mock('@/lib/storage/adapter', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/storage/adapter')>(),
  getStorageAdapter: () => ({ exists: hoisted.exists, readFile: hoisted.readFile }),
}));

vi.mock('@/lib/assets/core/paths', () => ({
  resolveNotesRootAssetPathCandidates: hoisted.resolveNotesRootAssetPathCandidates,
}));

vi.mock('@/stores/notes/utils/fs/notesRootPathContainment', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/stores/notes/utils/fs/notesRootPathContainment')>(),
  resolveNotesRootRelativeFullPath: vi.fn(async (notesPath: string, path: string) => ({
    fullPath: `${notesPath}/${path}`,
    relativePath: path,
  })),
}));

const rootFolder = {
  id: '',
  name: 'Notes',
  path: '',
  isFolder: true as const,
  expanded: true,
  children: [
    { id: 'docs/alpha.md', name: 'alpha', path: 'docs/alpha.md', isFolder: false as const },
    { id: 'docs/beta.md', name: 'beta', path: 'docs/beta.md', isFolder: false as const },
  ],
};

describe('findImageFileReferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.exists.mockResolvedValue(false);
  });

  it('reads uncached notes concurrently in bounded batches', async () => {
    let activeReads = 0;
    let maxActiveReads = 0;
    hoisted.readFile.mockImplementation(async () => {
      activeReads += 1;
      maxActiveReads = Math.max(maxActiveReads, activeReads);
      await new Promise((resolve) => setTimeout(resolve, 1));
      activeReads -= 1;
      return '# No image';
    });
    const manyNotesRoot = {
      ...rootFolder,
      children: Array.from({ length: 16 }, (_value, index) => ({
        id: `note-${index}.md`,
        name: `note-${index}`,
        path: `note-${index}.md`,
        isFolder: false as const,
      })),
    };

    await findImageFileReferences({
      notesPath: '/notesRoot',
      rootFolder: manyNotesRoot,
      imagePath: 'assets/cover.webp',
      currentNote: null,
      noteContentsCache: new Map(),
      noteMetadata: null,
    });

    expect(maxActiveReads).toBe(8);
  });

  it('stops before reading another batch after cancellation', async () => {
    const controller = new AbortController();
    let releaseReads: (() => void) | undefined;
    const readsReleased = new Promise<void>((resolve) => {
      releaseReads = resolve;
    });
    hoisted.readFile.mockImplementation(async () => {
      await readsReleased;
      return '# No image';
    });
    const manyNotesRoot = {
      ...rootFolder,
      children: Array.from({ length: 16 }, (_value, index) => ({
        id: `cancel-${index}.md`,
        name: `cancel-${index}`,
        path: `cancel-${index}.md`,
        isFolder: false as const,
      })),
    };

    const scan = findImageFileReferences({
      notesPath: '/notesRoot',
      rootFolder: manyNotesRoot,
      imagePath: 'assets/cancel.webp',
      currentNote: null,
      noteContentsCache: new Map(),
      noteMetadata: null,
    }, { signal: controller.signal });

    await vi.waitFor(() => expect(hoisted.readFile).toHaveBeenCalledTimes(8));
    controller.abort();
    releaseReads?.();

    await expect(scan).rejects.toMatchObject({ name: 'AbortError' });
    expect(hoisted.readFile).toHaveBeenCalledTimes(8);
  });

  it('reuses a recent scan for unchanged note state', async () => {
    const noteContentsCache = new Map([
      ['docs/alpha.md', { content: '![other](assets/other.png)', modifiedAt: 1 }],
      ['docs/beta.md', { content: '![other](assets/other.png)', modifiedAt: 1 }],
    ]);
    const input = {
      notesPath: '/notesRoot',
      rootFolder,
      imagePath: 'docs/assets/cached.webp',
      currentNote: null,
      noteContentsCache,
      noteMetadata: null,
    };

    await findImageFileReferences(input);
    await findImageFileReferences(input);

    expect(hoisted.resolveNotesRootAssetPathCandidates).toHaveBeenCalledTimes(2);
    expect(hoisted.readFile).not.toHaveBeenCalled();
  });

  it('finds Markdown, HTML, and cover references to an image', async () => {
    const references = await findImageFileReferences({
      notesPath: '/notesRoot',
      rootFolder,
      imagePath: 'docs/assets/cover.png',
      currentNote: { path: 'docs/alpha.md', content: '![cover](assets/cover.png)' },
      noteContentsCache: new Map([[
        'docs/beta.md',
        { content: '<img src="assets/cover.png">', modifiedAt: 1 },
      ]]),
      noteMetadata: {
        version: 2,
        notes: { 'docs/beta.md': { cover: { assetPath: 'assets/cover.png' } } },
      },
    });

    expect(references).toEqual([
      { path: 'docs/alpha.md', name: 'alpha', kind: 'body', source: 'assets/cover.png', offset: 9 },
      { path: 'docs/beta.md', name: 'beta', kind: 'body', source: 'assets/cover.png', offset: 10 },
    ]);
  });

  it('finds a bare Obsidian image embed and reports its full source span', async () => {
    const obsidianRoot = {
      ...rootFolder,
      children: [
        ...rootFolder.children,
        {
          id: 'attachments',
          name: 'attachments',
          path: 'attachments',
          isFolder: true as const,
          expanded: false,
          children: [{
            id: 'attachments/cover.png',
            name: 'cover.png',
            path: 'attachments/cover.png',
            isFolder: false as const,
            kind: 'image' as const,
          }],
        },
      ],
    };
    const references = await findImageFileReferences({
      notesPath: '/notesRoot',
      rootFolder: obsidianRoot,
      imagePath: 'attachments/cover.png',
      currentNote: {
        path: 'docs/alpha.md',
        content: 'Before ![[cover.png|Cover image]] after',
      },
      noteContentsCache: new Map([['docs/beta.md', { content: '# None', modifiedAt: 1 }]]),
      noteMetadata: null,
    });

    expect(references).toEqual([{
      path: 'docs/alpha.md',
      name: 'alpha',
      kind: 'body',
      source: '![[cover.png|Cover image]]',
      offset: 7,
    }]);
  });

  it('ignores unrelated image references', async () => {
    const references = await findImageFileReferences({
      notesPath: '/notesRoot',
      rootFolder,
      imagePath: 'docs/assets/cover.png',
      currentNote: null,
      noteContentsCache: new Map([
        ['docs/alpha.md', { content: '![other](assets/other.png)', modifiedAt: 1 }],
        ['docs/beta.md', { content: '# No image', modifiedAt: 1 }],
      ]),
      noteMetadata: null,
    });

    expect(references).toEqual([]);
  });

  it('counts a note cover as an image reference without a body image', async () => {
    const references = await findImageFileReferences({
      notesPath: '/notesRoot',
      rootFolder,
      imagePath: 'docs/assets/cover.webp',
      currentNote: null,
      noteContentsCache: new Map([
        ['docs/alpha.md', { content: '# Cover only', modifiedAt: 1 }],
        ['docs/beta.md', { content: '# Unrelated', modifiedAt: 1 }],
      ]),
      noteMetadata: {
        version: 2,
        notes: { 'docs/alpha.md': { cover: { assetPath: 'assets/cover.webp' } } },
      },
    });

    expect(references).toEqual([{ path: 'docs/alpha.md', name: 'alpha', kind: 'cover' }]);
  });
});

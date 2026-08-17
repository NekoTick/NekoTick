import { beforeEach, describe, expect, it, vi } from 'vitest';
import { collectImageReferenceContentUpdates } from './imageReferenceRewrite';

const hoisted = vi.hoisted(() => ({
  exists: vi.fn(async () => false),
  readFile: vi.fn(async () => ''),
}));

vi.mock('@/lib/storage/adapter', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/storage/adapter')>(),
  getStorageAdapter: () => ({
    exists: hoisted.exists,
    readFile: hoisted.readFile,
  }),
}));

vi.mock('./notesRootPathContainment', async (importOriginal) => ({
  ...await importOriginal<typeof import('./notesRootPathContainment')>(),
  resolveNotesRootRelativeFullPath: vi.fn(async (notesPath: string, path: string) => ({
    fullPath: `${notesPath}/${path}`,
    relativePath: path,
  })),
}));

describe('collectImageReferenceContentUpdates', () => {
  beforeEach(() => {
    hoisted.exists.mockClear();
    hoisted.readFile.mockClear();
  });

  it('rewrites every body reference and the note cover', async () => {
    const content = [
      '---',
      'vlaina_cover: "assets/old image.png"',
      '---',
      '',
      '![first](assets/old%20image.png)',
      '<img src="assets/old%20image.png">',
      '![other](assets/other.png)',
    ].join('\n');
    const rootFolder = {
      id: '',
      name: 'Notes',
      path: '',
      isFolder: true as const,
      expanded: true,
      children: [
        { id: 'docs/alpha.md', name: 'alpha', path: 'docs/alpha.md', isFolder: false as const },
      ],
    };

    const updates = await collectImageReferenceContentUpdates({
      notesPath: '/notesRoot',
      rootFolder,
      oldImagePath: 'docs/assets/old image.png',
      newImagePath: 'docs/assets/new image.png',
      currentNote: { path: 'docs/alpha.md', content },
      noteContentsCache: new Map(),
      noteMetadata: {
        version: 2,
        notes: {
          'docs/alpha.md': { cover: { assetPath: 'assets/old image.png', positionX: 30 } },
        },
      },
    });

    expect(updates).toHaveLength(1);
    expect(updates[0]?.content).toContain('vlaina_cover: "assets/new image.png" x=30');
    expect(updates[0]?.content.match(/assets\/new%20image\.png/g)).toHaveLength(2);
    expect(updates[0]?.content).toContain('assets/other.png');
    expect(updates[0]?.content).not.toContain('assets/old%20image.png');
  });

  it('uses an absolute current-note cache entry for a note inside the root', async () => {
    const rootFolder = {
      id: '',
      name: 'Notes',
      path: '',
      isFolder: true as const,
      expanded: true,
      children: [
        { id: 'docs/alpha.md', name: 'alpha', path: 'docs/alpha.md', isFolder: false as const },
      ],
    };

    const updates = await collectImageReferenceContentUpdates({
      notesPath: '/notesRoot',
      rootFolder,
      oldImagePath: 'docs/assets/old.png',
      newImagePath: 'docs/archive/old.png',
      currentNote: {
        path: '/notesRoot/docs/alpha.md',
        content: '![cover](assets/old.png)',
      },
      noteContentsCache: new Map(),
      noteMetadata: null,
    });

    expect(hoisted.readFile).not.toHaveBeenCalled();
    expect(updates).toEqual([{
      path: 'docs/alpha.md',
      documentPath: '/notesRoot/docs/alpha.md',
      baselineContent: '![cover](assets/old.png)',
      content: '![cover](archive/old.png)',
    }]);
  });

  it('rewrites Obsidian image paths while preserving aliases and code literals', async () => {
    const content = [
      '![[old image.png|Cover image]]',
      '| ![[old image.png\\|300]] |',
      '`![[old image.png|inline literal]]`',
      '```md',
      '![[old image.png|fenced literal]]',
      '```',
    ].join('\n');
    const rootFolder = {
      id: '',
      name: 'Notes',
      path: '',
      isFolder: true as const,
      expanded: true,
      children: [
        { id: 'docs/alpha.md', name: 'alpha', path: 'docs/alpha.md', isFolder: false as const },
        {
          id: 'assets',
          name: 'assets',
          path: 'assets',
          isFolder: true as const,
          expanded: false,
          children: [{
            id: 'assets/old image.png',
            name: 'old image.png',
            path: 'assets/old image.png',
            isFolder: false as const,
            kind: 'image' as const,
          }],
        },
      ],
    };

    const updates = await collectImageReferenceContentUpdates({
      notesPath: '/notesRoot',
      rootFolder,
      oldImagePath: 'assets/old image.png',
      newImagePath: 'assets/new image.png',
      currentNote: { path: 'docs/alpha.md', content },
      noteContentsCache: new Map(),
      noteMetadata: null,
    });

    expect(updates[0]?.content).toBe([
      '![[../assets/new image.png|Cover image]]',
      '| ![[../assets/new image.png\\|300]] |',
      '`![[old image.png|inline literal]]`',
      '```md',
      '![[old image.png|fenced literal]]',
      '```',
    ].join('\n'));
  });
});

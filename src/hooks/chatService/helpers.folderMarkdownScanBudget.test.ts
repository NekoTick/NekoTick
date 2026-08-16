import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadMentionedNotes } from './helpers';

const MAX_NOTE_MENTION_READ_BYTES = 512 * 1024;

const mocks = vi.hoisted(() => ({
  flushCurrentPendingEditorMarkdown: vi.fn(),
  storage: {
    listDir: vi.fn(),
    stat: vi.fn(),
    readFile: vi.fn(),
  },
  notesState: {
    currentNote: null,
    noteContentsCache: new Map<string, { content: string }>(),
    notesPath: '/notesRoot',
    rootFolder: null as any,
    starredEntries: [],
    getDisplayName: vi.fn((path: string) => path),
  },
}));

vi.mock('@/stores/accountSession', () => ({
  useAccountSessionStore: {
    getState: () => ({ isConnected: false }),
  },
}));

vi.mock('@/stores/useManagedAIStore', () => ({
  useManagedAIStore: {
    getState: () => ({ refreshBudget: vi.fn() }),
  },
}));

vi.mock('@/stores/notes/useNotesStore', () => ({
  useNotesStore: {
    getState: () => mocks.notesState,
  },
}));

vi.mock('@/stores/notes/pendingEditorMarkdownFlusher', () => ({
  flushCurrentPendingEditorMarkdown: mocks.flushCurrentPendingEditorMarkdown,
}));

vi.mock('@/lib/markdown/svgRasterize', () => ({
  isSvgDataUrl: (value: string) => value.trim().toLowerCase().startsWith('data:image/svg+xml'),
  rasterizeSvgDataUrlToPng: vi.fn(),
}));

vi.mock('@/lib/storage/adapter', () => ({
  getStorageAdapter: () => mocks.storage,
  isAbsolutePath: (path: string) => path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path),
  joinPath: async (...segments: string[]) => segments.filter(Boolean).join('/'),
  normalizeAbsolutePath: (path: string) => path.replace(/\\/g, '/'),
}));

describe('folder markdown mention scan budgets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.notesState.currentNote = null;
    mocks.notesState.noteContentsCache = new Map();
    mocks.notesState.notesPath = '/notesRoot';
    mocks.notesState.rootFolder = null;
    mocks.notesState.starredEntries = [];
    mocks.storage.stat.mockResolvedValue({ isFile: true, isDirectory: false, size: 128 });
    mocks.storage.readFile.mockResolvedValue('# Alpha');
  });

  it('does not spend disk scan budget on unsupported files before markdown notes', async () => {
    mocks.storage.listDir.mockImplementation(async (path: string) => {
      if (path === '/notesRoot/docs') {
        return [
          ...Array.from({ length: 600 }, (_value, index) => ({
            name: `a-asset-${String(index).padStart(3, '0')}.png`,
            path: `/notesRoot/docs/a-asset-${String(index).padStart(3, '0')}.png`,
            isDirectory: false,
            isFile: true,
            size: 1024,
          })),
          {
            name: 'z-alpha.md',
            path: '/notesRoot/docs/z-alpha.md',
            isDirectory: false,
            isFile: true,
            size: 128,
          },
        ];
      }
      return [];
    });

    const notes = await loadMentionedNotes([
      { path: 'docs', title: 'Docs', kind: 'folder' },
    ]);

    expect(notes.slice(1)).toEqual([
      {
        path: 'docs/z-alpha.md',
        title: 'Docs/z-alpha',
        kind: 'note',
        content: '# Alpha',
      },
    ]);
    expect(mocks.storage.readFile).toHaveBeenCalledWith('/notesRoot/docs/z-alpha.md', MAX_NOTE_MENTION_READ_BYTES);
  });

  it('prioritizes markdown notes before applying the folder mention listing scan cap', async () => {
    const entries = Array.from({ length: 5000 }, (_value, index) => ({
      name: `asset-${String(index).padStart(4, '0')}.png`,
      path: `/notesRoot/docs/asset-${String(index).padStart(4, '0')}.png`,
      isDirectory: false,
      isFile: true,
      size: 1024,
    }));
    entries.push({
      name: 'late.md',
      path: '/notesRoot/docs/late.md',
      isDirectory: false,
      isFile: true,
      size: 128,
    });
    mocks.storage.listDir.mockResolvedValue(entries);
    mocks.storage.readFile.mockResolvedValue('# Late');

    const notes = await loadMentionedNotes([
      { path: 'docs', title: 'Docs', kind: 'folder' },
    ]);

    expect(notes.slice(1)).toEqual([
      {
        path: 'docs/late.md',
        title: 'Docs/late',
        kind: 'note',
        content: '# Late',
      },
    ]);
    expect(mocks.storage.readFile).toHaveBeenCalledWith('/notesRoot/docs/late.md', MAX_NOTE_MENTION_READ_BYTES);
  });

  it('applies the folder mention listing scan cap across nested directories', async () => {
    mocks.storage.listDir.mockImplementation(async (path: string) => {
      if (path === '/notesRoot/docs') {
        return [
          {
            name: 'a',
            path: '/notesRoot/docs/a',
            isDirectory: true,
            isFile: false,
          },
          {
            name: 'b',
            path: '/notesRoot/docs/b',
            isDirectory: true,
            isFile: false,
          },
        ];
      }

      if (path === '/notesRoot/docs/a') {
        return Array.from({ length: 4999 }, (_value, index) => ({
          name: `asset-${String(index).padStart(4, '0')}.png`,
          path: `/notesRoot/docs/a/asset-${String(index).padStart(4, '0')}.png`,
          isDirectory: false,
          isFile: true,
          size: 1024,
        }));
      }

      if (path === '/notesRoot/docs/b') {
        return [
          {
            name: 'late.md',
            path: '/notesRoot/docs/b/late.md',
            isDirectory: false,
            isFile: true,
            size: 128,
          },
        ];
      }

      return [];
    });

    const notes = await loadMentionedNotes([
      { path: 'docs', title: 'Docs', kind: 'folder' },
    ]);

    expect(notes.slice(1)).toEqual([]);
    expect(mocks.storage.listDir).not.toHaveBeenCalledWith('/notesRoot/docs/b', { includeHidden: true });
    expect(mocks.storage.readFile).not.toHaveBeenCalledWith('/notesRoot/docs/b/late.md', MAX_NOTE_MENTION_READ_BYTES);
  });

  it('does not spend folder mention scan budget on sibling folders before markdown notes', async () => {
    mocks.storage.listDir.mockImplementation(async (path: string) => {
      if (path === '/notesRoot/docs') {
        return [
          ...Array.from({ length: 500 }, (_value, index) => ({
            name: `folder-${String(index).padStart(3, '0')}`,
            path: `/notesRoot/docs/folder-${String(index).padStart(3, '0')}`,
            isDirectory: true,
            isFile: false,
          })),
          {
            name: 'z-late.md',
            path: '/notesRoot/docs/z-late.md',
            isDirectory: false,
            isFile: true,
            size: 128,
          },
        ];
      }
      return [];
    });
    mocks.storage.readFile.mockResolvedValue('# Late');

    const notes = await loadMentionedNotes([
      { path: 'docs', title: 'Docs', kind: 'folder' },
    ]);

    expect(notes.slice(1)).toEqual([
      {
        path: 'docs/z-late.md',
        title: 'Docs/z-late',
        kind: 'note',
        content: '# Late',
      },
    ]);
    expect(mocks.storage.readFile).toHaveBeenCalledWith('/notesRoot/docs/z-late.md', MAX_NOTE_MENTION_READ_BYTES);
  });

  it('does not spend folder mention note output slots on oversized disk markdown candidates', async () => {
    mocks.storage.listDir.mockImplementation(async (path: string) => {
      if (path === '/notesRoot/docs') {
        return [
          ...Array.from({ length: 20 }, (_value, index) => ({
            name: `bad-${String(index).padStart(2, '0')}.md`,
            path: `/notesRoot/docs/bad-${String(index).padStart(2, '0')}.md`,
            isDirectory: false,
            isFile: true,
            size: MAX_NOTE_MENTION_READ_BYTES + 1,
          })),
          {
            name: 'valid.md',
            path: '/notesRoot/docs/valid.md',
            isDirectory: false,
            isFile: true,
            size: 128,
          },
        ];
      }
      return [];
    });
    mocks.storage.stat.mockImplementation(async (path: string) => (
      path.includes('/bad-')
        ? { isFile: true, isDirectory: false, size: MAX_NOTE_MENTION_READ_BYTES + 1 }
        : { isFile: true, isDirectory: false, size: 128 }
    ));
    mocks.storage.readFile.mockImplementation(async (path: string) => {
      if (path === '/notesRoot/docs/valid.md') return '# Valid';
      throw new Error(`Unexpected read: ${path}`);
    });

    const notes = await loadMentionedNotes([
      { path: 'docs', title: 'Docs', kind: 'folder' },
    ]);

    expect(notes.slice(1)).toEqual([
      {
        path: 'docs/valid.md',
        title: 'Docs/valid',
        kind: 'note',
        content: '# Valid',
      },
    ]);
    expect(mocks.storage.readFile.mock.calls.some(([path]) => String(path).includes('/bad-'))).toBe(false);
  });

  it('does not spend file tree folder mention note slots on oversized markdown candidates', async () => {
    mocks.notesState.rootFolder = {
      id: '',
      name: 'Notes',
      path: '',
      isFolder: true,
      expanded: true,
      children: [{
        id: 'docs',
        name: 'docs',
        path: 'docs',
        isFolder: true,
        expanded: true,
        children: [
          ...Array.from({ length: 20 }, (_value, index) => ({
            id: `docs/bad-${String(index).padStart(2, '0')}.md`,
            name: `bad-${String(index).padStart(2, '0')}.md`,
            path: `docs/bad-${String(index).padStart(2, '0')}.md`,
            isFolder: false as const,
          })),
          {
            id: 'docs/valid.md',
            name: 'valid.md',
            path: 'docs/valid.md',
            isFolder: false as const,
          },
        ],
      }],
    };
    mocks.notesState.getDisplayName = vi.fn((path: string) => path.split('/').pop() ?? path);
    mocks.storage.listDir.mockResolvedValue([]);
    mocks.storage.stat.mockImplementation(async (path: string) => (
      path.includes('/bad-')
        ? { isFile: true, isDirectory: false, size: MAX_NOTE_MENTION_READ_BYTES + 1 }
        : { isFile: true, isDirectory: false, size: 128 }
    ));
    mocks.storage.readFile.mockImplementation(async (path: string) => {
      if (path === '/notesRoot/docs/valid.md') return '# Valid';
      throw new Error(`Unexpected read: ${path}`);
    });

    const notes = await loadMentionedNotes([
      { path: 'docs', title: 'Docs', kind: 'folder' },
    ]);

    expect(notes.slice(1)).toEqual([
      {
        path: 'docs/valid.md',
        title: 'Docs/valid.md',
        kind: 'note',
        content: '# Valid',
      },
    ]);
    expect(mocks.storage.readFile.mock.calls.some(([path]) => String(path).includes('/bad-'))).toBe(false);
  });

  it('scans user dot markdown and low-priority generated folders while skipping internal folders', async () => {
    mocks.storage.listDir.mockImplementation(async (path: string) => {
      if (path === '/notesRoot/docs') {
        return [
          {
            name: '.journal.md',
            path: '/notesRoot/docs/.journal.md',
            isDirectory: false,
            isFile: true,
            size: 128,
          },
          {
            name: '.notes',
            path: '/notesRoot/docs/.notes',
            isDirectory: true,
            isFile: false,
          },
          {
            name: '.vlaina',
            path: '/notesRoot/docs/.vlaina',
            isDirectory: true,
            isFile: false,
          },
          {
            name: '.git',
            path: '/notesRoot/docs/.git',
            isDirectory: true,
            isFile: false,
          },
          {
            name: '.VLAINA',
            path: '/notesRoot/docs/.VLAINA',
            isDirectory: true,
            isFile: false,
          },
          {
            name: '.GIT',
            path: '/notesRoot/docs/.GIT',
            isDirectory: true,
            isFile: false,
          },
          {
            name: 'node_modules',
            path: '/notesRoot/docs/node_modules',
            isDirectory: true,
            isFile: false,
          },
          {
            name: 'Node_Modules',
            path: '/notesRoot/docs/Node_Modules',
            isDirectory: true,
            isFile: false,
          },
          {
            name: 'Dist',
            path: '/notesRoot/docs/Dist',
            isDirectory: true,
            isFile: false,
          },
        ];
      }

      if (path === '/notesRoot/docs/.notes') {
        return [
          {
            name: 'alpha.md',
            path: '/notesRoot/docs/.notes/alpha.md',
            isDirectory: false,
            isFile: true,
            size: 128,
          },
        ];
      }

      return [
        {
          name: 'internal.md',
          path: `${path}/internal.md`,
          isDirectory: false,
          isFile: true,
          size: 128,
        },
      ];
    });
    mocks.storage.readFile.mockImplementation(async (path: string) => {
      if (path === '/notesRoot/docs/.journal.md') return '# Journal';
      if (path === '/notesRoot/docs/.notes/alpha.md') return '# Alpha';
      return '# Internal';
    });

    const notes = await loadMentionedNotes([
      { path: 'docs', title: 'Docs', kind: 'folder' },
    ]);

    expect(notes.slice(1)).toEqual([
      {
        path: 'docs/.journal.md',
        title: 'Docs/.journal',
        kind: 'note',
        content: '# Journal',
      },
      {
        path: 'docs/.notes/alpha.md',
        title: 'Docs/.notes/alpha',
        kind: 'note',
        content: '# Alpha',
      },
      {
        path: 'docs/Dist/internal.md',
        title: 'Docs/Dist/internal',
        kind: 'note',
        content: '# Internal',
      },
      {
        path: 'docs/node_modules/internal.md',
        title: 'Docs/node_modules/internal',
        kind: 'note',
        content: '# Internal',
      },
      {
        path: 'docs/Node_Modules/internal.md',
        title: 'Docs/Node_Modules/internal',
        kind: 'note',
        content: '# Internal',
      },
    ]);
    expect(notes[0]?.content).toContain('- .notes (folder)');
    expect(notes[0]?.content).toContain('- .journal.md (file, 128 B)');
    expect(notes[0]?.content).not.toContain('- .vlaina');
    expect(notes[0]?.content).not.toContain('- .git');
    expect(notes[0]?.content).not.toContain('- .VLAINA');
    expect(notes[0]?.content).not.toContain('- .GIT');
    expect(mocks.storage.listDir).toHaveBeenCalledWith('/notesRoot/docs', { includeHidden: true });
    expect(mocks.storage.listDir).toHaveBeenCalledWith('/notesRoot/docs/.notes', { includeHidden: true });
    expect(mocks.storage.listDir).not.toHaveBeenCalledWith('/notesRoot/docs/.vlaina');
    expect(mocks.storage.listDir).not.toHaveBeenCalledWith('/notesRoot/docs/.git');
    expect(mocks.storage.listDir).not.toHaveBeenCalledWith('/notesRoot/docs/.VLAINA');
    expect(mocks.storage.listDir).not.toHaveBeenCalledWith('/notesRoot/docs/.GIT');
    expect(mocks.storage.listDir).toHaveBeenCalledWith('/notesRoot/docs/node_modules', { includeHidden: true });
    expect(mocks.storage.listDir).toHaveBeenCalledWith('/notesRoot/docs/Node_Modules', { includeHidden: true });
    expect(mocks.storage.listDir).toHaveBeenCalledWith('/notesRoot/docs/Dist', { includeHidden: true });
  });
});

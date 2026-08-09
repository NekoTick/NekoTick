import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resolveExistingNotesRootAssetPath,
  resolveNotesRootAssetPath,
  resolveNotesRootAssetPathCandidates,
} from './paths';

const hoisted = vi.hoisted(() => ({
  exists: vi.fn(),
}));

vi.mock('@/lib/storage/adapter', () => ({
  getParentPath: (path: string) => {
    const normalized = path.replace(/\\/g, '/');
    const index = normalized.lastIndexOf('/');
    return index <= 0 ? '' : normalized.slice(0, index);
  },
  getStorageAdapter: () => ({
    exists: hoisted.exists,
  }),
  isAbsolutePath: (path: string) => path.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(path),
  joinPath: (...segments: string[]) => Promise.resolve(
    segments
      .filter(Boolean)
      .map((segment, index) => {
        if (index > 0) return segment.replace(/^[/\\]+/, '');
        return segment.replace(/[/\\]+$/, '');
      })
      .join('/')
  ),
}));

describe('asset path resolution', () => {
  beforeEach(() => {
    hoisted.exists.mockReset();
  });

  it('keeps legacy resolution as note-relative first', async () => {
    await expect(resolveNotesRootAssetPath('/notesRoot', 'assets/a.png', 'daily/note.md'))
      .resolves.toBe('/notesRoot/daily/assets/a.png');
  });

  it('resolves asset paths with query and fragment against the local file path', async () => {
    await expect(resolveNotesRootAssetPathCandidates('/notesRoot', 'assets/a.png?cache=1#preview', 'daily/note.md'))
      .resolves.toEqual([
        '/notesRoot/daily/assets/a.png',
        '/notesRoot/assets/a.png',
      ]);
  });

  it('decodes URL-encoded local asset paths before resolving files', async () => {
    await expect(resolveNotesRootAssetPathCandidates(
      '/notesRoot',
      '../assets/cover%20image.png',
      'daily/note.md',
    )).resolves.toEqual(['/notesRoot/assets/cover image.png']);
  });

  it('offers a opened-folder fallback for bare asset paths in nested notes', async () => {
    await expect(resolveNotesRootAssetPathCandidates('/notesRoot', 'assets/a.png', 'daily/note.md'))
      .resolves.toEqual([
        '/notesRoot/daily/assets/a.png',
        '/notesRoot/assets/a.png',
      ]);
  });

  it('uses the first existing candidate when resolving for display', async () => {
    hoisted.exists
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await expect(resolveExistingNotesRootAssetPath('/notesRoot', 'assets/a.png', 'daily/note.md'))
      .resolves.toBe('/notesRoot/assets/a.png');
  });

  it('returns no path when none of the candidates exists', async () => {
    hoisted.exists.mockResolvedValue(false);

    await expect(resolveExistingNotesRootAssetPath('/notesRoot', 'assets/a.png', 'daily/note.md'))
      .resolves.toBe('');
  });

  it('does not add a fallback for explicit note-relative paths', async () => {
    await expect(resolveNotesRootAssetPathCandidates('/notesRoot', './assets/a.png', 'daily/note.md'))
      .resolves.toEqual(['/notesRoot/daily/assets/a.png']);
  });

  it('keeps parent traversal inside the notesRoot root', async () => {
    await expect(resolveNotesRootAssetPathCandidates('/notesRoot', '../assets/a.png', 'daily/note.md'))
      .resolves.toEqual(['/notesRoot/assets/a.png']);
  });

  it('rejects parent traversal outside the notesRoot root', async () => {
    await expect(resolveNotesRootAssetPathCandidates('/notesRoot', '../../secret.png', 'daily/note.md'))
      .resolves.toEqual([]);
  });

  it('rejects internal notesRoot asset path segments while allowing user dot folders', async () => {
    await expect(resolveNotesRootAssetPathCandidates('/notesRoot', '.vlaina/assets/a.png', 'daily/note.md'))
      .resolves.toEqual([]);

    await expect(resolveNotesRootAssetPathCandidates('/notesRoot', '%2evlaina/assets/a.png', 'daily/note.md'))
      .resolves.toEqual([]);

    await expect(resolveNotesRootAssetPathCandidates('/notesRoot', 'docs/.git/a.png', 'daily/note.md'))
      .resolves.toEqual([]);

    await expect(resolveNotesRootAssetPathCandidates('/notesRoot', 'docs/%2egit/a.png', 'daily/note.md'))
      .resolves.toEqual([]);

    await expect(resolveNotesRootAssetPathCandidates('/notesRoot', 'docs/%252egit/a.png', 'daily/note.md'))
      .resolves.toEqual([]);

    await expect(resolveNotesRootAssetPathCandidates('/notesRoot', 'docs%2f.git%2fa.png', 'daily/note.md'))
      .resolves.toEqual([]);

    await expect(resolveNotesRootAssetPathCandidates('/notesRoot', 'docs/.GIT/a.png', 'daily/note.md'))
      .resolves.toEqual([]);

    await expect(resolveNotesRootAssetPathCandidates('/notesRoot', './.git/a.png', 'daily/note.md'))
      .resolves.toEqual([]);

    await expect(resolveNotesRootAssetPathCandidates('/notesRoot', './docs/%2egit/a.png', 'daily/note.md'))
      .resolves.toEqual([]);

    await expect(resolveNotesRootAssetPathCandidates('/notesRoot', '.notes/assets/a.png', 'daily/note.md'))
      .resolves.toEqual([
        '/notesRoot/daily/.notes/assets/a.png',
        '/notesRoot/.notes/assets/a.png',
      ]);

    await expect(resolveNotesRootAssetPathCandidates('/notesRoot', '%2enotes/assets/a.png', 'daily/note.md'))
      .resolves.toEqual([
        '/notesRoot/daily/.notes/assets/a.png',
        '/notesRoot/.notes/assets/a.png',
      ]);
  });

  it('does not resolve assets from internal current note paths', async () => {
    await expect(resolveNotesRootAssetPathCandidates('/notesRoot', 'assets/a.png', '.vlaina/workspace.md'))
      .resolves.toEqual([]);

    await expect(resolveNotesRootAssetPathCandidates('/notesRoot', 'assets/a.png', 'docs/.git/config.md'))
      .resolves.toEqual([]);
  });

  it('does not resolve assets from unsafe current note paths', async () => {
    await expect(resolveNotesRootAssetPathCandidates('/notesRoot', 'assets/a.png', 'daily/unsafe\u202Egnp.md'))
      .resolves.toEqual([]);

    await expect(resolveNotesRootAssetPathCandidates('/notesRoot', 'assets/a.png', '/tmp/shared/unsafe\0.md'))
      .resolves.toEqual([]);
  });

  it('rejects absolute asset paths from note metadata', async () => {
    await expect(resolveNotesRootAssetPathCandidates('/notesRoot', '/etc/passwd', 'daily/note.md'))
      .resolves.toEqual([]);

    await expect(resolveNotesRootAssetPathCandidates('/notesRoot', 'C:\\Users\\me\\secret.png', 'daily/note.md'))
      .resolves.toEqual([]);
  });

  it('rejects unsafe non-local asset paths before resolving candidates', async () => {
    await expect(resolveNotesRootAssetPathCandidates('/notesRoot', 'https://example.com/a.png', 'daily/note.md'))
      .resolves.toEqual([]);

    await expect(resolveNotesRootAssetPathCandidates('/notesRoot', String.raw`https\://example.com/a.png`, 'daily/note.md'))
      .resolves.toEqual([]);

    await expect(resolveNotesRootAssetPathCandidates('/notesRoot', String.raw`img\:assets/a.png`, 'daily/note.md'))
      .resolves.toEqual([]);

    await expect(resolveNotesRootAssetPathCandidates('/notesRoot', String.raw`data\:image/png;base64,aGk=`, 'daily/note.md'))
      .resolves.toEqual([]);

    await expect(resolveNotesRootAssetPathCandidates('/notesRoot', '//example.com/a.png', 'daily/note.md'))
      .resolves.toEqual([]);

    await expect(resolveNotesRootAssetPathCandidates('/notesRoot', '\\\\server\\share\\a.png', 'daily/note.md'))
      .resolves.toEqual([]);

    await expect(resolveNotesRootAssetPathCandidates('/notesRoot', 'assets/\u202Ecod.exe.png', 'daily/note.md'))
      .resolves.toEqual([]);

    await expect(resolveNotesRootAssetPathCandidates('/notesRoot', `${'a'.repeat(16 * 1024)}.png`, 'daily/note.md'))
      .resolves.toEqual([]);

    await expect(resolveNotesRootAssetPathCandidates('/notesRoot', `assets/a.png?${'x'.repeat(16 * 1024)}`, 'daily/note.md'))
      .resolves.toEqual([]);

    await expect(resolveNotesRootAssetPathCandidates('/notesRoot', 'https%3A%2F%2Fexample.com%2Fa.png', 'daily/note.md'))
      .resolves.toEqual([]);

    await expect(resolveNotesRootAssetPathCandidates('/notesRoot', '%2Fetc%2Fpasswd', 'daily/note.md'))
      .resolves.toEqual([]);

    await expect(resolveNotesRootAssetPathCandidates('/notesRoot', '%E0%A4%A', 'daily/note.md'))
      .resolves.toEqual([]);
  });

  it('keeps URL-encoded parent traversal inside the notesRoot root', async () => {
    await expect(resolveNotesRootAssetPathCandidates('/notesRoot', '%2e%2e/assets/a.png', 'daily/note.md'))
      .resolves.toEqual(['/notesRoot/assets/a.png']);

    await expect(resolveNotesRootAssetPathCandidates('/notesRoot', '%2e%2e/%2e%2e/secret.png', 'daily/note.md'))
      .resolves.toEqual([]);
  });

  it('rejects windows parent traversal outside the notesRoot root', async () => {
    await expect(resolveNotesRootAssetPathCandidates('C:\\notesRoot', '..\\..\\secret.png', 'daily\\note.md'))
      .resolves.toEqual([]);
  });

  it('resolves explicit relative assets beside an absolute external note even when a opened folder path is provided', async () => {
    await expect(resolveNotesRootAssetPathCandidates('/notesRoot', './assets/a.png', '/outside/note.md'))
      .resolves.toEqual(['/outside/assets/a.png']);
  });

  it('keeps a notesRoot fallback for bare assets from an absolute external note', async () => {
    await expect(resolveNotesRootAssetPathCandidates('/notesRoot', 'assets/a.png', '/outside/note.md'))
      .resolves.toEqual([
        '/outside/assets/a.png',
        '/notesRoot/assets/a.png',
      ]);
  });

  it('rejects explicit relative assets that escape an absolute external note directory', async () => {
    await expect(resolveNotesRootAssetPathCandidates('/notesRoot', '../secret.png', '/outside/note.md'))
      .resolves.toEqual([]);
  });

  it('keeps opened-folder containment for absolute note paths that are still inside the notesRoot', async () => {
    await expect(resolveNotesRootAssetPathCandidates('/notesRoot', '../assets/a.png', '/notesRoot/daily/note.md'))
      .resolves.toEqual(['/notesRoot/assets/a.png']);
  });
});

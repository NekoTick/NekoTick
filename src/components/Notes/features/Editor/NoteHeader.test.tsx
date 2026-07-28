import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NoteHeader } from './NoteHeader';
import { clearDisplayIconSnapshotCacheForTests } from '@/hooks/useTitleSync';

const mocks = vi.hoisted(() => {
  const addToast = vi.fn();
  const loadAssets = vi.fn();
  const resolveCoverAssetUrl = vi.fn();
  const uploadAsset = vi.fn();
  const notesState = {
    currentNote: { path: 'notes/demo.md', content: '# Demo' },
    setNoteIcon: vi.fn(),
    setNoteIconSize: vi.fn(),
    isNewlyCreated: false,
    noteMetadata: { notes: {} },
    draftNotes: {},
    notesPath: '/notesRoot',
    assetList: [
      {
        filename: 'assets/logo.png',
        hash: '',
        size: 128,
        mimeType: 'image/png',
        uploadedAt: '2026-05-12T10:51:54.912Z',
      },
    ],
    loadAssets,
    uploadAsset,
    noteIconSize: 60,
    getDisplayName: vi.fn(() => 'Demo'),
  };

  return {
    heroProps: null as any,
    addToast,
    loadAssets,
    notesState,
    resolveCoverAssetUrl,
    uploadAsset,
  };
});

vi.mock('@/stores/useNotesStore', () => ({
  useNotesStore: (selector: (state: typeof mocks.notesState) => unknown) => selector(mocks.notesState),
}));

vi.mock('@/stores/useToastStore', () => ({
  useToastStore: (selector: (state: { addToast: typeof mocks.addToast }) => unknown) => selector({
    addToast: mocks.addToast,
  }),
}));

vi.mock('@/components/common/HeroIconHeader', () => ({
  HeroIconHeader: (props: any) => {
    mocks.heroProps = props;
    return <div data-testid="hero-icon-header" />;
  },
}));

vi.mock('@/components/common/UniversalIconPicker/randomEmoji', () => ({
  getRandomHeaderEmoji: () => 'misc.star',
}));

vi.mock('../Cover/utils/resolveCoverAssetUrl', () => ({
  resolveCoverAssetUrl: mocks.resolveCoverAssetUrl,
}));

describe('NoteHeader', () => {
  beforeEach(() => {
    mocks.heroProps = null;
    mocks.notesState.currentNote = { path: 'notes/demo.md', content: '# Demo' };
    mocks.notesState.noteMetadata = { notes: {} };
    mocks.notesState.noteIconSize = 60;
    mocks.notesState.draftNotes = {};
    mocks.notesState.notesPath = '/notesRoot';
    clearDisplayIconSnapshotCacheForTests();
    mocks.addToast.mockReset();
    mocks.loadAssets.mockReset();
    mocks.loadAssets.mockResolvedValue(undefined);
    mocks.resolveCoverAssetUrl.mockReset();
    mocks.resolveCoverAssetUrl.mockResolvedValue('blob:logo');
    mocks.uploadAsset.mockReset();
    mocks.uploadAsset.mockResolvedValue({
      success: true,
      path: 'assets/uploaded-logo.png',
      isDuplicate: false,
    });
  });

  it('uses the note asset library for header icon images', async () => {
    render(<NoteHeader coverUrl={null} onAddCover={vi.fn()} />);

    expect(mocks.heroProps.customIcons).toEqual([
      {
        id: 'assets/logo.png',
        url: 'assets/logo.png',
        name: 'logo.png',
        createdAt: Date.parse('2026-05-12T10:51:54.912Z'),
      },
    ]);

    await mocks.heroProps.onIconPickerOpen();
    expect(mocks.loadAssets).toHaveBeenCalledWith('/notesRoot');

    const file = new File(['logo'], 'logo.png', { type: 'image/png' });
    await expect(mocks.heroProps.onUploadFile(file)).resolves.toEqual({
      success: true,
      url: 'assets/uploaded-logo.png',
    });
    expect(mocks.uploadAsset).toHaveBeenCalledWith(file, 'notes/demo.md');

    await expect(mocks.heroProps.imageLoader('assets/logo.png')).resolves.toBe('blob:logo');
    expect(mocks.resolveCoverAssetUrl).toHaveBeenCalledWith({
      assetPath: 'assets/logo.png',
      notesRootPath: '/notesRoot',
      currentNotePath: 'notes/demo.md',
      replayAnimated: true,
      animatedPlaybackKey: 'notes/demo.md',
    });
  });

  it('reports a failed icon library refresh instead of presenting stale assets silently', async () => {
    mocks.loadAssets.mockRejectedValue(new Error('Failed to load asset library'));
    render(<NoteHeader coverUrl={null} onAddCover={vi.fn()} />);

    await mocks.heroProps.onIconPickerOpen();

    expect(mocks.addToast).toHaveBeenCalledWith(
      'Could not load the image library',
      'error',
      expect.any(Number),
    );
  });

  it('uses current markdown frontmatter while note icon metadata is not loaded yet', () => {
    mocks.notesState.currentNote = {
      path: 'notes/demo.md',
      content: [
        '---',
        'vlaina_icon: "icon:common.sparkle:#ffcc00" size=84',
        '---',
        '# Demo',
      ].join('\n'),
    };
    mocks.notesState.noteMetadata = { notes: {} };

    render(<NoteHeader coverUrl={null} onAddCover={vi.fn()} />);

    expect(mocks.heroProps.icon).toBe('icon:common.sparkle:#ffcc00');
    expect(mocks.heroProps.iconSize).toBe(84);
  });

  it('does not restore a removed icon from frontmatter after metadata explicitly loaded the note', () => {
    mocks.notesState.currentNote = {
      path: 'notes/demo.md',
      content: [
        '---',
        'vlaina_icon: "icon:common.sparkle:#ffcc00" size=84',
        '---',
        '# Demo',
      ].join('\n'),
    };
    mocks.notesState.noteMetadata = {
      notes: {
        'notes/demo.md': {},
      },
    };

    render(<NoteHeader coverUrl={null} onAddCover={vi.fn()} />);

    expect(mocks.heroProps.icon).toBeNull();
    expect(mocks.heroProps.iconSize).toBe(60);
  });

  it('keeps the last loaded icon while a metadata refresh temporarily omits the note entry', () => {
    mocks.notesState.noteMetadata = {
      notes: {
        'notes/demo.md': { icon: '🌲', iconSize: 72 },
      },
    };

    const { rerender } = render(<NoteHeader coverUrl={null} onAddCover={vi.fn()} />);

    expect(mocks.heroProps.icon).toBe('🌲');

    mocks.notesState.noteMetadata = { notes: {} };
    rerender(<NoteHeader coverUrl={null} onAddCover={vi.fn()} />);

    expect(mocks.heroProps.icon).toBe('🌲');
  });
});

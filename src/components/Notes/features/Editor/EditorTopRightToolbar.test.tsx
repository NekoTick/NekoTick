import { createRef } from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorTopRightToolbar } from './EditorTopRightToolbar';
import type { NoteEditorFindController } from './find';
import { MENU_PANEL_CLASS_NAME } from '@/components/layout/sidebar/context-menu/shared';

const mocks = vi.hoisted(() => ({
  addToast: vi.fn(),
  backlinks: [] as { path: string; name: string; context: string }[],
  currentNote: null as { path: string; content: string } | null,
  dropdownMenuCloseAutoFocus: undefined as undefined | ((event: { preventDefault: () => void }) => void),
  exportNote: vi.fn(),
  flushCurrentPendingEditorMarkdown: vi.fn(),
  getBacklinks: vi.fn(() => [] as { path: string; name: string; context: string }[]),
  lastCloseAutoFocusPreventDefault: vi.fn(),
  notesChatPanelCollapsed: true,
  notesChatFloatingOpen: false,
  languagePreference: 'en',
  setNotesChatPanelCollapsed: vi.fn(),
  setNotesChatFloatingOpen: vi.fn(),
  setLanguagePreference: vi.fn(),
  preloadEmbeddedChatViewModule: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/components/Notes/notesViewLazyComponents', () => ({
  preloadEmbeddedChatViewModule: mocks.preloadEmbeddedChatViewModule,
}));

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({
    align,
    children,
    className,
    onCloseAutoFocus,
    sideOffset,
    ...props
  }: {
    align?: string;
    children?: React.ReactNode;
    className?: string;
    onCloseAutoFocus?: (event: { preventDefault: () => void }) => void;
    sideOffset?: number;
  }) => {
    mocks.dropdownMenuCloseAutoFocus = onCloseAutoFocus;
    return <div data-testid="note-menu-content" className={className} {...props}>{children}</div>;
  },
  DropdownMenuItem: ({
    children,
    className,
    onSelect,
    ...props
  }: {
    children?: React.ReactNode;
    className?: string;
    onSelect?: () => void;
  } & React.ComponentProps<'button'>) => (
    <button
      type="button"
      role="menuitem"
      className={className}
      {...props}
      onClick={() => {
        onSelect?.();
        mocks.dropdownMenuCloseAutoFocus?.({ preventDefault: mocks.lastCloseAutoFocusPreventDefault });
      }}
    >
      {children}
    </button>
  ),
  DropdownMenuSub: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSubContent: ({ children, className, ...props }: { children?: React.ReactNode; className?: string }) => (
    <div data-testid="note-export-menu-content" className={className} {...props}>{children}</div>
  ),
  DropdownMenuSubTrigger: ({
    children,
    className,
    ...props
  }: {
    children?: React.ReactNode;
    className?: string;
  } & React.ComponentProps<'div'>) => (
    <div role="menuitem" className={className} {...props}>{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: React.ComponentProps<'button'> & { asChild?: boolean }) => <>{children}</>,
}));

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div role="tooltip">{children}</div>
  ),
}));

vi.mock('@/components/ui/icons', () => ({
  Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}));

vi.mock('@/stores/useNotesStore', () => ({
  useNotesStore: Object.assign(
    (selector: (state: { currentNote: typeof mocks.currentNote }) => unknown) =>
      selector({ currentNote: mocks.currentNote }),
    {
      getState: () => ({
        currentNote: mocks.currentNote,
        noteContentsCache: new Map(
          mocks.currentNote ? [[mocks.currentNote.path, { content: mocks.currentNote.content }]] : [],
        ),
        isDirty: false,
        openTabs: mocks.currentNote ? [{ path: mocks.currentNote.path, name: 'Current', isDirty: false }] : [],
      }),
    },
  ),
}));

vi.mock('@/stores/notes/useNotesStore', () => ({
  useNotesStore: Object.assign(
    (selector: (state: {
      currentNote: typeof mocks.currentNote;
      getBacklinks: () => typeof mocks.backlinks;
      noteContentsCache: Map<string, { content: string }>;
      noteContentsCacheRevision: number;
    }) => unknown) =>
      selector({
        currentNote: mocks.currentNote,
        getBacklinks: mocks.getBacklinks,
        noteContentsCache: new Map(
          mocks.currentNote ? [[mocks.currentNote.path, { content: mocks.currentNote.content }]] : [],
        ),
        noteContentsCacheRevision: 1,
      }),
    {
      getState: () => ({
        currentNote: mocks.currentNote,
        getBacklinks: mocks.getBacklinks,
        noteContentsCache: new Map(
          mocks.currentNote ? [[mocks.currentNote.path, { content: mocks.currentNote.content }]] : [],
        ),
        noteContentsCacheRevision: 1,
        isDirty: false,
        openTabs: mocks.currentNote ? [{ path: mocks.currentNote.path, name: 'Current', isDirty: false }] : [],
      }),
    },
  ),
}));

vi.mock('@/stores/useToastStore', () => ({
  useToastStore: (selector: (state: { addToast: typeof mocks.addToast }) => unknown) =>
    selector({ addToast: mocks.addToast }),
}));

vi.mock('@/stores/uiSlice', () => ({
  useUIStore: (selector: (state: {
    notesChatPanelCollapsed: boolean;
    notesChatFloatingOpen: boolean;
    languagePreference: string;
    setNotesChatPanelCollapsed: typeof mocks.setNotesChatPanelCollapsed;
    setNotesChatFloatingOpen: typeof mocks.setNotesChatFloatingOpen;
    setLanguagePreference: typeof mocks.setLanguagePreference;
  }) => unknown) =>
    selector({
      notesChatPanelCollapsed: mocks.notesChatPanelCollapsed,
      notesChatFloatingOpen: mocks.notesChatFloatingOpen,
      languagePreference: mocks.languagePreference,
      setNotesChatPanelCollapsed: mocks.setNotesChatPanelCollapsed,
      setNotesChatFloatingOpen: mocks.setNotesChatFloatingOpen,
      setLanguagePreference: mocks.setLanguagePreference,
    }),
}));

vi.mock('@/stores/notes/pendingEditorMarkdownFlusher', () => ({
  flushCurrentPendingEditorMarkdown: mocks.flushCurrentPendingEditorMarkdown,
}));

vi.mock('../Export/BatchNoteExportDialog', () => ({
  BatchNoteExportDialog: ({
    currentNotePath,
    open,
  }: {
    currentNotePath?: string | null;
    open: boolean;
  }) => open ? <div data-testid="batch-note-export-dialog" data-note-path={currentNotePath} /> : null,
}));

vi.mock('../Export', () => ({
  exportNote: mocks.exportNote,
}));

vi.mock('./find', () => ({
  NoteEditorFindBar: () => <div data-testid="find-bar" />,
}));

vi.mock('./EditorOutlineRail', () => ({
  EditorOutlineRail: ({ enabled }: { enabled: boolean }) => (
    enabled ? <button type="button" data-testid="outline-toolbar-button">Outline</button> : null
  ),
}));

function createEditorFindController(
  overrides: Partial<NoteEditorFindController> = {},
): NoteEditorFindController {
  return {
    isOpen: false,
    isReplaceOpen: false,
    query: '',
    replaceValue: '',
    activeMatchNumber: 0,
    totalMatches: 0,
    canNavigate: false,
    canReplace: false,
    inputRef: createRef<HTMLInputElement | null>(),
    replaceInputRef: createRef<HTMLInputElement | null>(),
    setQuery: vi.fn(),
    setReplaceValue: vi.fn(),
    open: vi.fn(),
    close: vi.fn(),
    goToPrevious: vi.fn(),
    goToNext: vi.fn(),
    toggleReplace: vi.fn(),
    replaceCurrent: vi.fn(),
    replaceAll: vi.fn(),
    handleQueryKeyDown: vi.fn(),
    handleReplaceKeyDown: vi.fn(),
    handleQueryCompositionStart: vi.fn(),
    handleQueryCompositionEnd: vi.fn(),
    handleReplaceCompositionStart: vi.fn(),
    handleReplaceCompositionEnd: vi.fn(),
    ...overrides,
  };
}

describe('EditorTopRightToolbar', () => {
  beforeEach(() => {
    mocks.addToast.mockReset();
    mocks.backlinks = [];
    mocks.currentNote = null;
    mocks.dropdownMenuCloseAutoFocus = undefined;
    mocks.exportNote.mockReset();
    mocks.flushCurrentPendingEditorMarkdown.mockReset();
    mocks.getBacklinks.mockReset();
    mocks.getBacklinks.mockImplementation(() => mocks.backlinks);
    mocks.lastCloseAutoFocusPreventDefault.mockReset();
    mocks.languagePreference = 'en';
    mocks.notesChatPanelCollapsed = true;
    mocks.notesChatFloatingOpen = false;
    mocks.setNotesChatPanelCollapsed.mockReset();
    mocks.setNotesChatFloatingOpen.mockReset();
    mocks.preloadEmbeddedChatViewModule.mockClear();
  });

  function openMoreMenu(getByRole: ReturnType<typeof render>['getByRole']) {
    fireEvent.click(getByRole('button', { name: /More|更多/ }));
  }

  function openExportMenu(getByRole: ReturnType<typeof render>['getByRole']) {
    fireEvent.mouseEnter(getByRole('menuitem', { name: 'Export' }));
  }

  it('shows the current note backlink count below the character count', () => {
    mocks.currentNote = { path: 'alpha.md', content: 'Alpha note' };
    mocks.backlinks = [
      { path: 'one.md', name: 'One', context: '[[Alpha]]' },
      { path: 'two.md', name: 'Two', context: 'See [[Alpha]]' },
    ];
    const { getByRole, getByText } = render(
      <EditorTopRightToolbar
        editorFind={createEditorFindController()}
        currentNotePath="alpha.md"
        currentNoteTitle="Alpha"
        getCurrentNoteContent={() => 'Alpha note'}
        notesPath="/notesRoot"
        starred={false}
        toggleStarred={vi.fn()}
        currentNoteMetadata={undefined}
      />,
    );

    openMoreMenu(getByRole);

    const charactersLabel = getByText('Characters:');
    const backlinksLabel = getByText('Backlinks:');
    expect(charactersLabel.nextElementSibling).toHaveTextContent('10');
    expect(backlinksLabel.nextElementSibling).toHaveTextContent('2');
    expect(charactersLabel.compareDocumentPosition(backlinksLabel) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
  });

  it('preloads the current note backlinks when the more button is hovered', () => {
    mocks.currentNote = { path: 'alpha.md', content: 'Alpha note' };
    const { getByRole } = render(
      <EditorTopRightToolbar
        editorFind={createEditorFindController()}
        currentNotePath="alpha.md"
        currentNoteTitle="Alpha"
        getCurrentNoteContent={() => 'Alpha note'}
        notesPath="/notesRoot"
        starred={false}
        toggleStarred={vi.fn()}
        currentNoteMetadata={undefined}
      />,
    );
    mocks.getBacklinks.mockClear();

    const moreButton = getByRole('button', { name: 'More' });
    fireEvent.pointerEnter(moreButton);
    fireEvent.pointerEnter(moreButton);

    expect(mocks.getBacklinks).toHaveBeenCalledWith('alpha.md');
    expect(mocks.getBacklinks).toHaveBeenCalledTimes(1);
  });

  it('marks toolbar chrome and export menus as ignored by editor blank-area pointer handling', () => {
    const { container, getByRole, getByTestId } = render(
      <EditorTopRightToolbar
        editorFind={createEditorFindController()}
        currentNotePath="alpha.md"
        currentNoteTitle="Alpha"
        getCurrentNoteContent={() => '# Alpha'}
        notesPath="/notesRoot"
        starred={false}
        toggleStarred={vi.fn()}
        currentNoteMetadata={undefined}
      />,
    );

    openMoreMenu(getByRole);
    openExportMenu(getByRole);
    expect(container.firstElementChild).toHaveAttribute('data-no-editor-drag-box', 'true');
    expect(container.firstElementChild).toHaveClass('translate-x-[var(--vlaina-window-resize-compensation-x)]');
    expect(getByTestId('note-menu-content')).toHaveAttribute('data-no-editor-drag-box', 'true');
    expect(getByTestId('note-export-menu-content')).toHaveAttribute('data-no-editor-drag-box', 'true');
  });

  it('places the outline control immediately before the favorite action', () => {
    const { getByRole, getByTestId } = render(
      <EditorTopRightToolbar
        editorFind={createEditorFindController()}
        currentNotePath="alpha.md"
        currentNoteTitle="Alpha"
        getCurrentNoteContent={() => '# Alpha'}
        notesPath="/notesRoot"
        starred={false}
        toggleStarred={vi.fn()}
        currentNoteMetadata={undefined}
        showOutline
      />,
    );

    const outlineButton = getByTestId('outline-toolbar-button');
    const favoriteButton = getByRole('button', { name: 'Add Star' });
    expect(outlineButton.compareDocumentPosition(favoriteButton) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
  });

  it('shows the remove-star button for starred external notes outside the opened folder', () => {
    const toggleStarred = vi.fn();
    const { getByRole } = render(
      <EditorTopRightToolbar
        editorFind={createEditorFindController()}
        currentNotePath="/other/docs/alpha.md"
        currentNoteTitle="Alpha"
        getCurrentNoteContent={() => '# Alpha'}
        notesPath="/notesRoot"
        starred
        toggleStarred={toggleStarred}
        currentNoteMetadata={undefined}
      />,
    );

    fireEvent.click(getByRole('button', { name: 'Unfavorite' }));

    expect(toggleStarred).toHaveBeenCalledWith('/other/docs/alpha.md');
  });

  it('shows the add-star button for unstarred external notes outside the opened folder', () => {
    const toggleStarred = vi.fn();
    const { getByRole } = render(
      <EditorTopRightToolbar
        editorFind={createEditorFindController()}
        currentNotePath="/other/docs/alpha.md"
        currentNoteTitle="Alpha"
        getCurrentNoteContent={() => '# Alpha'}
        notesPath="/notesRoot"
        starred={false}
        toggleStarred={toggleStarred}
        currentNoteMetadata={undefined}
      />,
    );

    fireEvent.click(getByRole('button', { name: 'Add Star' }));

    expect(toggleStarred).toHaveBeenCalledWith('/other/docs/alpha.md');
  });

  it('keeps single-note formats in the export submenu', async () => {
    mocks.currentNote = {
      path: 'old.md',
      content: '# Old',
    };
    mocks.exportNote.mockResolvedValue({ canceled: false });
    const { getByRole } = render(
      <EditorTopRightToolbar
        editorFind={createEditorFindController()}
        currentNotePath="docs/current.md"
        currentNoteTitle="Current"
        getCurrentNoteContent={() => '# Current'}
        notesPath="/notesRoot"
        starred={false}
        toggleStarred={vi.fn()}
        currentNoteMetadata={undefined}
      />,
    );

    openMoreMenu(getByRole);
    openExportMenu(getByRole);
    fireEvent.click(getByRole('menuitem', { name: 'HTML' }));

    await waitFor(() => {
      expect(mocks.exportNote).toHaveBeenCalledWith({
        format: 'html',
        markdown: '# Current',
        notePath: 'docs/current.md',
        notesPath: '/notesRoot',
        title: 'Current',
      });
    });
    expect(mocks.flushCurrentPendingEditorMarkdown).toHaveBeenCalledTimes(1);
  });

  it('opens batch export only from the export submenu batch action', () => {
    const { getByRole, getByTestId, queryByTestId } = render(
      <EditorTopRightToolbar
        editorFind={createEditorFindController()}
        currentNotePath="docs/current.md"
        currentNoteTitle="Current"
        getCurrentNoteContent={() => '# Current'}
        notesPath="/notesRoot"
        starred={false}
        toggleStarred={vi.fn()}
        currentNoteMetadata={undefined}
      />,
    );

    openMoreMenu(getByRole);
    openExportMenu(getByRole);
    expect(queryByTestId('batch-note-export-dialog')).not.toBeInTheDocument();
    fireEvent.click(getByRole('menuitem', { name: 'Batch export' }));

    expect(getByTestId('batch-note-export-dialog')).toHaveAttribute('data-note-path', 'docs/current.md');
    expect(mocks.flushCurrentPendingEditorMarkdown).toHaveBeenCalledTimes(1);
  });

  it('does not read full note content while rendering the toolbar', () => {
    const getCurrentNoteContent = vi.fn(() => '# Current');

    render(
      <EditorTopRightToolbar
        editorFind={createEditorFindController()}
        currentNotePath="docs/current.md"
        currentNoteTitle="Current"
        getCurrentNoteContent={getCurrentNoteContent}
        notesPath="/notesRoot"
        starred={false}
        toggleStarred={vi.fn()}
        currentNoteMetadata={undefined}
      />,
    );

    expect(getCurrentNoteContent).not.toHaveBeenCalled();
  });

  it('matches the idle toolbar action color to the Git title bar action', () => {
    const { getByRole } = render(
      <EditorTopRightToolbar
        editorFind={createEditorFindController()}
        currentNotePath="docs/current.md"
        currentNoteTitle="Current"
        getCurrentNoteContent={() => '# Current'}
        notesPath="/notesRoot"
        starred={false}
        toggleStarred={vi.fn()}
        currentNoteMetadata={undefined}
      />,
    );

    expect(getByRole('button', { name: 'Add Star' })).toHaveClass(
      'text-[var(--vlaina-color-titlebar-button)]',
    );
    expect(getByRole('button', { name: 'Right Chat' })).toHaveClass(
      'text-[var(--vlaina-color-titlebar-button)]',
    );
    expect(getByRole('button', { name: 'More' })).toHaveClass(
      'text-[var(--vlaina-color-titlebar-button)]',
    );
  });

  it.each([
    'Add Star',
    'Right Chat',
    'More',
  ])('provides the localized hover label for %s', (label) => {
    const { getAllByRole } = render(
      <EditorTopRightToolbar
        editorFind={createEditorFindController()}
        currentNotePath="docs/current.md"
        currentNoteTitle="Current"
        getCurrentNoteContent={() => '# Current'}
        notesPath="/notesRoot"
        starred={false}
        toggleStarred={vi.fn()}
        currentNoteMetadata={undefined}
      />,
    );
    expect(getAllByRole('tooltip').some((tooltip) => tooltip.textContent === label)).toBe(true);
  });

  it('opens the right Chat floating panel from the toolbar action and removes it from the note menu', () => {
    const { container, getByRole, getByTestId } = render(
      <EditorTopRightToolbar
        editorFind={createEditorFindController()}
        currentNotePath="docs/current.md"
        currentNoteTitle="Current"
        getCurrentNoteContent={() => '# Current'}
        notesPath="/notesRoot"
        starred={false}
        toggleStarred={vi.fn()}
        currentNoteMetadata={undefined}
      />,
    );

    fireEvent.click(getByRole('button', { name: 'Right Chat' }));
    openMoreMenu(getByRole);

    const toolbarIcons = Array.from(container.querySelectorAll('[data-icon]')).map((icon) => icon.getAttribute('data-icon'));
    expect(toolbarIcons.slice(0, 3)).toEqual(['misc.star', 'common.shootingStar', 'common.more']);
    expect(getByTestId('note-menu-content')).not.toHaveTextContent('Right Chat');
    expect(mocks.setNotesChatFloatingOpen).toHaveBeenCalledWith(true);
    expect(mocks.setNotesChatPanelCollapsed).not.toHaveBeenCalled();
  });

  it('preloads the right Chat view when the toolbar action is hovered', () => {
    const { getByRole } = render(
      <EditorTopRightToolbar
        editorFind={createEditorFindController()}
        currentNotePath="docs/current.md"
        currentNoteTitle="Current"
        getCurrentNoteContent={() => '# Current'}
        notesPath="/notesRoot"
        starred={false}
        toggleStarred={vi.fn()}
        currentNoteMetadata={undefined}
      />,
    );

    fireEvent.pointerEnter(getByRole('button', { name: 'Right Chat' }));

    expect(mocks.preloadEmbeddedChatViewModule).toHaveBeenCalledTimes(1);
  });

  it('hides the right Chat toolbar action while the panel is open', () => {
    mocks.notesChatPanelCollapsed = false;

    const { container, queryByRole } = render(
      <EditorTopRightToolbar
        editorFind={createEditorFindController()}
        currentNotePath="docs/current.md"
        currentNoteTitle="Current"
        getCurrentNoteContent={() => '# Current'}
        notesPath="/notesRoot"
        starred={false}
        toggleStarred={vi.fn()}
        currentNoteMetadata={undefined}
      />,
    );

    const toolbarIcons = Array.from(container.querySelectorAll('[data-icon]')).map((icon) => icon.getAttribute('data-icon'));
    expect(queryByRole('button', { name: 'Right Chat' })).not.toBeInTheDocument();
    expect(toolbarIcons.slice(0, 2)).toEqual(['misc.star', 'common.more']);
  });

  it('hides the right Chat toolbar action while the floating panel is open', () => {
    mocks.notesChatFloatingOpen = true;

    const { container, queryByRole } = render(
      <EditorTopRightToolbar
        editorFind={createEditorFindController()}
        currentNotePath="docs/current.md"
        currentNoteTitle="Current"
        getCurrentNoteContent={() => '# Current'}
        notesPath="/notesRoot"
        starred={false}
        toggleStarred={vi.fn()}
        currentNoteMetadata={undefined}
      />,
    );

    const toolbarIcons = Array.from(container.querySelectorAll('[data-icon]')).map((icon) => icon.getAttribute('data-icon'));
    expect(queryByRole('button', { name: 'Right Chat' })).not.toBeInTheDocument();
    expect(toolbarIcons.slice(0, 2)).toEqual(['misc.star', 'common.more']);
  });

  it('uses the sidebar context menu surface for note info and export menus', () => {
    const { getByRole, getByTestId } = render(
      <EditorTopRightToolbar
        editorFind={createEditorFindController()}
        currentNotePath="docs/current.md"
        currentNoteTitle="Current"
        getCurrentNoteContent={() => '# Current'}
        notesPath="/notesRoot"
        starred={false}
        toggleStarred={vi.fn()}
        currentNoteMetadata={undefined}
      />,
    );

    openMoreMenu(getByRole);
    openExportMenu(getByRole);
    expect(getByTestId('note-menu-content').className).toContain(MENU_PANEL_CLASS_NAME);
    expect(getByTestId('note-menu-content').className).toContain('sidebar-menu-surface');
    expect(getByTestId('note-export-menu-content')).toHaveAttribute('data-no-editor-drag-box', 'true');
  });

  it('localizes and toggles source mode from the more menu action', () => {
    const onToggleSourceMode = vi.fn();
    mocks.languagePreference = 'zh-CN';
    const { container, getByRole } = render(
      <EditorTopRightToolbar
        editorFind={createEditorFindController()}
        currentNotePath="docs/current.md"
        currentNoteTitle="Current"
        getCurrentNoteContent={() => '# Current'}
        isSourceMode
        onToggleSourceMode={onToggleSourceMode}
        notesPath="/notesRoot"
        starred={false}
        toggleStarred={vi.fn()}
        currentNoteMetadata={undefined}
      />,
    );

    const moreButton = getByRole('button', { name: '更多' });
    moreButton.focus();
    expect(moreButton).toHaveFocus();
    fireEvent.click(moreButton);
    const sourceMenuItem = getByRole('menuitem', { name: '渲染模式' });
    expect(container.querySelector('[data-icon="editor.code"]')).toBeInTheDocument();

    fireEvent.click(sourceMenuItem);

    expect(moreButton).toBeInTheDocument();
    expect(moreButton).not.toHaveFocus();
    expect(mocks.lastCloseAutoFocusPreventDefault).toHaveBeenCalledTimes(1);
    expect(onToggleSourceMode).toHaveBeenCalledTimes(1);
  });

  it('uses the sidebar selected surface for export previews', () => {
    const { getByRole } = render(
      <EditorTopRightToolbar
        editorFind={createEditorFindController()}
        currentNotePath="docs/current.md"
        currentNoteTitle="Current"
        getCurrentNoteContent={() => '# Current'}
        notesPath="/notesRoot"
        starred={false}
        toggleStarred={vi.fn()}
        currentNoteMetadata={undefined}
      />,
    );

    openMoreMenu(getByRole);

    const exportMenuItem = getByRole('menuitem', { name: 'Export' });
    expect(exportMenuItem.className).toContain('data-[state=open]:bg-[var(--vlaina-sidebar-notes-row-active)]');
    expect(exportMenuItem.className).toContain('data-[state=open]:text-[var(--vlaina-sidebar-row-selected-text)]');
  });
});

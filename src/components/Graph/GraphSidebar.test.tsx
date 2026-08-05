import type {
  ChangeEvent,
  KeyboardEventHandler,
  ReactNode,
  Ref,
  UIEventHandler,
} from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchSidebarOpenSearchEvent } from '@/components/layout/sidebar/sidebarEvents';
import { GraphSidebar } from './GraphSidebar';

const graphStore = vi.hoisted(() => ({
  mode: 'local' as 'all' | 'local',
  searchQuery: 'plan',
  selectedPath: 'Plan.md' as string | null,
  setMode: vi.fn(),
  setSearchQuery: vi.fn(),
  setSelectedPath: vi.fn(),
}));

const notesStore = vi.hoisted(() => ({
  currentNote: { path: 'Plan.md', content: '' },
  noteContentsCache: new Map([
    ['Plan.md', { content: '[[Product Plan]]', modifiedAt: 1 }],
    ['Product Plan.md', { content: '[[Planning]]', modifiedAt: 1 }],
    ['docs/Planning.md', { content: '', modifiedAt: 1 }],
  ]),
  noteContentsCacheRevision: 1,
  rootFolder: {
    id: '',
    name: 'Notes',
    path: '',
    isFolder: true,
    expanded: true,
    children: [
      { id: 'Plan.md', name: 'Plan.md', path: 'Plan.md', isFolder: false },
      { id: 'Product Plan.md', name: 'Product Plan.md', path: 'Product Plan.md', isFolder: false },
      { id: 'docs/Planning.md', name: 'Planning.md', path: 'docs/Planning.md', isFolder: false },
    ],
  },
}));

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, string | number>) => (
      values ? `${key}:${JSON.stringify(values)}` : key
    ),
  }),
}));

vi.mock('@/stores/notes/useNotesStore', () => ({
  useNotesStore: (selector: (state: typeof notesStore) => unknown) => selector(notesStore),
}));

vi.mock('./store/useGraphUIStore', () => ({
  useGraphUIStore: (selector: (state: typeof graphStore) => unknown) => selector(graphStore),
}));

vi.mock('@/components/layout/sidebar/AppViewModeSwitch', () => ({
  AppViewModeSwitch: () => <div />,
}));

vi.mock('@/components/layout/sidebar/SidebarPrimitives', () => ({
  SidebarActionGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SidebarCapsulePanel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SidebarList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SidebarScrollArea: ({
    children,
    onScroll,
    ref,
  }: {
    children: ReactNode;
    onScroll?: UIEventHandler<HTMLDivElement>;
    ref?: Ref<HTMLDivElement>;
  }) => <div ref={ref} data-testid="graph-scroll-root" onScroll={onScroll}>{children}</div>,
  SidebarSurface: ({
    children,
    ref,
  }: {
    children: ReactNode;
    ref?: Ref<HTMLDivElement>;
  }) => <div ref={ref}>{children}</div>,
  SidebarSearchField: ({
    'aria-label': ariaLabel,
    'aria-activedescendant': activeDescendant,
    'aria-controls': ariaControls,
    'aria-expanded': ariaExpanded,
    closeLabel,
    disabled,
    onChange,
    onClose,
    onKeyDown,
    placeholder,
    ref,
    role,
    value,
  }: {
    'aria-label': string;
    'aria-activedescendant'?: string;
    'aria-controls'?: string;
    'aria-expanded'?: boolean;
    closeLabel: string;
    disabled?: boolean;
    onChange: (event: ChangeEvent<HTMLInputElement>) => void;
    onClose: () => void;
    onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
    placeholder?: string;
    ref?: Ref<HTMLInputElement>;
    role?: string;
    value: string;
  }) => (
    <div>
      <input
        ref={ref}
        aria-label={ariaLabel}
        aria-activedescendant={activeDescendant}
        aria-controls={ariaControls}
        aria-expanded={ariaExpanded}
        disabled={disabled}
        placeholder={placeholder}
        role={role}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
      />
      <button type="button" onClick={onClose}>{closeLabel}</button>
    </div>
  ),
}));

describe('GraphSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    graphStore.mode = 'local';
    graphStore.searchQuery = 'plan';
    graphStore.selectedPath = 'Plan.md';
    notesStore.noteContentsCache = new Map([
      ['Plan.md', { content: '[[Product Plan]]', modifiedAt: 1 }],
      ['Product Plan.md', { content: '[[Planning]]', modifiedAt: 1 }],
      ['docs/Planning.md', { content: '', modifiedAt: 1 }],
    ]);
    notesStore.noteContentsCacheRevision = 1;
    notesStore.rootFolder.children = [
      { id: 'Plan.md', name: 'Plan.md', path: 'Plan.md', isFolder: false },
      { id: 'Product Plan.md', name: 'Product Plan.md', path: 'Product Plan.md', isFolder: false },
      { id: 'docs/Planning.md', name: 'Planning.md', path: 'docs/Planning.md', isFolder: false },
    ];
  });

  it('shows ranked search results wired to graph controls', () => {
    render(<GraphSidebar />);

    expect(screen.queryByText('app.viewGraph')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'graph.searchPlaceholder' })).not.toBeInTheDocument();
    expect(screen.getByText('graph.modeLocal')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('group', { name: 'app.viewGraph' })).toHaveClass('mt-1');
    expect(document.querySelector('[data-graph-summary="true"]')).toHaveTextContent('graph.summary:');
    expect(document.querySelector('[data-graph-mode-indicator="true"]')).toHaveClass(
      'left-1/2',
      'transition-[left]',
    );
    expect(screen.queryByRole('option', { name: 'Plan, Plan.md' })).not.toBeInTheDocument();

    act(() => dispatchSidebarOpenSearchEvent('graph'));

    const searchInput = screen.getByRole('combobox', { name: 'graph.searchPlaceholder' });
    expect(document.querySelector('[data-sidebar-search-drawer="true"]')).toHaveClass(
      'transition-opacity',
    );
    const modeSelector = screen.getByRole('group', { name: 'app.viewGraph' });
    expect(modeSelector).toHaveClass('mt-3');
    expect(searchInput.compareDocumentPosition(modeSelector) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const exactResult = screen.getByRole('option', { name: 'Plan, Plan.md' });
    const prefixResult = screen.getByRole('option', { name: 'Planning, docs/Planning.md' });
    const wordResult = screen.getByRole('option', { name: 'Product Plan, Product Plan.md' });
    expect(exactResult.compareDocumentPosition(prefixResult) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(prefixResult.compareDocumentPosition(wordResult) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(searchInput).toHaveAttribute('aria-controls', 'graph-search-results');
    expect(searchInput).toHaveAttribute('aria-activedescendant', 'graph-search-result-0');
    expect(exactResult).toHaveAttribute('tabindex', '-1');
    expect(exactResult).toHaveClass('min-h-[var(--vlaina-size-44px)]');

    fireEvent.keyDown(searchInput, { key: 'ArrowDown' });
    fireEvent.keyDown(searchInput, { key: 'Enter' });
    expect(graphStore.setSelectedPath).toHaveBeenCalledWith('docs/Planning.md');

    fireEvent.click(screen.getByRole('button', { name: 'graph.modeAll' }));
    expect(graphStore.setMode).toHaveBeenCalledWith('all');

    fireEvent.change(screen.getByRole('combobox', { name: 'graph.searchPlaceholder' }), {
      target: { value: 'product' },
    });
    expect(graphStore.setSearchQuery).toHaveBeenCalledWith('product');

    fireEvent.click(prefixResult);
    expect(graphStore.setSelectedPath).toHaveBeenCalledWith('docs/Planning.md');

    fireEvent.click(screen.getByRole('button', { name: 'graph.clearSearch' }));
    expect(graphStore.setSearchQuery).toHaveBeenCalledWith('');

    act(() => dispatchSidebarOpenSearchEvent('graph'));
    expect(searchInput.closest('.grid')).toHaveClass('grid-rows-[1fr]');
  });

  it('moves the selected background with the graph mode', () => {
    graphStore.mode = 'all';
    const view = render(<GraphSidebar />);
    const indicator = document.querySelector('[data-graph-mode-indicator="true"]');

    expect(indicator).toHaveClass('left-1');
    expect(indicator).not.toHaveClass('left-1/2');

    graphStore.mode = 'local';
    view.rerender(<GraphSidebar />);

    expect(indicator).toHaveClass('left-1/2', 'transition-[left]');
    expect(indicator).not.toHaveClass('left-1');
  });

  it('shows a clear empty state for a query with no matches', () => {
    graphStore.searchQuery = 'missing';
    render(<GraphSidebar />);

    act(() => dispatchSidebarOpenSearchEvent('graph'));

    expect(screen.getByText('graph.searchNoResults')).toBeInTheDocument();
  });

  it('marks local graph counts as lower bounds while link data is incomplete', () => {
    graphStore.searchQuery = '';
    notesStore.noteContentsCache = new Map([
      ['Plan.md', { content: '', modifiedAt: 1 }],
    ]);
    notesStore.noteContentsCacheRevision += 1;

    render(<GraphSidebar />);

    expect(document.querySelector('[data-graph-summary="true"]')).toHaveTextContent(
      'graph.summary:{"links":"0+","nodes":"1+"}',
    );
  });

  it('keeps search collapsed without a separate action button', () => {
    render(<GraphSidebar />);

    fireEvent.wheel(screen.getByTestId('graph-scroll-root'), { deltaY: -100 });

    expect(document.querySelector('[data-sidebar-search-drawer="true"]'))
      .toHaveAttribute('inert');
    expect(document.querySelector('[role="combobox"]')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'graph.searchPlaceholder' })).not.toBeInTheDocument();
  });

  it('finds and selects a note outside the graph render budget', () => {
    notesStore.rootFolder.children = Array.from({ length: 241 }, (_, index) => ({
      id: `Note ${index}.md`,
      name: `Note ${index}.md`,
      path: `Note ${index}.md`,
      isFolder: false,
    }));
    notesStore.noteContentsCache = new Map(
      notesStore.rootFolder.children.map((item) => [
        item.path,
        { content: '', modifiedAt: 1 },
      ]),
    );
    notesStore.noteContentsCacheRevision += 1;
    graphStore.searchQuery = 'Note 240';
    graphStore.selectedPath = null;
    render(<GraphSidebar />);

    act(() => dispatchSidebarOpenSearchEvent('graph'));
    fireEvent.click(screen.getByRole('option', { name: 'Note 240, Note 240.md' }));

    expect(graphStore.setSelectedPath).toHaveBeenCalledWith('Note 240.md');
  });

  it('disambiguates notes with the same title by path', () => {
    notesStore.rootFolder.children = [
      ...notesStore.rootFolder.children,
      { id: 'archive/Plan.md', name: 'Plan.md', path: 'archive/Plan.md', isFolder: false },
    ];
    notesStore.noteContentsCache = new Map([
      ...notesStore.noteContentsCache,
      ['archive/Plan.md', { content: '', modifiedAt: 1 }],
    ]);
    notesStore.noteContentsCacheRevision += 1;
    render(<GraphSidebar />);

    act(() => dispatchSidebarOpenSearchEvent('graph'));

    expect(screen.getByRole('option', { name: 'Plan, Plan.md' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Plan, archive/Plan.md' })).toBeInTheDocument();
  });
});

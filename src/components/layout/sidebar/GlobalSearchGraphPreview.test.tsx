import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GlobalSearchGraphPreviewButton,
  GlobalSearchLocalGraphPreview,
} from './GlobalSearchGraphPreview';

const notesState = vi.hoisted(() => ({
  rootFolder: {
    children: [
      { id: 'Alpha.md', name: 'Alpha.md', path: 'Alpha.md', isFolder: false as const },
      { id: 'Beta.md', name: 'Beta.md', path: 'Beta.md', isFolder: false as const },
      { id: 'Gamma.md', name: 'Gamma.md', path: 'Gamma.md', isFolder: false as const },
    ],
  },
  noteContentsCache: new Map([
    ['Alpha.md', { content: '[[Beta]]', modifiedAt: 1 }],
    ['Beta.md', { content: '[[Gamma]]', modifiedAt: 1 }],
    ['Gamma.md', { content: '', modifiedAt: 1 }],
  ]),
  noteContentsCacheRevision: 1,
}));

vi.mock('@/stores/notes/useNotesStore', () => ({
  useNotesStore: (selector: (state: typeof notesState) => unknown) => selector(notesState),
}));
vi.mock('@/components/Graph/hooks/useGraphCanvasSize', () => ({
  useGraphCanvasSize: () => ({ x: 360, y: 240 }),
}));
vi.mock('@/components/Graph/canvas/GraphCanvasScene', () => ({
  GraphCanvasScene: ({
    nodes,
    hoveredPath,
    maxVisibleLabels,
    selectedPath,
    showAllLabels,
  }: {
    nodes: Array<{ id: string }>;
    hoveredPath: string | null;
    maxVisibleLabels?: number;
    selectedPath: string;
    showAllLabels?: boolean;
  }) => (
    <g
      data-testid="graph-scene"
      data-nodes={nodes.map((node) => node.id).join(',')}
      data-hovered={hoveredPath}
      data-max-visible-labels={maxVisibleLabels}
      data-selected={selectedPath}
      data-show-all-labels={showAllLabels ? 'true' : 'false'}
    />
  ),
}));
vi.mock('@/components/ui/icons', () => ({
  Icon: ({ name }: { name: string }) => <span>{name}</span>,
}));
vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

describe('GlobalSearchGraphPreview', () => {
  beforeEach(() => {
    notesState.noteContentsCacheRevision += 1;
    notesState.rootFolder.children = [
      { id: 'Alpha.md', name: 'Alpha.md', path: 'Alpha.md', isFolder: false },
      { id: 'Beta.md', name: 'Beta.md', path: 'Beta.md', isFolder: false },
      { id: 'Gamma.md', name: 'Gamma.md', path: 'Gamma.md', isFolder: false },
    ];
    notesState.noteContentsCache = new Map([
      ['Alpha.md', { content: '[[Beta]]', modifiedAt: 1 }],
      ['Beta.md', { content: '[[Gamma]]', modifiedAt: 1 }],
      ['Gamma.md', { content: '', modifiedAt: 1 }],
    ]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the focused file and its immediate graph neighbors', () => {
    render(<GlobalSearchLocalGraphPreview focusPath="Alpha.md" />);

    const scene = screen.getByTestId('graph-scene');
    expect(scene).toHaveAttribute('data-selected', 'Alpha.md');
    expect(scene).toHaveAttribute('data-show-all-labels', 'true');
    expect(scene).toHaveAttribute('data-nodes', 'Alpha.md,Beta.md');
    expect(scene.getAttribute('data-nodes')).not.toContain('Gamma.md');
  });

  it('renders an unlinked Markdown file as one graph node', () => {
    render(<GlobalSearchLocalGraphPreview focusPath="Unlinked.md" />);

    expect(screen.getByTestId('graph-scene')).toHaveAttribute(
      'data-nodes',
      'Unlinked.md',
    );
  });

  it('lets dense local previews hide colliding branch labels', () => {
    const branchPaths = Array.from({ length: 11 }, (_, index) => `Branch-${index}.md`);
    notesState.rootFolder.children = [
      { id: 'Alpha.md', name: 'Alpha.md', path: 'Alpha.md', isFolder: false },
      ...branchPaths.map((path) => ({ id: path, name: path, path, isFolder: false as const })),
    ];
    notesState.noteContentsCache = new Map([
      ['Alpha.md', {
        content: branchPaths.map((path) => `[[${path}]]`).join('\n'),
        modifiedAt: 1,
      }],
      ...branchPaths.map((path) => [path, { content: '', modifiedAt: 1 }] as const),
    ]);

    render(<GlobalSearchLocalGraphPreview focusPath="Alpha.md" />);

    expect(screen.getByTestId('graph-scene')).toHaveAttribute('data-show-all-labels', 'false');
    expect(screen.getByTestId('graph-scene')).toHaveAttribute('data-max-visible-labels', '6');
  });

  it('opens the local preview on hover and navigates from its branches', async () => {
    const onOpenGraph = vi.fn();
    render(
      <GlobalSearchGraphPreviewButton focusPath="Alpha.md" onOpenGraph={onOpenGraph} />,
    );

    const button = screen.getByRole('button', { name: /app.viewGraph/ });
    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument());
    expect(screen.queryByTestId('graph-scene')).not.toBeInTheDocument();

    fireEvent.pointerEnter(button);
    expect(screen.getByTestId('graph-scene')).toHaveAttribute('data-selected', 'Alpha.md');
    expect(screen.getByRole('group', { name: 'app.viewGraph' }).closest('[data-slot="popover-content"]')).toHaveClass(
      '!bg-[var(--vlaina-color-pill-surface)]',
      'floating-popover-shadow',
      'rounded-[var(--vlaina-ui-radius-panel)]',
    );

    const betaTarget = document.querySelector('[data-graph-preview-target="Beta.md"]')!;
    expect(betaTarget).toHaveClass('outline-none');
    fireEvent.focus(betaTarget);
    expect(screen.getByTestId('graph-scene')).toHaveAttribute('data-hovered', 'Beta.md');
    fireEvent.click(betaTarget);
    expect(onOpenGraph).toHaveBeenCalledWith('Beta.md');

    fireEvent.click(button);
    expect(onOpenGraph).toHaveBeenCalledWith('Alpha.md');
  });

  it('keeps the graph button icon-only when there are no connections', () => {
    render(
      <GlobalSearchGraphPreviewButton focusPath="Unlinked.md" onOpenGraph={() => {}} />,
    );

    expect(screen.getByRole('button', { name: 'app.viewGraph' })).toHaveClass(
      'w-[var(--vlaina-size-36px)]',
    );
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('defers connection-count graph work until the browser is idle', () => {
    let idleCallback: (() => void) | null = null;
    vi.stubGlobal('requestIdleCallback', vi.fn((callback: () => void) => {
      idleCallback = callback;
      return 1;
    }));
    vi.stubGlobal('cancelIdleCallback', vi.fn());

    const view = render(
      <GlobalSearchGraphPreviewButton focusPath="Alpha.md" onOpenGraph={() => {}} />,
    );

    expect(screen.queryByText('1')).not.toBeInTheDocument();
    act(() => idleCallback?.());
    expect(screen.getByText('1')).toBeInTheDocument();

    view.unmount();
    expect(window.cancelIdleCallback).toHaveBeenCalledWith(1);
  });
});

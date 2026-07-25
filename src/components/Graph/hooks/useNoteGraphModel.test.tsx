import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useNoteGraphModel } from './useNoteGraphModel';

const state = vi.hoisted(() => ({
  currentNote: { path: 'Alpha.md', content: '' } as { path: string; content: string } | null,
  noteContentsCache: new Map([
    ['Alpha.md', { content: '[[Beta]]', modifiedAt: 1 }],
    ['Beta.md', { content: '', modifiedAt: 1 }],
  ]),
  noteContentsCacheRevision: 1,
  rootFolder: {
    children: [
      { id: 'Alpha.md', name: 'Alpha.md', path: 'Alpha.md', isFolder: false },
      { id: 'Beta.md', name: 'Beta.md', path: 'Beta.md', isFolder: false },
    ],
  },
}));

const graphState = vi.hoisted(() => ({
  mode: 'all' as const,
  selectedPath: null as string | null,
}));

vi.mock('@/stores/notes/useNotesStore', () => ({
  useNotesStore: (selector: (value: typeof state) => unknown) => selector(state),
}));

vi.mock('../store/useGraphUIStore', () => ({
  useGraphUIStore: (selector: (value: typeof graphState) => unknown) => selector(graphState),
}));

describe('useNoteGraphModel', () => {
  beforeEach(() => {
    graphState.selectedPath = null;
    state.currentNote = { path: 'Alpha.md', content: '' };
    state.noteContentsCache = new Map([
      ['Alpha.md', { content: '[[Beta]]', modifiedAt: 1 }],
      ['Beta.md', { content: '', modifiedAt: 1 }],
    ]);
    state.noteContentsCacheRevision = 1;
    state.rootFolder = {
      children: [
        { id: 'Alpha.md', name: 'Alpha.md', path: 'Alpha.md', isFolder: false },
        { id: 'Beta.md', name: 'Beta.md', path: 'Beta.md', isFolder: false },
      ],
    };
  });

  it('freezes the graph while inactive and refreshes it on activation', () => {
    const hook = renderHook(({ active }) => useNoteGraphModel(active), {
      initialProps: { active: true },
    });
    const activeGraph = hook.result.current.fullGraph;

    hook.rerender({ active: false });
    state.rootFolder = {
      children: [
        ...state.rootFolder.children,
        { id: 'Gamma.md', name: 'Gamma.md', path: 'Gamma.md', isFolder: false },
      ],
    };
    state.noteContentsCache = new Map([
      ...state.noteContentsCache,
      ['Gamma.md', { content: '', modifiedAt: 1 }],
    ]);
    state.noteContentsCacheRevision += 1;
    hook.rerender({ active: false });

    expect(hook.result.current.fullGraph).toBe(activeGraph);
    expect(hook.result.current.fullGraph.nodes).toHaveLength(2);

    hook.rerender({ active: true });

    expect(hook.result.current.fullGraph).not.toBe(activeGraph);
    expect(hook.result.current.fullGraph.nodes).toHaveLength(3);
  });

  it('keeps a selected path outside the render budget in the full graph', () => {
    state.rootFolder = {
      children: Array.from({ length: 241 }, (_, index) => ({
        id: `Note ${index}.md`,
        name: `Note ${index}.md`,
        path: `Note ${index}.md`,
        isFolder: false,
      })),
    };
    state.noteContentsCache = new Map();
    state.currentNote = { path: 'Note 000.md', content: '' };
    graphState.selectedPath = 'Note 240.md';

    const hook = renderHook(() => useNoteGraphModel(true, { includeSearchNodes: true }));

    expect(hook.result.current.fullGraph.nodes.map((node) => node.id))
      .toContain('Note 240.md');
    expect(hook.result.current.searchNodes).toHaveLength(241);
  });

  it('builds full-tree search nodes only while search is open', () => {
    const hook = renderHook(
      ({ includeSearchNodes }) => useNoteGraphModel(true, { includeSearchNodes }),
      { initialProps: { includeSearchNodes: false } },
    );

    expect(hook.result.current.searchNodes).toEqual([]);

    hook.rerender({ includeSearchNodes: true });
    expect(hook.result.current.searchNodes.map((node) => node.id)).toEqual([
      'Alpha.md',
      'Beta.md',
    ]);

    hook.rerender({ includeSearchNodes: false });
    expect(hook.result.current.searchNodes).toEqual([]);
  });
});

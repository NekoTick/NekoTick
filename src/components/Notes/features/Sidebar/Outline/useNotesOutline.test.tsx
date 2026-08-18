import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNotesOutline } from './useNotesOutline';
import type { EditorBlockPositionSnapshot } from '@/components/Notes/features/Editor/utils/editorBlockPositionCache';

const hoisted = vi.hoisted(() => ({
  currentSnapshot: null as EditorBlockPositionSnapshot | null,
  expandCollapsedHeading: vi.fn(() => false),
  materializeVirtualizedBlock: vi.fn(() => false),
  refreshSnapshot: vi.fn(() => null as EditorBlockPositionSnapshot | null),
}));

vi.mock('@/components/Notes/features/Editor/utils/editorBlockPositionCache', () => ({
  getCurrentEditorBlockPositionSnapshot: () => hoisted.currentSnapshot,
  refreshCurrentEditorBlockPositionSnapshot: hoisted.refreshSnapshot,
  subscribeCurrentEditorBlockPositionSnapshot: vi.fn(() => vi.fn()),
}));
vi.mock('@/components/Notes/features/Editor/plugins/heading/collapse', () => ({
  expandCollapsedHeadingSectionAtPos: hoisted.expandCollapsedHeading,
}));
vi.mock('@milkdown/kit/core', () => ({
  materializeVirtualizedBlockAtPos: hoisted.materializeVirtualizedBlock,
}));

function createRect(top: number, bottom = top + 24): DOMRect {
  return {
    x: 0,
    y: top,
    top,
    left: 0,
    bottom,
    right: 320,
    width: 320,
    height: bottom - top,
    toJSON: () => ({}),
  } as DOMRect;
}

function createOutlineSnapshot() {
  const scrollRoot = document.createElement('div');
  const editorRoot = document.createElement('div');
  const headingElement = document.createElement('h2');
  const scrollTo = vi.fn();
  const doc = {};
  const view = {
    dom: editorRoot,
    state: { doc },
  };

  headingElement.textContent = 'Target';
  editorRoot.append(headingElement);
  scrollRoot.append(editorRoot);
  document.body.append(scrollRoot);

  Object.defineProperty(scrollRoot, 'scrollTop', {
    configurable: true,
    value: 80,
  });
  scrollRoot.scrollTo = scrollTo;
  scrollRoot.getBoundingClientRect = vi.fn(() => createRect(40, 640));
  headingElement.getBoundingClientRect = vi.fn(() => createRect(260, 292));
  editorRoot.focus = vi.fn();

  hoisted.currentSnapshot = {
    version: 1,
    view,
    doc,
    editorRoot,
    scrollRoot,
    scrollLeft: 0,
    scrollTop: 80,
    geometryValidationScrollLeft: 0,
    geometryValidationScrollTop: 80,
    blocks: [],
    blockIndex: new Map(),
    headings: [{
      id: 'target-heading',
      level: 2,
      text: 'Target',
      from: 1,
      to: 8,
      element: headingElement,
      top: 300,
      bottom: 332,
    }],
  } as unknown as EditorBlockPositionSnapshot;

  return { editorRoot, headingElement, scrollRoot, scrollTo, view };
}

describe('useNotesOutline', () => {
  beforeEach(() => {
    hoisted.currentSnapshot = null;
    hoisted.expandCollapsedHeading.mockClear();
    hoisted.materializeVirtualizedBlock.mockClear();
    hoisted.refreshSnapshot.mockClear();
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
  });

  it('jumps to outline headings without smooth scrolling by default', () => {
    const { scrollTo } = createOutlineSnapshot();
    const { result } = renderHook(() => useNotesOutline(true));

    act(() => {
      result.current.jumpToHeading('target-heading');
    });

    expect(scrollTo).toHaveBeenCalledWith({
      top: 228,
      behavior: 'auto',
    });
  });

  it('lists headings with inexact geometry without using them as active-position metrics', () => {
    createOutlineSnapshot();
    const placeholder = document.createElement('div');
    hoisted.currentSnapshot!.headings.push({
      id: 'deferred-heading',
      level: 3,
      text: 'Deferred',
      from: 20,
      to: 30,
      element: placeholder,
      hasExactGeometry: false,
      top: 0,
      bottom: 0,
    });

    const { result } = renderHook(() => useNotesOutline(true));

    expect(result.current.headings.map((heading) => heading.text)).toEqual(['Target', 'Deferred']);
    expect(result.current.activeId).toBe('target-heading');
  });

  it('expands and materializes a hidden heading before measuring its jump target', async () => {
    const { headingElement, scrollTo, view } = createOutlineSnapshot();
    hoisted.currentSnapshot!.headings[0]!.hasExactGeometry = false;
    hoisted.expandCollapsedHeading.mockReturnValue(true);
    hoisted.materializeVirtualizedBlock.mockReturnValue(true);
    hoisted.refreshSnapshot.mockImplementation(() => hoisted.currentSnapshot);
    view.nodeDOM = vi.fn(() => headingElement);

    const { result } = renderHook(() => useNotesOutline(true));
    act(() => {
      result.current.jumpToHeading('target-heading');
    });
    expect(scrollTo).not.toHaveBeenCalled();

    await act(async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });

    expect(hoisted.expandCollapsedHeading).toHaveBeenCalledWith(view, 1);
    expect(hoisted.materializeVirtualizedBlock).toHaveBeenCalledWith(view, 1);
    expect(hoisted.refreshSnapshot).toHaveBeenCalledWith(view);
    expect(scrollTo).toHaveBeenCalledWith({ top: 228, behavior: 'auto' });
  });
});

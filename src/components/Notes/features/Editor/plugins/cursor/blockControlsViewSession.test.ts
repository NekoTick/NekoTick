import { MAX_COMPOSER_PROGRAMMATIC_INSERT_CHARS } from '@/lib/ui/composerFocusRegistry';
import { useNotesStore } from '@/stores/useNotesStore';
import type { EditorView } from '@milkdown/kit/prose/view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearCurrentEditorBlockPositionSnapshot,
  setCurrentEditorBlockPositionSnapshot,
} from '../../utils/editorBlockPositionCache';
import { BLOCK_CONTROLS_LEFT_OFFSET_PX } from './blockControlsGeometry';
import {
  applyBlockMove,
  canApplyBlockMove,
  getDraggableBlockRanges,
  getHandleBlockTargets,
  resolveBlockTargetByPos,
  resolveDropTarget,
} from './blockControlsInteractions';
import { BlockControlsViewSession, __testing__ } from './blockControlsViewSession';
import { getBlockDragComposerPayload } from './blockDragVisualState';
import { setBlockSelectionInteractionPending } from './blockSelectionInteractionState';
import { serializeSelectedBlocksToText } from './blockSelectionSerializer';

const originalElementsFromPoint = document.elementsFromPoint;

const mocks = vi.hoisted(() => ({
  targetTop: 40,
  selectedBlocks: [{ from: 1, to: 5 }],
  setControlsPosition: vi.fn((controls: HTMLElement, target: { rect: DOMRect }) => {
    controls.style.left = `${Math.round(target.rect.left - 60)}px`;
    controls.style.top = `${Math.round(target.rect.top + target.rect.height / 2)}px`;
  }),
}));

function createHandleTarget(pos: number, left: number, top: number, isListItem = false) {
  return {
    pos,
    isListItem,
    rect: {
      x: left,
      y: top,
      left,
      top,
      right: left + 280,
      bottom: top + 20,
      width: 280,
      height: 20,
      toJSON: () => ({}),
    } as DOMRect,
  };
}

vi.mock('./blockSelectionPluginState', () => ({
  getBlockSelectionPluginState: () => ({
    selectedBlocks: mocks.selectedBlocks,
  }),
}));

vi.mock('./blockControlsInteractions', () => ({
  applyBlockMove: vi.fn(() => false),
  canApplyBlockMove: vi.fn(() => true),
  getDraggableBlockRanges: vi.fn(() => [{ from: 1, to: 5 }]),
  getHandleBlockTargets: vi.fn(() => [createHandleTarget(1, 80, mocks.targetTop)]),
  resolveBlockTargetByPos: vi.fn(() => ({
    pos: 1,
    isListItem: false,
    rect: {
      x: 80,
      y: mocks.targetTop,
      left: 80,
      top: mocks.targetTop,
      right: 360,
      bottom: mocks.targetTop + 20,
      width: 280,
      height: 20,
      toJSON: () => ({}),
    } as DOMRect,
  })),
  resolveDropTarget: vi.fn(() => null),
  setControlsPosition: mocks.setControlsPosition,
}));

vi.mock('./blockDragPreview', () => ({
  createBlockDragPreview: vi.fn(() => null),
  createBlockDragSourceMarker: vi.fn(() => null),
}));

vi.mock('./blockSelectionSerializer', () => ({
  serializeSelectedBlocksToText: vi.fn(() => 'Selected block'),
}));

vi.mock('../../utils/editorViewRegistry', () => ({
  getCurrentMarkdownParser: vi.fn(() => null),
  getCurrentMarkdownSerializer: vi.fn(() => null),
}));

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function createView(options: { scrollRoot?: boolean } = {}): EditorView {
  const dom = document.createElement('div');
  if (options.scrollRoot) {
    const scrollRoot = document.createElement('div');
    scrollRoot.setAttribute('data-note-scroll-root', 'true');
    scrollRoot.scrollTop = 20;
    scrollRoot.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 500,
      bottom: 100,
      width: 500,
      height: 100,
      toJSON: () => ({}),
    } as DOMRect);
    scrollRoot.appendChild(dom);
    document.body.appendChild(scrollRoot);
  } else {
    document.body.appendChild(dom);
  }
  return {
    dom,
    state: {
      doc: {
        content: { size: 5 },
      },
    },
  } as unknown as EditorView;
}

function getScrollRoot(): HTMLElement {
  const scrollRoot = document.querySelector<HTMLElement>('[data-note-scroll-root="true"]');
  if (!scrollRoot) throw new Error('Missing scroll root');
  return scrollRoot;
}

function createNoteTabDropTarget(path: string): HTMLElement {
  const tab = document.createElement('div');
  tab.dataset.notesTabPath = path;
  tab.setAttribute('data-notes-block-drop-target', 'true');
  document.body.appendChild(tab);
  return tab;
}

function createFileTreeFileDropTarget(path: string): HTMLElement {
  const file = document.createElement('div');
  file.dataset.fileTreeKind = 'file';
  file.dataset.fileTreePath = path;
  document.body.appendChild(file);
  return file;
}

function createSplitPaneDropTarget(path: string): HTMLElement {
  const pane = document.createElement('div');
  pane.dataset.notesSplitLeafPath = path;
  pane.setAttribute('data-notes-block-drop-target', 'true');
  document.body.appendChild(pane);
  return pane;
}

function setOpenTabNotesState(openNote = vi.fn(async () => undefined)) {
  useNotesStore.setState({
    currentNote: { path: 'source.md', content: 'Source' },
    openTabs: [
      { path: 'source.md', name: 'source.md', isDirty: false },
      { path: 'target.md', name: 'target.md', isDirty: false },
    ],
    noteContentsCache: new Map([
      ['source.md', { content: 'Source', modifiedAt: null }],
      ['target.md', { content: 'Target', modifiedAt: null }],
    ]),
    openNote,
  });

  return openNote;
}

describe('BlockControlsViewSession', () => {
  afterEach(() => {
    vi.useRealTimers();
    useNotesStore.setState(useNotesStore.getInitialState(), true);
    clearCurrentEditorBlockPositionSnapshot();
    vi.mocked(applyBlockMove).mockClear();
    vi.mocked(canApplyBlockMove).mockClear();
    vi.mocked(canApplyBlockMove).mockReturnValue(true);
    vi.mocked(getDraggableBlockRanges).mockClear();
    vi.mocked(getDraggableBlockRanges).mockReturnValue([{ from: 1, to: 5 }]);
    vi.mocked(getHandleBlockTargets).mockClear();
    vi.mocked(getHandleBlockTargets).mockImplementation(() => [createHandleTarget(1, 80, mocks.targetTop)]);
    vi.mocked(resolveBlockTargetByPos).mockClear();
    vi.mocked(resolveBlockTargetByPos).mockImplementation(() => createHandleTarget(1, 80, mocks.targetTop));
    vi.mocked(resolveDropTarget).mockReset();
    vi.mocked(resolveDropTarget).mockReturnValue(null);
    vi.mocked(serializeSelectedBlocksToText).mockClear();
    vi.mocked(serializeSelectedBlocksToText).mockReturnValue('Selected block');
    document.body.innerHTML = '';
    document.elementsFromPoint = originalElementsFromPoint;
    mocks.targetTop = 40;
    mocks.selectedBlocks = [{ from: 1, to: 5 }];
    mocks.setControlsPosition.mockClear();
  });

  it('saves the source deletion after the target note save succeeds', async () => {
    const saveMarkdown = vi.fn(async () => true);

    await expect(__testing__.saveCrossNoteBlockDropAfterTargetSave({
      sourceNotePath: 'source.md',
      sourceMarkdownBeforeDelete: 'Source before delete',
      sourceMarkdownAfterDelete: 'Source after delete',
      targetNotePath: 'target.md',
      targetMarkdownAfterInsert: 'Target after insert',
      saveMarkdown,
    })).resolves.toBe(true);

    expect(saveMarkdown).toHaveBeenCalledTimes(2);
    expect(saveMarkdown).toHaveBeenNthCalledWith(1, 'target.md', 'Target after insert');
    expect(saveMarkdown).toHaveBeenNthCalledWith(2, 'source.md', 'Source after delete', {
      replaceConcurrentContentIfEqualTo: 'Source before delete',
    });
  });

  it('does not save the source deletion when the target note save fails', async () => {
    const saveMarkdown = vi.fn(async (notePath: string | null | undefined) => notePath !== 'target.md');

    await expect(__testing__.saveCrossNoteBlockDropAfterTargetSave({
      sourceNotePath: 'source.md',
      sourceMarkdownBeforeDelete: 'Source before delete',
      sourceMarkdownAfterDelete: 'Source after delete',
      targetNotePath: 'target.md',
      targetMarkdownAfterInsert: 'Target after insert',
      saveMarkdown,
    })).resolves.toBe(false);

    expect(saveMarkdown).toHaveBeenCalledTimes(1);
    expect(saveMarkdown).toHaveBeenCalledWith('target.md', 'Target after insert');
  });

  it('refreshes the visible handle when the block position snapshot changes without pointer movement', async () => {
    const view = createView();
    const session = new BlockControlsViewSession(view);

    try {
      document.dispatchEvent(new MouseEvent('mousemove', { clientY: 50, bubbles: true }));
      await nextFrame();

      const controls = document.querySelector<HTMLElement>('.editor-block-controls');
      expect(controls?.style.top).toBe('50px');

      mocks.targetTop = 54;
      setCurrentEditorBlockPositionSnapshot({
        version: 1,
        view,
        doc: view.state.doc,
        editorRoot: view.dom,
        scrollRoot: null,
        scrollLeft: 0,
        scrollTop: 0,
        blocks: [],
        blockIndex: new Map(),
        headings: [],
      });
      await nextFrame();

      expect(controls?.style.top).toBe('64px');
      expect(mocks.setControlsPosition).toHaveBeenCalledTimes(2);
    } finally {
      session.destroy();
    }
  });

  it('skips handle target scans while blank-area block selection is pending', async () => {
    const view = createView();
    const session = new BlockControlsViewSession(view);

    try {
      view.dom.classList.add('editor-block-selection-pending');
      document.dispatchEvent(new MouseEvent('mousemove', { clientY: 50, bubbles: true }));
      await nextFrame();

      const controls = document.querySelector<HTMLElement>('.editor-block-controls');
      expect(controls?.classList.contains('visible')).toBe(false);
      expect(getHandleBlockTargets).not.toHaveBeenCalled();

      view.dom.classList.remove('editor-block-selection-pending');
      document.dispatchEvent(new MouseEvent('mousemove', { clientY: 50, bubbles: true }));
      await nextFrame();

      expect(getHandleBlockTargets).toHaveBeenCalledTimes(1);
    } finally {
      session.destroy();
    }
  });

  it('skips handle target scans while deferred block selection is pending', async () => {
    const view = createView();
    const session = new BlockControlsViewSession(view);

    try {
      setBlockSelectionInteractionPending(view.dom, true);
      document.dispatchEvent(new MouseEvent('mousemove', { clientY: 50, bubbles: true }));
      await nextFrame();

      const controls = document.querySelector<HTMLElement>('.editor-block-controls');
      expect(controls?.classList.contains('visible')).toBe(false);
      expect(getHandleBlockTargets).not.toHaveBeenCalled();

      setBlockSelectionInteractionPending(view.dom, false);
      document.dispatchEvent(new MouseEvent('mousemove', { clientY: 50, bubbles: true }));
      await nextFrame();

      expect(getHandleBlockTargets).toHaveBeenCalledTimes(1);
    } finally {
      setBlockSelectionInteractionPending(view.dom, false);
      session.destroy();
    }
  });

  it('hides the handle when the pointer leaves the current note scroll root', async () => {
    const view = createView({ scrollRoot: true });
    const session = new BlockControlsViewSession(view);

    try {
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 50, bubbles: true }));
      await nextFrame();

      const controls = document.querySelector<HTMLElement>('.editor-block-controls');
      expect(controls?.classList.contains('visible')).toBe(true);

      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 140, bubbles: true }));
      await nextFrame();

      expect(controls?.classList.contains('visible')).toBe(false);
    } finally {
      session.destroy();
    }
  });

  it('does not snap the handle to the nearest selected block when the pointer is far away', async () => {
    const view = createView({ scrollRoot: true });
    const session = new BlockControlsViewSession(view);

    try {
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 95, bubbles: true }));
      await nextFrame();

      const controls = document.querySelector<HTMLElement>('.editor-block-controls');
      expect(controls?.classList.contains('visible')).toBe(false);
    } finally {
      session.destroy();
    }
  });

  it('reuses draggable selected ranges while refreshing the handle for pointer movement', async () => {
    const view = createView({ scrollRoot: true });
    const session = new BlockControlsViewSession(view);

    try {
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 50, bubbles: true }));
      await nextFrame();
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 24, clientY: 52, bubbles: true }));
      await nextFrame();

      expect(getDraggableBlockRanges).toHaveBeenCalledTimes(1);
    } finally {
      session.destroy();
    }
  });

  it('anchors the handle to the hovered block instead of the first selected block', async () => {
    const view = createView({ scrollRoot: true });
    const session = new BlockControlsViewSession(view);
    const nestedFirstTarget = createHandleTarget(1, 128, 40, true);
    const normalHoveredTarget = createHandleTarget(10, 80, 70, false);

    mocks.selectedBlocks = [
      { from: 1, to: 5 },
      { from: 10, to: 15 },
    ];
    vi.mocked(getDraggableBlockRanges).mockReturnValue([
      { from: 1, to: 5 },
      { from: 10, to: 15 },
    ]);
    vi.mocked(getHandleBlockTargets).mockReturnValue([
      nestedFirstTarget,
      normalHoveredTarget,
    ]);
    vi.mocked(resolveBlockTargetByPos).mockImplementation((_view, pos) => (
      pos === 1 ? nestedFirstTarget : normalHoveredTarget
    ));

    try {
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 80, bubbles: true }));
      await nextFrame();

      expect(mocks.setControlsPosition).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        normalHoveredTarget,
        BLOCK_CONTROLS_LEFT_OFFSET_PX,
      );
    } finally {
      session.destroy();
    }
  });

  it('anchors child rows to the selected outer list item when the whole parent group is selected', async () => {
    const view = createView({ scrollRoot: true });
    const session = new BlockControlsViewSession(view);
    const outerParentTarget = createHandleTarget(1, 80, 40, true);
    const nestedHoveredTarget = createHandleTarget(10, 128, 70, true);

    mocks.selectedBlocks = [
      { from: 1, to: 6 },
      { from: 10, to: 15 },
    ];
    vi.mocked(getDraggableBlockRanges).mockReturnValue([
      { from: 1, to: 6 },
      { from: 10, to: 15 },
    ]);
    vi.mocked(getHandleBlockTargets).mockReturnValue([
      outerParentTarget,
      nestedHoveredTarget,
    ]);
    vi.mocked(resolveBlockTargetByPos).mockImplementation((_view, pos) => (
      pos === 1 ? outerParentTarget : nestedHoveredTarget
    ));
    (view.state.doc as any).resolve = vi.fn((pos: number) => {
      if (pos === 1) {
        return {
          nodeAfter: {
            type: { name: 'list_item' },
            nodeSize: 18,
          },
        };
      }
      return { nodeAfter: null };
    });

    try {
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 80, bubbles: true }));
      await nextFrame();

      expect(mocks.setControlsPosition).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        nestedHoveredTarget,
        BLOCK_CONTROLS_LEFT_OFFSET_PX,
        { horizontalAnchor: outerParentTarget },
      );
    } finally {
      session.destroy();
    }
  });

  it('uses the original parent selection for anchors when draggable ranges are pruned to a child block', async () => {
    const view = createView({ scrollRoot: true });
    const session = new BlockControlsViewSession(view);
    const outerParentTarget = createHandleTarget(1, 80, 40, true);
    const childBlockTarget = createHandleTarget(8, 116, 70, false);

    mocks.selectedBlocks = [
      { from: 1, to: 20 },
      { from: 8, to: 15 },
    ];
    vi.mocked(getDraggableBlockRanges).mockReturnValue([
      { from: 8, to: 15 },
    ]);
    vi.mocked(getHandleBlockTargets).mockReturnValue([
      outerParentTarget,
      childBlockTarget,
    ]);
    vi.mocked(resolveBlockTargetByPos).mockImplementation((_view, pos) => (
      pos === 1 ? outerParentTarget : childBlockTarget
    ));
    (view.state.doc as any).resolve = vi.fn((pos: number) => {
      if (pos === 1) {
        return {
          nodeAfter: {
            type: { name: 'list_item' },
            nodeSize: 19,
          },
        };
      }
      return { nodeAfter: null };
    });

    try {
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 80, bubbles: true }));
      await nextFrame();

      expect(mocks.setControlsPosition).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        childBlockTarget,
        BLOCK_CONTROLS_LEFT_OFFSET_PX,
        { horizontalAnchor: outerParentTarget },
      );
    } finally {
      session.destroy();
    }
  });

  it('keeps child hover targets when draggable ranges are pruned to a selected parent list item', async () => {
    const view = createView({ scrollRoot: true });
    const session = new BlockControlsViewSession(view);
    const outerParentTarget = createHandleTarget(1, 80, 40, true);
    const nestedChildTarget = createHandleTarget(8, 128, 70, true);

    mocks.selectedBlocks = [
      { from: 1, to: 20 },
      { from: 8, to: 15 },
    ];
    vi.mocked(getDraggableBlockRanges).mockReturnValue([
      { from: 1, to: 20 },
    ]);
    vi.mocked(getHandleBlockTargets).mockReturnValue([
      outerParentTarget,
      nestedChildTarget,
    ]);
    vi.mocked(resolveBlockTargetByPos).mockImplementation((_view, pos) => (
      pos === 1 ? outerParentTarget : nestedChildTarget
    ));
    (view.state.doc as any).resolve = vi.fn((pos: number) => {
      if (pos === 1) {
        return {
          nodeAfter: {
            type: { name: 'list_item' },
            nodeSize: 19,
          },
        };
      }
      return { nodeAfter: null };
    });

    try {
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 80, bubbles: true }));
      await nextFrame();

      expect(mocks.setControlsPosition).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        nestedChildTarget,
        BLOCK_CONTROLS_LEFT_OFFSET_PX,
        { horizontalAnchor: outerParentTarget },
      );
    } finally {
      session.destroy();
    }
  });

  it('hides the visible handle when the window loses focus', async () => {
    const view = createView({ scrollRoot: true });
    const session = new BlockControlsViewSession(view);

    try {
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 50, bubbles: true }));
      await nextFrame();

      const controls = document.querySelector<HTMLElement>('.editor-block-controls');
      expect(controls?.classList.contains('visible')).toBe(true);

      window.dispatchEvent(new Event('blur'));
      await nextFrame();

      expect(controls?.classList.contains('visible')).toBe(false);
    } finally {
      session.destroy();
    }
  });

  it('does not move dragged blocks when the mouse is released over the notes chat drop target', () => {
    const view = createView();
    const session = new BlockControlsViewSession(view);
    const dropTarget = document.createElement('div');
    dropTarget.setAttribute('data-notes-block-drop-target', 'true');
    document.body.appendChild(dropTarget);

    vi.mocked(resolveDropTarget).mockReturnValue({
      insertPos: 5,
      lineLeft: 80,
      lineY: 100,
      lineWidth: 280,
    });
    document.elementsFromPoint = vi.fn(() => [dropTarget]);

    try {
      document
        .querySelector<HTMLElement>('.editor-block-control-handle')
        ?.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 20, clientY: 20, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 40, clientY: 120, buttons: 1, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mouseup', { clientX: 40, clientY: 120, bubbles: true }));

      expect(applyBlockMove).not.toHaveBeenCalled();
    } finally {
      session.destroy();
    }
  });

  it('keeps the editor drop indicator visible over invalid local move targets', () => {
    const view = createView();
    const session = new BlockControlsViewSession(view);

    vi.mocked(resolveDropTarget).mockReturnValue({
      insertPos: 3,
      lineLeft: 80,
      lineY: 100,
      lineWidth: 280,
    });
    vi.mocked(canApplyBlockMove).mockReturnValue(false);
    document.elementsFromPoint = vi.fn(() => []);

    try {
      document
        .querySelector<HTMLElement>('.editor-block-control-handle')
        ?.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 20, clientY: 20, bubbles: true }));

      const indicator = document.querySelector<HTMLElement>('.editor-block-drop-indicator');
      expect(indicator?.classList.contains('visible')).toBe(true);
      expect(indicator?.style.left).toBe('80px');
      expect(indicator?.style.width).toBe('280px');
      expect(session.pendingDrop).toBeNull();

      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 40, clientY: 120, buttons: 1, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mouseup', { clientX: 40, clientY: 120, bubbles: true }));

      expect(applyBlockMove).not.toHaveBeenCalled();
    } finally {
      session.destroy();
    }
  });

  it('opens a hovered note tab while dragging selected blocks', async () => {
    vi.useFakeTimers();
    const openNote = setOpenTabNotesState();
    const view = createView();
    const session = new BlockControlsViewSession(view);
    const targetTab = createNoteTabDropTarget('target.md');
    document.elementsFromPoint = vi.fn(() => [targetTab]);

    try {
      document
        .querySelector<HTMLElement>('.editor-block-control-handle')
        ?.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 20, clientY: 20, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 120, clientY: 20, buttons: 1, bubbles: true }));

      await vi.advanceTimersByTimeAsync(16);
      expect(openNote).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(280);
      expect(openNote).toHaveBeenCalledWith('target.md');
    } finally {
      session.destroy();
    }
  });

  it('opens a hovered sidebar file while dragging selected blocks', async () => {
    vi.useFakeTimers();
    const openNote = setOpenTabNotesState();
    const view = createView();
    const session = new BlockControlsViewSession(view);
    const targetFile = createFileTreeFileDropTarget('target.md');
    document.elementsFromPoint = vi.fn(() => [targetFile]);

    try {
      document
        .querySelector<HTMLElement>('.editor-block-control-handle')
        ?.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 20, clientY: 20, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 120, clientY: 20, buttons: 1, bubbles: true }));

      await vi.advanceTimersByTimeAsync(296);

      expect(openNote).toHaveBeenCalledWith('target.md');
    } finally {
      session.destroy();
    }
  });

  it('opens a hovered split pane while dragging selected blocks', async () => {
    vi.useFakeTimers();
    const openNote = setOpenTabNotesState();
    const view = createView();
    const session = new BlockControlsViewSession(view);
    const targetPane = createSplitPaneDropTarget('target.md');
    document.elementsFromPoint = vi.fn(() => [targetPane]);

    try {
      document
        .querySelector<HTMLElement>('.editor-block-control-handle')
        ?.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 20, clientY: 20, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 120, clientY: 20, buttons: 1, bubbles: true }));

      await vi.advanceTimersByTimeAsync(296);

      expect(openNote).toHaveBeenCalledWith('target.md');
    } finally {
      session.destroy();
    }
  });

  it('does not move dragged blocks when the mouse is released over a sidebar file target', () => {
    const view = createView();
    const session = new BlockControlsViewSession(view);
    const targetFile = createFileTreeFileDropTarget('target.md');

    vi.mocked(resolveDropTarget).mockReturnValue({
      insertPos: 5,
      lineLeft: 80,
      lineY: 100,
      lineWidth: 280,
    });
    document.elementsFromPoint = vi.fn(() => [targetFile]);

    try {
      document
        .querySelector<HTMLElement>('.editor-block-control-handle')
        ?.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 20, clientY: 20, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 120, clientY: 20, buttons: 1, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mouseup', { clientX: 120, clientY: 20, bubbles: true }));

      expect(applyBlockMove).not.toHaveBeenCalled();
    } finally {
      session.destroy();
    }
  });

  it('serializes dragged markdown with single list block markers for cross-note drops', () => {
    setOpenTabNotesState();
    const view = createView();
    const session = new BlockControlsViewSession(view);

    try {
      document
        .querySelector<HTMLElement>('.editor-block-control-handle')
        ?.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 20, clientY: 20, bubbles: true }));

      expect(serializeSelectedBlocksToText).toHaveBeenCalledWith(
        view.state,
        [{ from: 1, to: 5 }],
        expect.objectContaining({
          preserveSingleListBlockMarker: true,
        }),
      );
    } finally {
      session.destroy();
    }
  });

  it('opens a hovered absolute-path note tab with the absolute note action', async () => {
    vi.useFakeTimers();
    const openNote = vi.fn(async () => undefined);
    const openNoteByAbsolutePath = vi.fn(async () => undefined);
    useNotesStore.setState({
      currentNote: { path: '/source.md', content: 'Source' },
      openTabs: [
        { path: '/source.md', name: 'source.md', isDirty: false },
        { path: '/target.md', name: 'target.md', isDirty: false },
      ],
      noteContentsCache: new Map([
        ['/source.md', { content: 'Source', modifiedAt: null }],
        ['/target.md', { content: 'Target', modifiedAt: null }],
      ]),
      openNote,
      openNoteByAbsolutePath,
    });
    const view = createView();
    const session = new BlockControlsViewSession(view);
    const targetTab = createNoteTabDropTarget('/target.md');
    document.elementsFromPoint = vi.fn(() => [targetTab]);

    try {
      document
        .querySelector<HTMLElement>('.editor-block-control-handle')
        ?.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 20, clientY: 20, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 120, clientY: 20, buttons: 1, bubbles: true }));

      await vi.advanceTimersByTimeAsync(296);

      expect(openNote).not.toHaveBeenCalled();
      expect(openNoteByAbsolutePath).toHaveBeenCalledWith('/target.md');
    } finally {
      session.destroy();
    }
  });

  it('cancels a pending hovered note tab open when block dragging finishes', async () => {
    vi.useFakeTimers();
    const openNote = setOpenTabNotesState();
    const view = createView();
    const session = new BlockControlsViewSession(view);
    const targetTab = createNoteTabDropTarget('target.md');
    document.elementsFromPoint = vi.fn(() => [targetTab]);

    try {
      document
        .querySelector<HTMLElement>('.editor-block-control-handle')
        ?.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 20, clientY: 20, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 120, clientY: 20, buttons: 1, bubbles: true }));

      await vi.advanceTimersByTimeAsync(16);
      document.dispatchEvent(new MouseEvent('mouseup', { clientX: 120, clientY: 20, bubbles: true }));
      await vi.advanceTimersByTimeAsync(500);

      expect(openNote).not.toHaveBeenCalled();
    } finally {
      session.destroy();
    }
  });

  it('does not apply stale source ranges after the editor document changes during a block drag', () => {
    const view = createView();
    const session = new BlockControlsViewSession(view);

    vi.mocked(resolveDropTarget).mockReturnValue({
      insertPos: 5,
      lineLeft: 80,
      lineY: 100,
      lineWidth: 280,
    });

    try {
      document
        .querySelector<HTMLElement>('.editor-block-control-handle')
        ?.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 20, clientY: 20, bubbles: true }));
      (view as unknown as { state: typeof view.state }).state = {
        ...view.state,
        doc: {
          content: { size: 20 },
        },
      } as typeof view.state;
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 40, clientY: 120, buttons: 1, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mouseup', { clientX: 40, clientY: 120, bubbles: true }));

      expect(applyBlockMove).not.toHaveBeenCalled();
    } finally {
      session.destroy();
    }
  });

  it('does not reshow the handle at the drag start position after dropping outside the note viewport', async () => {
    const view = createView({ scrollRoot: true });
    const session = new BlockControlsViewSession(view);

    vi.mocked(resolveDropTarget).mockReturnValue({
      insertPos: 5,
      lineLeft: 80,
      lineY: 100,
      lineWidth: 280,
    });

    try {
      document
        .querySelector<HTMLElement>('.editor-block-control-handle')
        ?.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 20, clientY: 50, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 40, clientY: 140, buttons: 1, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mouseup', { clientX: 40, clientY: 140, bubbles: true }));
      await nextFrame();

      const controls = document.querySelector<HTMLElement>('.editor-block-controls');
      expect(controls?.classList.contains('visible')).toBe(false);
    } finally {
      session.destroy();
    }
  });

  it('hides the handle after canceling a block drag with Escape', async () => {
    const view = createView({ scrollRoot: true });
    const session = new BlockControlsViewSession(view);

    try {
      document
        .querySelector<HTMLElement>('.editor-block-control-handle')
        ?.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 20, clientY: 50, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 40, clientY: 60, buttons: 1, bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await nextFrame();

      const controls = document.querySelector<HTMLElement>('.editor-block-controls');
      expect(controls?.classList.contains('visible')).toBe(false);
    } finally {
      session.destroy();
    }
  });

  it('hides the editor drop indicator while dragged blocks are over the notes chat drop target', async () => {
    const view = createView();
    const session = new BlockControlsViewSession(view);
    const dropTarget = document.createElement('div');
    dropTarget.setAttribute('data-notes-block-drop-target', 'true');
    document.body.appendChild(dropTarget);

    vi.mocked(resolveDropTarget).mockReturnValue({
      insertPos: 5,
      lineLeft: 80,
      lineY: 100,
      lineWidth: 280,
    });

    try {
      document
        .querySelector<HTMLElement>('.editor-block-control-handle')
        ?.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 20, clientY: 20, bubbles: true }));

      document.elementsFromPoint = vi.fn(() => []);
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 40, clientY: 120, buttons: 1, bubbles: true }));
      const indicator = document.querySelector<HTMLElement>('.editor-block-drop-indicator');
      expect(indicator?.classList.contains('visible')).toBe(true);

      document.elementsFromPoint = vi.fn(() => [dropTarget]);
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 500, clientY: 120, buttons: 1, bubbles: true }));
      await nextFrame();

      expect(indicator?.classList.contains('visible')).toBe(false);
    } finally {
      session.destroy();
    }
  });

  it('does not serialize oversized dragged block selections for chat drop payloads', () => {
    const view = createView();
    const session = new BlockControlsViewSession(view);
    vi.mocked(getDraggableBlockRanges).mockReturnValue([
      { from: 1, to: MAX_COMPOSER_PROGRAMMATIC_INSERT_CHARS + 2 },
    ]);

    try {
      document
        .querySelector<HTMLElement>('.editor-block-control-handle')
        ?.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 20, clientY: 20, bubbles: true }));

      expect(serializeSelectedBlocksToText).not.toHaveBeenCalled();
      expect(getBlockDragComposerPayload()).toBeNull();
    } finally {
      session.destroy();
    }
  });

  it('auto-scrolls the note viewport while dragging selected blocks near the edge', async () => {
    const view = createView({ scrollRoot: true });
    const session = new BlockControlsViewSession(view);
    const scrollRoot = getScrollRoot();

    vi.mocked(resolveDropTarget).mockReturnValue({
      insertPos: 5,
      lineLeft: 80,
      lineY: 100,
      lineWidth: 280,
    });

    try {
      document
        .querySelector<HTMLElement>('.editor-block-control-handle')
        ?.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 20, clientY: 20, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 40, clientY: 95, buttons: 1, bubbles: true }));
      vi.mocked(resolveDropTarget).mockClear();

      await nextFrame();

      expect(scrollRoot.scrollTop).toBeGreaterThan(20);
      expect(resolveDropTarget).toHaveBeenCalledWith(view, 40, 95);
    } finally {
      session.destroy();
    }
  });
});

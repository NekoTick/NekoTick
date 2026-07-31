import { TextSelection } from '@milkdown/kit/prose/state';
import { redoDepth, undoDepth } from '@milkdown/kit/prose/history';
import { getElectronBridge } from '@/lib/electron/bridge';
import {
  getCurrentEditorNotePath,
  getCurrentEditorView,
} from '@/components/Notes/features/Editor/utils/editorViewRegistry';
import { focusCurrentEditorAtViewportPoint } from '@/components/Notes/features/Editor/utils/focusEditorAtPoint';
import { flushCurrentPendingEditorMarkdown } from '@/stores/notes/pendingEditorMarkdownFlusher';
import {
  blankAreaDragBoxPluginKey,
  dispatchBlockSelectionAction,
} from '@/components/Notes/features/Editor/plugins/cursor/blockSelectionPluginState';
import { floatingToolbarKey } from '@/components/Notes/features/Editor/plugins/floating-toolbar/floatingToolbarKey';
import { TOOLBAR_ACTIONS } from '@/components/Notes/features/Editor/plugins/floating-toolbar/types';
import {
  editorTextHasMark,
  findEditorTextRange,
  focusCurrentEditor,
  focusCurrentEditorAtEnd,
  getEditorSelectionSummary,
  getEditorToolbarDebugState,
  getSelectableBlockRangeTextForE2E,
  getSelectableBlockTargetsForE2E,
  setEditorSelectionRange,
} from './syncE2EEditorSelection';
import {
  startEditorDispatchProfile,
  stopEditorDispatchProfile,
} from './syncE2EEditorProfile';
import type { E2EBridge } from './syncE2EBridgeTypes';

type EditorBridgeActions = Pick<
  E2EBridge,
  | 'getNoteSelectableBlocks'
  | 'selectEditorTextByText'
  | 'getEditorSelectionSummary'
  | 'getEditorPositionAtPoint'
  | 'getEditorTextRange'
  | 'getCurrentEditorNotePath'
  | 'getEditorHistoryDepth'
  | 'focusEditorAtPoint'
  | 'setEditorSelectionRange'
  | 'focusCurrentEditor'
  | 'focusCurrentEditorAtEnd'
  | 'startEditorDispatchProfile'
  | 'stopEditorDispatchProfile'
  | 'editorTextHasMark'
  | 'getEditorToolbarDebugState'
  | 'writeClipboardText'
  | 'flushCurrentEditorMarkdown'
  | 'selectNoteBlocksByText'
  | 'selectNoteBlocksByIndexes'
  | 'measureGrowingBlockSelectionByIndexCounts'
>;

export function createSyncE2EEditorActions(): EditorBridgeActions {
  return {
    getNoteSelectableBlocks: () => {
      const view = getCurrentEditorView();
      if (!view) return [];
      return getSelectableBlockTargetsForE2E(view).map((target) => ({
        text: target.element.textContent?.trim() ?? '',
        rangeText: getSelectableBlockRangeTextForE2E(view, target.range),
        tagName: target.element.tagName,
        className: target.element.className,
        dataset: Object.fromEntries(
          Object.entries(target.element.dataset)
            .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
        ),
        rect: (() => {
          const rect = target.rect;
          return {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          };
        })(),
        from: target.range.from,
        to: target.range.to,
      }));
    },
    getEditorPositionAtPoint: (clientX, clientY) => {
      const view = getCurrentEditorView();
      if (!view) return null;
      try {
        return view.posAtCoords({ left: clientX, top: clientY })?.pos ?? null;
      } catch {
        return null;
      }
    },
    getCurrentEditorNotePath,
    getEditorHistoryDepth: () => {
      const view = getCurrentEditorView();
      if (!view) return null;
      return {
        undo: undoDepth(view.state),
        redo: redoDepth(view.state),
      };
    },
    getEditorTextRange: (text, anchorText) => findEditorTextRange(text, anchorText),
    focusEditorAtPoint: (clientX, clientY) => focusCurrentEditorAtViewportPoint({ clientX, clientY }),
    selectEditorTextByText: async (text, anchorText) => {
      const startedAt = performance.now();
      const view = getCurrentEditorView();
      const viewResolvedAt = performance.now();
      const range = findEditorTextRange(text, anchorText);
      const rangeResolvedAt = performance.now();
      if (!view || !range) {
        return {
          selected: false,
          from: null,
          to: null,
          selectedText: '',
          timings: {
            totalMs: Math.round((performance.now() - startedAt) * 10) / 10,
            viewMs: Math.round((viewResolvedAt - startedAt) * 10) / 10,
            rangeMs: Math.round((rangeResolvedAt - viewResolvedAt) * 10) / 10,
            focusMs: 0,
            dispatchMs: 0,
            rafMs: 0,
            summaryMs: 0,
          },
        };
      }

      window.focus();
      view.dom.focus({ preventScroll: true });
      const focusResolvedAt = performance.now();
      view.dispatch(
        view.state.tr
          .setSelection(TextSelection.create(view.state.doc, range.from, range.to))
          .setMeta(floatingToolbarKey, {
            type: TOOLBAR_ACTIONS.SHOW,
            payload: {
              selectionRange: {
                from: range.from,
                to: range.to,
              },
            },
          })
          .scrollIntoView()
      );
      const dispatchedAt = performance.now();
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const rafSettledAt = performance.now();
      const summary = getEditorSelectionSummary();
      const summaryResolvedAt = performance.now();
      return {
        selected: summary?.selectedText === text,
        from: range.from,
        to: range.to,
        selectedText: summary?.selectedText ?? '',
        timings: {
          totalMs: Math.round((summaryResolvedAt - startedAt) * 10) / 10,
          viewMs: Math.round((viewResolvedAt - startedAt) * 10) / 10,
          rangeMs: Math.round((rangeResolvedAt - viewResolvedAt) * 10) / 10,
          focusMs: Math.round((focusResolvedAt - rangeResolvedAt) * 10) / 10,
          dispatchMs: Math.round((dispatchedAt - focusResolvedAt) * 10) / 10,
          rafMs: Math.round((rafSettledAt - dispatchedAt) * 10) / 10,
          summaryMs: Math.round((summaryResolvedAt - rafSettledAt) * 10) / 10,
        },
      };
    },
    getEditorSelectionSummary,
    setEditorSelectionRange,
    focusCurrentEditor,
    focusCurrentEditorAtEnd,
    startEditorDispatchProfile,
    stopEditorDispatchProfile,
    editorTextHasMark,
    getEditorToolbarDebugState,
    writeClipboardText: async (text) => {
      const desktopClipboard = getElectronBridge()?.clipboard;
      if (desktopClipboard?.writeText) {
        await desktopClipboard.writeText(text);
        return;
      }
      await navigator.clipboard.writeText(text);
    },
    flushCurrentEditorMarkdown: async () => {
      const flushed = flushCurrentPendingEditorMarkdown();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      return flushed;
    },
    selectNoteBlocksByText: async (texts) => {
      const view = getCurrentEditorView();
      if (!view) return 0;
      const targets = getSelectableBlockTargetsForE2E(view);
      const ranges = texts.flatMap((text) => {
        const target = targets.find((candidate) => candidate.element.textContent?.includes(text));
        return target ? [target.range] : [];
      });
      dispatchBlockSelectionAction(view, ranges.length > 0
        ? { type: 'set-blocks', blocks: ranges }
        : { type: 'clear-blocks' });
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      return ranges.length;
    },
    selectNoteBlocksByIndexes: async (indexes) => {
      const view = getCurrentEditorView();
      if (!view) return 0;
      const targets = getSelectableBlockTargetsForE2E(view);
      const ranges = indexes.flatMap((index) => {
        const target = targets[index];
        return target ? [target.range] : [];
      });
      dispatchBlockSelectionAction(view, ranges.length > 0
        ? { type: 'set-blocks', blocks: ranges }
        : { type: 'clear-blocks' });
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      return ranges.length;
    },
    measureGrowingBlockSelectionByIndexCounts: async (counts) => {
      const view = getCurrentEditorView();
      if (!view) {
        return {
          selectableCount: 0,
          collectTargetsMs: 0,
          results: [],
        };
      }

      const collectStartedAt = performance.now();
      const targets = getSelectableBlockTargetsForE2E(view);
      const collectTargetsMs = performance.now() - collectStartedAt;
      const results = [];

      for (const requestedCount of counts) {
        const ranges = targets.slice(0, requestedCount).map((target) => target.range);
        const startedAt = performance.now();
        dispatchBlockSelectionAction(view, ranges.length > 0
          ? { type: 'set-blocks', blocks: ranges }
          : { type: 'clear-blocks' });
        const dispatchedAt = performance.now();
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const firstFrameAt = performance.now();
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const secondFrameAt = performance.now();
        results.push({
          requestedCount,
          selectedStateCount: (blankAreaDragBoxPluginKey.getState(view.state)?.selectedBlocks ?? []).length,
          selectedDomCount: document.querySelectorAll('.milkdown .ProseMirror .editor-block-selected').length,
          lineFillCount: document.querySelectorAll('.editor-block-selection-line-fill').length,
          dispatchMs: Math.round((dispatchedAt - startedAt) * 10) / 10,
          firstFrameMs: Math.round((firstFrameAt - dispatchedAt) * 10) / 10,
          secondFrameMs: Math.round((secondFrameAt - firstFrameAt) * 10) / 10,
          totalMs: Math.round((secondFrameAt - startedAt) * 10) / 10,
        });
      }

      return {
        selectableCount: targets.length,
        collectTargetsMs: Math.round(collectTargetsMs * 10) / 10,
        results,
      };
    },
  };
}

import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import { Plugin, PluginKey, type Transaction } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { DecorationSet } from '@milkdown/kit/prose/view';
import { $prose } from '@milkdown/kit/utils';
import { OVERLAY_SCROLL_IDLE_EVENT } from '@/components/ui/overlayScrollAreaEvents';
import { DEFAULT_PROSE_DOC_SCAN_NODE_LIMIT } from '../../plugins/shared/boundedProseNodeScan';
import { getTransactionChangedRanges } from '../../plugins/shared/transactionStepText';
import { listContainsTaskItems } from './decorations/typoraBlockAttrs';
import { buildTyporaCompatibilityDecorations } from './decorations/typoraDecorations';
import { createThemeCompatibilityDecorationRebuildController } from './decorations/rebuildController';

export { listContainsTaskItems };
export {
  DEFAULT_THEME_COMPATIBILITY_DECORATION_DEBOUNCE_MS,
  createThemeCompatibilityDecorationRebuildController,
} from './decorations/rebuildController';

export const MAX_THEME_COMPATIBILITY_DECORATIONS = 2500;
export const MAX_THEME_COMPATIBILITY_LIVE_MAP_DECORATIONS = 800;
export const MAX_THEME_COMPATIBILITY_DOC_SCAN_NODES = DEFAULT_PROSE_DOC_SCAN_NODE_LIMIT;
export interface ThemeCompatibilityDecorationsState {
  decorations: DecorationSet;
  decorationCount: number;
  decorationMaxTo: number;
  rebuildVersion: number;
}

export const themeCompatibilityDecorationsPluginKey = new PluginKey<ThemeCompatibilityDecorationsState>('themeCompatibilityDecorations');

const THEME_COMPATIBILITY_SAFE_CONTENT_NODES = new Set([
  'code_block',
  'frontmatter',
  'math_block',
  'mermaid',
  'mermaid_block',
]);
const THEME_COMPATIBILITY_USER_INPUT_EVENTS = [
  'beforeinput',
  'keydown',
  'compositionupdate',
  'paste',
] as const;
const REBUILD_THEME_COMPATIBILITY_DECORATIONS_META = { type: 'rebuild' } as const;

export function buildCompatibilityDecorations(doc: any): DecorationSet {
  return buildTyporaCompatibilityDecorations(doc, {
    maxDecorations: MAX_THEME_COMPATIBILITY_DECORATIONS,
    maxScanNodes: MAX_THEME_COMPATIBILITY_DOC_SCAN_NODES,
  });
}

function rangeIsInsideThemeCompatibilitySafeContent(
  doc: ProseNode,
  from: number,
  to: number
): boolean {
  const start = Math.max(0, Math.min(from, doc.content.size));
  const end = Math.max(start, Math.min(to, doc.content.size));
  const $start = doc.resolve(start);

  for (let depth = $start.depth; depth > 0; depth -= 1) {
    const node = $start.node(depth);
    if (!THEME_COMPATIBILITY_SAFE_CONTENT_NODES.has(node.type.name)) {
      continue;
    }

    const contentStart = $start.before(depth) + 1;
    const contentEnd = $start.after(depth) - 1;
    return start >= contentStart && end <= contentEnd;
  }

  return false;
}

export function docChangeMayAffectThemeCompatibilityDecorations(
  prevDoc: ProseNode,
  nextDoc: ProseNode
): boolean {
  const diffStart = prevDoc.content.findDiffStart(nextDoc.content);
  if (diffStart === null) return false;

  const diffEnd = prevDoc.content.findDiffEnd(nextDoc.content);
  if (!diffEnd) return true;

  return !(
    rangeIsInsideThemeCompatibilitySafeContent(prevDoc, diffStart, diffEnd.a) &&
    rangeIsInsideThemeCompatibilitySafeContent(nextDoc, diffStart, diffEnd.b)
  );
}

export function transactionMayAffectThemeCompatibilityDecorations(
  prevDoc: ProseNode,
  nextDoc: ProseNode,
  tr: unknown
): boolean {
  const ranges = getTransactionChangedRanges(tr);
  if (ranges.length === 0) {
    return docChangeMayAffectThemeCompatibilityDecorations(prevDoc, nextDoc);
  }

  return ranges.some((range) => !(
    rangeIsInsideThemeCompatibilitySafeContent(prevDoc, range.oldFrom, range.oldTo) &&
    rangeIsInsideThemeCompatibilitySafeContent(nextDoc, range.newFrom, range.newTo)
  ));
}

function createThemeCompatibilityDecorationsState(
  doc: ProseNode,
  rebuildVersion: number
): ThemeCompatibilityDecorationsState {
  const decorations = buildCompatibilityDecorations(doc);
  const decorationRanges = decorations.find();
  return {
    decorationCount: decorationRanges.length,
    decorationMaxTo: decorationRanges.reduce((maxTo, decoration) => Math.max(maxTo, decoration.to), 0),
    decorations,
    rebuildVersion,
  };
}

function transactionChangesAfterThemeCompatibilityDecorations(
  tr: unknown,
  decorationMaxTo: number
): boolean {
  if (decorationMaxTo <= 0) {
    return false;
  }

  const ranges = getTransactionChangedRanges(tr);
  return ranges.length > 0 && ranges.every((range) => (
    range.oldFrom >= decorationMaxTo &&
    range.newFrom >= decorationMaxTo
  ));
}

export function applyThemeCompatibilityDecorationsState(
  tr: Transaction,
  previous: ThemeCompatibilityDecorationsState,
  oldDoc: ProseNode,
  newDoc: ProseNode,
): ThemeCompatibilityDecorationsState {
  if (tr.getMeta(themeCompatibilityDecorationsPluginKey)?.type === 'rebuild') {
    return createThemeCompatibilityDecorationsState(
      newDoc,
      previous.rebuildVersion
    );
  }

  if (!tr.docChanged) {
    return previous;
  }

  const mayAffectDecorations = transactionMayAffectThemeCompatibilityDecorations(oldDoc, newDoc, tr);
  if (!mayAffectDecorations) {
    return {
      decorationCount: previous.decorationCount,
      decorationMaxTo: previous.decorationMaxTo,
      decorations: previous.decorations.map(tr.mapping, newDoc),
      rebuildVersion: previous.rebuildVersion,
    };
  }

  if (transactionChangesAfterThemeCompatibilityDecorations(tr, previous.decorationMaxTo)) {
    return {
      decorationCount: previous.decorationCount,
      decorationMaxTo: previous.decorationMaxTo,
      decorations: previous.decorations,
      rebuildVersion: previous.rebuildVersion + 1,
    };
  }

  if (previous.decorationCount >= MAX_THEME_COMPATIBILITY_LIVE_MAP_DECORATIONS) {
    return {
      decorationCount: 0,
      decorationMaxTo: 0,
      decorations: DecorationSet.empty,
      rebuildVersion: previous.rebuildVersion + 1,
    };
  }

  return {
    decorationCount: previous.decorationCount,
    decorationMaxTo: previous.decorationMaxTo,
    decorations: previous.decorations.map(tr.mapping, newDoc),
    rebuildVersion: previous.rebuildVersion + 1,
  };
}

export const themeCompatibilityDecorationsPlugin = $prose(() => {
  return new Plugin({
    key: themeCompatibilityDecorationsPluginKey,
    state: {
      init(_config, state) {
        return createThemeCompatibilityDecorationsState(state.doc, 0);
      },
      apply(tr, previous, oldState, newState) {
        return applyThemeCompatibilityDecorationsState(tr, previous, oldState.doc, newState.doc);
      },
    },
    view(editorView: EditorView) {
      let currentView = editorView;
      let lastScheduledRebuildVersion =
        themeCompatibilityDecorationsPluginKey.getState(editorView.state)?.rebuildVersion ?? 0;
      const scrollRoot = editorView.dom.closest<HTMLElement>('[data-note-scroll-root="true"]');
      const controller = createThemeCompatibilityDecorationRebuildController({
        dispatchRebuild: () => {
          if (scrollRoot?.dataset.overlayScrollbarInteracting === 'true') {
            controller.schedule();
            return;
          }
          currentView.dispatch(
            currentView.state.tr
              .setMeta(themeCompatibilityDecorationsPluginKey, REBUILD_THEME_COMPATIBILITY_DECORATIONS_META)
              .setMeta('addToHistory', false)
          );
        },
      });
      const deferPendingRebuild = () => {
        controller.deferIfPending();
      };
      const handleScrollIdle = () => {
        if (scrollRoot?.dataset.overlayScrollbarInteracting === 'true') {
          return;
        }
        controller.flushIfPending();
      };
      editorView.dom.addEventListener('editor:block-user-input', deferPendingRebuild);
      editorView.dom.addEventListener('editor:image-user-input', deferPendingRebuild);
      scrollRoot?.addEventListener('scroll', deferPendingRebuild, { passive: true });
      window.addEventListener(OVERLAY_SCROLL_IDLE_EVENT, handleScrollIdle);
      for (const eventName of THEME_COMPATIBILITY_USER_INPUT_EVENTS) {
        editorView.dom.addEventListener(eventName, deferPendingRebuild, true);
      }

      return {
        update(nextView, prevState) {
          currentView = nextView;
          if (!prevState) {
            controller.schedule();
            return;
          }
          if (prevState.doc.eq(nextView.state.doc)) {
            return;
          }
          const pluginState = themeCompatibilityDecorationsPluginKey.getState(nextView.state);
          if (!pluginState || pluginState.rebuildVersion === lastScheduledRebuildVersion) {
            return;
          }
          lastScheduledRebuildVersion = pluginState.rebuildVersion;
          controller.schedule();
        },
        destroy() {
          editorView.dom.removeEventListener('editor:block-user-input', deferPendingRebuild);
          editorView.dom.removeEventListener('editor:image-user-input', deferPendingRebuild);
          scrollRoot?.removeEventListener('scroll', deferPendingRebuild);
          window.removeEventListener(OVERLAY_SCROLL_IDLE_EVENT, handleScrollIdle);
          for (const eventName of THEME_COMPATIBILITY_USER_INPUT_EVENTS) {
            editorView.dom.removeEventListener(eventName, deferPendingRebuild, true);
          }
          controller.destroy();
        },
      };
    },
    props: {
      decorations(state) {
        return themeCompatibilityDecorationsPluginKey.getState(state)?.decorations ?? DecorationSet.empty;
      },
    },
  });
});

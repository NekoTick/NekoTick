import { Plugin } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { $prose } from '@milkdown/kit/utils';
import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import {
  buildEditorFindMatches,
  resolveEditorFindIndexAfterDocChange,
  resolveEditorFindStartIndex,
} from './editorFindMatches';
import { publishEditorFindSnapshot } from './editorFindBridge';
import { editorFindPluginKey } from './editorFindKey';
import {
  createEditorFindState,
  EMPTY_DECORATIONS,
  EMPTY_STATE,
  type EditorFindPluginMeta,
  type EditorFindPluginState,
} from './editorFindState';

export const EDITOR_FIND_ACTIVE_CLASS = 'editor-find-active';

export function syncEditorFindActiveClass(view: EditorView, state: EditorFindPluginState) {
  view.dom.classList.toggle(EDITOR_FIND_ACTIVE_CLASS, state.query.length > 0);
}

class EditorFindPluginView {
  constructor(private view: EditorView) {
    this.publish();
  }

  update(view: EditorView) {
    this.view = view;
    this.publish();
  }

  destroy() {
    this.view.dom.classList.remove(EDITOR_FIND_ACTIVE_CLASS);
    publishEditorFindSnapshot(null, null);
  }

  private publish() {
    const state = editorFindPluginKey.getState(this.view.state) ?? EMPTY_STATE;
    syncEditorFindActiveClass(this.view, state);
    publishEditorFindSnapshot(this.view, state);
  }
}

export const editorFindPlugin = $prose(
  () =>
    new Plugin<EditorFindPluginState>({
      key: editorFindPluginKey,
      state: {
        init() {
          return EMPTY_STATE;
        },
        apply(tr, value, _oldState, newState) {
          const meta = tr.getMeta(editorFindPluginKey) as EditorFindPluginMeta | undefined;

          if (meta?.type === 'clear') {
            return EMPTY_STATE;
          }

          if (meta?.type === 'set-query') {
            if (meta.query.length === 0) {
              return EMPTY_STATE;
            }

            const matches = buildEditorFindMatches(newState.doc as ProseNode, meta.query);
            const activeIndex = resolveEditorFindStartIndex(matches, meta.preferredFrom);
            return createEditorFindState(newState.doc as ProseNode, meta.query, matches, activeIndex);
          }

          if (meta?.type === 'set-active-index') {
            if (value.matches.length === 0) {
              return value.query.length === 0
                ? EMPTY_STATE
                : createEditorFindState(newState.doc as ProseNode, value.query, [], -1);
            }

            return createEditorFindState(
              newState.doc as ProseNode,
              value.query,
              value.matches,
              meta.activeIndex,
            );
          }

          if (!tr.docChanged || value.query.length === 0) {
            return value;
          }

          const matches = buildEditorFindMatches(newState.doc as ProseNode, value.query);
          const previousMatch = value.activeIndex >= 0 ? value.matches[value.activeIndex] ?? null : null;
          const activeIndex = resolveEditorFindIndexAfterDocChange(
            matches,
            previousMatch,
            newState.selection.from,
          );

          return createEditorFindState(newState.doc as ProseNode, value.query, matches, activeIndex);
        },
      },
      props: {
        decorations(state) {
          return editorFindPluginKey.getState(state)?.decorations ?? EMPTY_DECORATIONS;
        },
      },
      view(view) {
        return new EditorFindPluginView(view);
      },
    }),
);

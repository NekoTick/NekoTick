import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import { closeHistory } from '@milkdown/kit/prose/history';
import { EditorState, type Plugin } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { EDITOR_HISTORY_NOTE_CACHE_LIMIT } from './editorHistoryPolicy';

const HISTORY_PLUGIN_KEY = 'history$';

export interface CachedNoteEditorHistory {
  doc: ProseNode;
  historyState: unknown;
  markdown: string;
}

export interface NoteEditorHistorySession {
  entries: Map<string, CachedNoteEditorHistory>;
  emptyHistoryState: unknown;
  historyPlugin: Plugin;
}

export function createNoteEditorHistorySession(
  view: EditorView,
): NoteEditorHistorySession | null {
  const historyPlugin = view.state.plugins.find(
    (plugin: Plugin) => plugin.key === HISTORY_PLUGIN_KEY,
  );
  if (!historyPlugin) {
    return null;
  }

  const emptyState = EditorState.create({
    doc: view.state.doc,
    plugins: [historyPlugin],
  });

  return {
    entries: new Map(),
    emptyHistoryState: historyPlugin.getState(emptyState),
    historyPlugin,
  };
}

export function cacheCurrentNoteEditorHistory(
  view: EditorView,
  session: NoteEditorHistorySession,
  notePath: string,
  markdown: string,
): void {
  view.dispatch(
    closeHistory(view.state.tr).setMeta('addToHistory', false),
  );

  session.entries.delete(notePath);
  session.entries.set(notePath, {
    doc: view.state.doc,
    historyState: session.historyPlugin.getState(view.state),
    markdown,
  });

  const oldestPath = session.entries.keys().next().value as string | undefined;
  if (session.entries.size > EDITOR_HISTORY_NOTE_CACHE_LIMIT && oldestPath) {
    session.entries.delete(oldestPath);
  }
}

export function restoreEditorHistoryState(
  view: EditorView,
  session: NoteEditorHistorySession,
  historyState: unknown,
): void {
  view.dispatch(
    view.state.tr
      .setMeta('addToHistory', false)
      .setMeta(session.historyPlugin, { historyState }),
  );
}

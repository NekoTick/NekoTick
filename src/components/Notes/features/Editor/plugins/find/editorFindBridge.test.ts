import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getEditorFindSnapshot,
  publishEditorFindSnapshot,
  subscribeEditorFindSnapshot,
} from './editorFindBridge';
import { EMPTY_DECORATIONS, type EditorFindPluginState } from './editorFindState';
import {
  EDITOR_FIND_ACTIVE_CLASS,
  syncEditorFindActiveClass,
} from './editorFindPlugin';

function createState(overrides: Partial<EditorFindPluginState> = {}): EditorFindPluginState {
  return {
    query: '',
    matches: [],
    activeIndex: -1,
    decorations: EMPTY_DECORATIONS,
    ...overrides,
  };
}

describe('editorFindBridge', () => {
  afterEach(() => {
    publishEditorFindSnapshot(null, null);
  });

  it('does not notify subscribers when the published snapshot is unchanged', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeEditorFindSnapshot(listener);
    const view = { id: 'editor-view' } as never;
    const state = createState();

    publishEditorFindSnapshot(view, state);
    expect(listener).toHaveBeenCalledTimes(1);
    const snapshot = getEditorFindSnapshot();

    publishEditorFindSnapshot(view, state);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(getEditorFindSnapshot()).toBe(snapshot);
    unsubscribe();
  });

  it('reuses the empty matches snapshot for equivalent empty find states', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeEditorFindSnapshot(listener);
    const view = { id: 'editor-view' } as never;

    publishEditorFindSnapshot(view, createState());
    expect(listener).toHaveBeenCalledTimes(1);
    const snapshot = getEditorFindSnapshot();

    publishEditorFindSnapshot(view, createState({ matches: [] }));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(getEditorFindSnapshot()).toBe(snapshot);
    unsubscribe();
  });

  it('marks the editor root while a find query is active', () => {
    const dom = document.createElement('div');
    const view = { dom } as never;

    syncEditorFindActiveClass(view, createState({ query: 'needle' }));
    expect(dom.classList.contains(EDITOR_FIND_ACTIVE_CLASS)).toBe(true);

    syncEditorFindActiveClass(view, createState());
    expect(dom.classList.contains(EDITOR_FIND_ACTIVE_CLASS)).toBe(false);
  });
});

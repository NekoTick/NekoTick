import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMilkdownEditorActivation } from './useMilkdownEditorActivation';

const mocks = vi.hoisted(() => ({
  currentEditorView: null as unknown,
  clearCurrentEditorBlockPositionSnapshot: vi.fn(),
  clearCurrentMarkdownRuntime: vi.fn(),
  createCurrentEditorBlockPositionController: vi.fn(() => ({ destroy: vi.fn() })),
  setCurrentEditorBlockSelectionClearer: vi.fn(),
  setCurrentEditorView: vi.fn(),
}));

vi.mock('./utils/editorViewRegistry', () => ({
  clearCurrentMarkdownRuntime: mocks.clearCurrentMarkdownRuntime,
  getCurrentEditorView: () => mocks.currentEditorView,
  setCurrentEditorBlockSelectionClearer: mocks.setCurrentEditorBlockSelectionClearer,
  setCurrentEditorView: mocks.setCurrentEditorView,
}));

vi.mock('./utils/editorBlockPositionCache', () => ({
  clearCurrentEditorBlockPositionSnapshot: mocks.clearCurrentEditorBlockPositionSnapshot,
  createCurrentEditorBlockPositionController: mocks.createCurrentEditorBlockPositionController,
}));

vi.mock('./plugins/cursor/blockSelectionPluginState', () => ({
  clearBlockSelection: vi.fn(),
}));

vi.mock('./plugins/cursor/leadingEmptyParagraphBackspace', () => ({
  handleLeadingEmptyParagraphBackspace: vi.fn(() => false),
}));

vi.mock('./milkdownEditorMarkdownReplacement', () => ({
  normalizeInitialEditorSelection: vi.fn(),
}));

function createArgs() {
  return {
    activeRef: { current: true },
    activatedEditorRef: { current: null },
    activationCleanupRef: { current: null },
    createUserInputMarker: vi.fn(() => vi.fn()),
    currentNoteContentRef: { current: '# Note' },
    currentNoteDiskRevision: 1,
    currentNotePath: 'note.md',
    onEditorViewReadyRef: { current: vi.fn() },
    readyReportedRef: { current: null },
    setActivatedRevision: vi.fn(),
  };
}

afterEach(() => {
  mocks.currentEditorView = null;
  vi.clearAllMocks();
});

describe('useMilkdownEditorActivation readiness', () => {
  it('ignores a readiness callback for a destroyed editor', () => {
    const args = createArgs();
    const getContext = vi.fn(() => {
      throw new Error('Context "editorView" not found');
    });
    const editor = { status: 'Destroyed', ctx: { get: getContext } };

    const { result } = renderHook(() => useMilkdownEditorActivation(args));

    act(() => {
      result.current.reportEditorReady(editor);
    });

    expect(getContext).not.toHaveBeenCalled();
    expect(args.onEditorViewReadyRef.current).not.toHaveBeenCalled();
  });

  it('ignores a readiness callback from a stale editor view', () => {
    const args = createArgs();
    const view = {};
    const currentView = {};
    const editor = { status: 'Created', ctx: { get: vi.fn(() => view) } };
    mocks.currentEditorView = currentView;

    const { result } = renderHook(() => useMilkdownEditorActivation(args));

    act(() => {
      result.current.reportEditorReady(editor);
    });

    expect(args.onEditorViewReadyRef.current).not.toHaveBeenCalled();
    expect(args.readyReportedRef.current).toBeNull();
  });

  it('reports readiness for the current created editor view', () => {
    const args = createArgs();
    const view = {};
    const editor = { status: 'Created', ctx: { get: vi.fn(() => view) } };
    args.activatedEditorRef.current = editor;
    mocks.currentEditorView = view;

    const { result } = renderHook(() => useMilkdownEditorActivation(args));

    act(() => {
      result.current.reportEditorReady(editor);
    });

    expect(args.onEditorViewReadyRef.current).toHaveBeenCalledOnce();
    expect(args.readyReportedRef.current).toMatchObject({
      editor,
      path: 'note.md',
      diskRevision: 1,
      content: '# Note',
    });
  });

  it('ignores readiness before the editor has been activated', () => {
    const args = createArgs();
    const view = {};
    const editor = { status: 'Created', ctx: { get: vi.fn(() => view) } };
    mocks.currentEditorView = view;

    const { result } = renderHook(() => useMilkdownEditorActivation(args));

    act(() => {
      result.current.reportEditorReady(editor);
    });

    expect(args.onEditorViewReadyRef.current).not.toHaveBeenCalled();
    expect(args.readyReportedRef.current).toBeNull();
  });
});

describe('useMilkdownEditorActivation activation', () => {
  it('reports a missing editor context without leaving the editor activated', () => {
    const failure = new Error('Context "editorView" not found');
    const args = {
      ...createArgs(),
      onEditorActivationFailure: vi.fn(),
    };
    const editor = {
      status: 'Created',
      ctx: { get: vi.fn(() => { throw failure; }) },
    };

    const { result } = renderHook(() => useMilkdownEditorActivation(args));

    act(() => {
      result.current.activateEditor(editor);
    });

    expect(args.onEditorActivationFailure).toHaveBeenCalledWith(failure);
    expect(args.activatedEditorRef.current).toBeNull();
    expect(args.activationCleanupRef.current).toBeNull();
  });

  it('does not activate an editor after the view becomes inactive', () => {
    const args = createArgs();
    args.activeRef.current = false;
    const getContext = vi.fn();
    const editor = { status: 'Created', ctx: { get: getContext } };

    const { result } = renderHook(() => useMilkdownEditorActivation(args));

    act(() => {
      result.current.activateEditor(editor);
    });

    expect(getContext).not.toHaveBeenCalled();
    expect(args.activatedEditorRef.current).toBeNull();
  });
});

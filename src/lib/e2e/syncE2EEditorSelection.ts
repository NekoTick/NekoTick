import { TextSelection } from '@milkdown/kit/prose/state';
import { getCurrentEditorView } from '@/components/Notes/features/Editor/utils/editorViewRegistry';
import { collectSelectableBlockTargets } from '@/components/Notes/features/Editor/plugins/cursor/blockUnitResolver';
import { getFreshCachedEditorBlockTargets } from '@/components/Notes/features/Editor/utils/editorBlockPositionCache';
import { floatingToolbarKey } from '@/components/Notes/features/Editor/plugins/floating-toolbar/floatingToolbarKey';
import { clearFormatPreview } from '@/components/Notes/features/Editor/plugins/floating-toolbar/previewStyles';
import { TOOLBAR_ACTIONS } from '@/components/Notes/features/Editor/plugins/floating-toolbar/types';
import type { EditorSelectionSummary } from './syncE2EBridgeTypes';

export function findEditorTextRange(text: string, anchorText?: string): { from: number; to: number } | null {
  const view = getCurrentEditorView();
  if (!view || !text) return null;

  const ranges: Array<{ from: number; to: number }> = [];
  view.state.doc.descendants((node, pos) => {
    if (!node.isText || typeof node.text !== 'string') {
      return undefined;
    }

    const index = node.text.indexOf(text);
    if (index < 0) {
      return undefined;
    }

    const from = pos + index;
    const to = from + text.length;
    if (view.state.doc.textBetween(from, to, '\n') === text) {
      ranges.push({ from, to });
      if (!anchorText) {
        return false;
      }
    }
    return undefined;
  });

  if (!ranges.length) {
    return null;
  }
  if (!anchorText) {
    return ranges[0] ?? null;
  }

  const docText = view.state.doc.textBetween(0, view.state.doc.content.size, '\n');
  const anchorDocIndex = docText.lastIndexOf(anchorText);
  if (anchorDocIndex < 0) {
    return ranges[0] ?? null;
  }

  let bestRange = ranges[0] ?? null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of ranges) {
    const prefix = view.state.doc.textBetween(0, candidate.from, '\n');
    const distance = Math.abs(prefix.length - anchorDocIndex);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestRange = candidate;
    }
  }
  return bestRange;
}

export function getEditorSelectionSummary(): EditorSelectionSummary | null {
  const view = getCurrentEditorView();
  if (!view) return null;

  const { from, to, empty } = view.state.selection;
  return {
    from,
    to,
    empty,
    selectedText: from < to ? view.state.doc.textBetween(from, to, '\n') : '',
    docTextLength: view.state.doc.content.size,
  };
}

export async function setEditorSelectionRange(
  from: number,
  to = from,
): Promise<EditorSelectionSummary | null> {
  const view = getCurrentEditorView();
  if (!view) return null;

  clearFormatPreview(view);
  window.focus();
  view.dom.focus({ preventScroll: true });
  view.focus();
  view.dispatch(
    view.state.tr
      .setSelection(TextSelection.create(view.state.doc, from, to))
      .setMeta(floatingToolbarKey, { type: TOOLBAR_ACTIONS.HIDE })
      .scrollIntoView()
  );
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  return getEditorSelectionSummary();
}

export function getEditorToolbarDebugState() {
  const view = getCurrentEditorView();
  const toolbarState = view ? floatingToolbarKey.getState(view.state) : null;
  const toolbar = document.querySelector<HTMLElement>('.floating-toolbar');
  const rect = toolbar?.getBoundingClientRect();
  const activeElement = document.activeElement;

  return {
    selection: getEditorSelectionSummary(),
    activeElement: activeElement instanceof HTMLElement
      ? {
          tagName: activeElement.tagName,
          className: activeElement.className,
          isEditor: activeElement === view?.dom || activeElement.closest('.ProseMirror') === view?.dom,
        }
      : null,
    toolbarState: toolbarState
      ? {
          isVisible: toolbarState.isVisible,
          subMenu: toolbarState.subMenu,
          copied: toolbarState.copied,
          selectionRange: toolbarState.selectionRange,
        }
      : null,
    toolbarDoms: Array.from(document.querySelectorAll<HTMLElement>('.floating-toolbar')).map((element) => {
      const elementRect = element.getBoundingClientRect();
      return {
        className: element.className,
        text: element.textContent?.replace(/\s+/g, ' ').trim().slice(0, 200) ?? '',
        rect: {
          x: elementRect.x,
          y: elementRect.y,
          width: elementRect.width,
          height: elementRect.height,
        },
      };
    }),
    toolbarDom: {
      exists: Boolean(toolbar),
      className: toolbar?.className ?? '',
      text: toolbar?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 200) ?? '',
      rect: rect
        ? {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          }
        : null,
    },
  };
}

export function editorTextHasMark(text: string, markName: string, anchorText?: string): boolean {
  const view = getCurrentEditorView();
  const range = findEditorTextRange(text, anchorText);
  if (!view || !range) return false;

  const markType = view.state.schema.marks[markName];
  if (!markType) return false;

  return view.state.doc.rangeHasMark(range.from, range.to, markType);
}

export function getSelectableBlockTargetsForE2E(view: NonNullable<ReturnType<typeof getCurrentEditorView>>) {
  const scrollRoot = view.dom.closest('[data-note-scroll-root="true"]') as HTMLElement | null;
  return getFreshCachedEditorBlockTargets(view, scrollRoot) ?? collectSelectableBlockTargets(view);
}

export function getSelectableBlockRangeTextForE2E(
  view: NonNullable<ReturnType<typeof getCurrentEditorView>>,
  range: { from: number; to: number },
): string {
  try {
    return view.state.doc.textBetween(range.from, range.to, '\n', '\n').trim();
  } catch {
    return '';
  }
}

export async function focusCurrentEditor(): Promise<boolean> {
  const view = getCurrentEditorView();
  if (!view) return false;

  const hasEditorFocus = () => {
    const selection = document.getSelection();
    const selectionInEditor = Boolean(
      selection &&
      ((selection.anchorNode && view.dom.contains(selection.anchorNode)) ||
        (selection.focusNode && view.dom.contains(selection.focusNode)))
    );
    return (
      document.activeElement === view.dom ||
      view.dom.contains(document.activeElement) ||
      view.hasFocus() ||
      selectionInEditor
    );
  };

  clearFormatPreview(view);
  window.focus();
  view.dom.focus({ preventScroll: true });
  view.focus();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  return hasEditorFocus();
}

export async function focusCurrentEditorAtEnd(): Promise<boolean> {
  const view = getCurrentEditorView();
  if (!view) return false;

  const hasEditorFocus = () => {
    const selection = document.getSelection();
    const selectionInEditor = Boolean(
      selection &&
      ((selection.anchorNode && view.dom.contains(selection.anchorNode)) ||
        (selection.focusNode && view.dom.contains(selection.focusNode)))
    );
    return (
      document.activeElement === view.dom ||
      view.dom.contains(document.activeElement) ||
      view.hasFocus() ||
      selectionInEditor
    );
  };

  clearFormatPreview(view);
  if (document.activeElement instanceof HTMLElement && document.activeElement !== view.dom) {
    document.activeElement.blur();
  }
  window.focus();
  view.dom.focus({ preventScroll: true });
  view.focus();
  const { doc, schema } = view.state;
  const paragraph = schema.nodes.paragraph;
  let tr = view.state.tr;
  if (paragraph) {
    const insertPos = doc.content.size;
    tr = tr
      .insert(insertPos, paragraph.create())
      .setSelection(TextSelection.create(tr.doc, insertPos + 1));
  } else {
    tr = tr.setSelection(TextSelection.atEnd(tr.doc));
  }
  tr = tr
    .setMeta(floatingToolbarKey, { type: TOOLBAR_ACTIONS.HIDE })
    .setStoredMarks(null)
    .scrollIntoView();
  view.dispatch(tr);
  view.dom.focus({ preventScroll: true });
  view.focus();
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  if (!hasEditorFocus()) {
    view.dom.focus({ preventScroll: true });
    view.focus();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  return hasEditorFocus();
}

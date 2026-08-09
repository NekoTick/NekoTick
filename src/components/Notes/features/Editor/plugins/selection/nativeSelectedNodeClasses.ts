import { NodeSelection, Plugin, PluginKey } from '@milkdown/kit/prose/state';
import type { EditorState } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { $prose } from '@milkdown/kit/utils';
import {
  MARKDOWN_BLANK_LINE_VALUE,
  RENDERED_HTML_BOUNDARY_BLANK_LINE_VALUE,
} from '../cursor/markdownBlankLineShared';

export const NATIVE_SELECTED_TEXTLIKE_CLASS = 'editor-native-selected-textlike';
export const NATIVE_SELECTED_HAS_NEXT_CLASS = 'editor-native-selected-has-next';
export const NATIVE_SELECTED_HAS_PREVIOUS_CLASS = 'editor-native-selected-has-previous';
export const TABLE_BLOCK_ZERO_MIN_WIDTH_CLASS = 'editor-table-block-zero-min-width';

export const nativeSelectedNodeClassesPluginKey = new PluginKey('nativeSelectedNodeClasses');

const NATIVE_SELECTED_NODE_SELECTOR = '.ProseMirror-selectednode';
const TABLE_BLOCK_SELECTOR = '.milkdown-table-block';
const ZERO_MIN_WIDTH_TABLE_WRAPPER_SELECTOR = '.table-wrapper[style*="--table-block-table-min-width: 0px"]';

const TEXTLIKE_SELECTED_NODE_SELECTOR = [
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'hr',
  '.md-hr',
  'li',
  'dl',
  'dt',
  'dd',
  '.definition-list',
  '.definition-term',
  '.definition-desc',
  '.footnote-def',
  '.toc-block',
  '.callout',
  `[data-type='html-block'][data-value='${MARKDOWN_BLANK_LINE_VALUE}']`,
  `[data-type='html-block'][data-value='${RENDERED_HTML_BOUNDARY_BLANK_LINE_VALUE}']`,
].join(',');

const RICH_DIRECT_CHILD_SELECTOR = [
  '.code-block-container',
  '.image-block-container',
  '.video-block',
  "[data-type='math-block']",
  '.mermaid-block',
  '.milkdown-table-block',
].join(',');

type ClassSyncResult = {
  selectedNodes: Set<HTMLElement>;
  zeroMinWidthTables: Set<HTMLElement>;
};

function clearNativeSelectedNodeClasses(element: HTMLElement): void {
  element.classList.remove(
    NATIVE_SELECTED_TEXTLIKE_CLASS,
    NATIVE_SELECTED_HAS_NEXT_CLASS,
    NATIVE_SELECTED_HAS_PREVIOUS_CLASS,
  );
}

function hasRichDirectChild(element: HTMLElement): boolean {
  for (const child of Array.from(element.children)) {
    if (child instanceof HTMLElement && child.matches(RICH_DIRECT_CHILD_SELECTOR)) {
      return true;
    }
  }

  return false;
}

export function isNativeSelectedTextLikeElement(element: HTMLElement): boolean {
  return element.matches(TEXTLIKE_SELECTED_NODE_SELECTOR) && !hasRichDirectChild(element);
}

function syncSelectedNodeClasses(
  root: ParentNode,
  previousSelectedNodes: Set<HTMLElement>,
): Set<HTMLElement> {
  const selectedNodes = new Set(
    Array.from(root.querySelectorAll<HTMLElement>(NATIVE_SELECTED_NODE_SELECTOR)),
  );

  for (const element of previousSelectedNodes) {
    if (!selectedNodes.has(element)) {
      clearNativeSelectedNodeClasses(element);
    }
  }

  for (const element of selectedNodes) {
    clearNativeSelectedNodeClasses(element);
    if (!isNativeSelectedTextLikeElement(element)) {
      continue;
    }

    element.classList.add(NATIVE_SELECTED_TEXTLIKE_CLASS);
    if (element.nextElementSibling?.classList.contains('ProseMirror-selectednode')) {
      element.classList.add(NATIVE_SELECTED_HAS_NEXT_CLASS);
    }
    if (element.previousElementSibling?.classList.contains('ProseMirror-selectednode')) {
      element.classList.add(NATIVE_SELECTED_HAS_PREVIOUS_CLASS);
    }
  }

  return selectedNodes;
}

function syncZeroMinWidthTableClasses(
  root: ParentNode,
  previousTables: Set<HTMLElement>,
): Set<HTMLElement> {
  const zeroMinWidthTables = new Set<HTMLElement>();
  const tableBlocks = Array.from(root.querySelectorAll<HTMLElement>(TABLE_BLOCK_SELECTOR));

  for (const tableBlock of tableBlocks) {
    const hasZeroMinWidthWrapper = tableBlock.querySelector(ZERO_MIN_WIDTH_TABLE_WRAPPER_SELECTOR) !== null;
    tableBlock.classList.toggle(TABLE_BLOCK_ZERO_MIN_WIDTH_CLASS, hasZeroMinWidthWrapper);
    if (hasZeroMinWidthWrapper) {
      zeroMinWidthTables.add(tableBlock);
    }
  }

  for (const tableBlock of previousTables) {
    if (!zeroMinWidthTables.has(tableBlock) && !tableBlocks.includes(tableBlock)) {
      tableBlock.classList.remove(TABLE_BLOCK_ZERO_MIN_WIDTH_CLASS);
    }
  }

  return zeroMinWidthTables;
}

export function syncNativeSelectedNodeClasses(
  root: ParentNode,
  previous: ClassSyncResult = {
    selectedNodes: new Set<HTMLElement>(),
    zeroMinWidthTables: new Set<HTMLElement>(),
  },
): ClassSyncResult {
  return {
    selectedNodes: syncSelectedNodeClasses(root, previous.selectedNodes),
    zeroMinWidthTables: syncZeroMinWidthTableClasses(root, previous.zeroMinWidthTables),
  };
}

export function shouldSyncNativeSelectedNodeClasses(
  prevState: EditorState | null | undefined,
  nextState: EditorState,
): boolean {
  if (!prevState) {
    return true;
  }

  return (
    !prevState.doc.eq(nextState.doc)
    || prevState.selection instanceof NodeSelection
    || nextState.selection instanceof NodeSelection
  );
}

export const nativeSelectedNodeClassesPlugin = $prose(() => {
  return new Plugin({
    key: nativeSelectedNodeClassesPluginKey,
    view(editorView: EditorView) {
      let synced = syncNativeSelectedNodeClasses(editorView.dom);

      return {
        update(nextView, prevState) {
          if (!shouldSyncNativeSelectedNodeClasses(prevState, nextView.state)) {
            return;
          }
          synced = syncNativeSelectedNodeClasses(nextView.dom, synced);
        },
        destroy() {
          for (const element of synced.selectedNodes) {
            clearNativeSelectedNodeClasses(element);
          }
          for (const tableBlock of synced.zeroMinWidthTables) {
            tableBlock.classList.remove(TABLE_BLOCK_ZERO_MIN_WIDTH_CLASS);
          }
        },
      };
    },
  });
});

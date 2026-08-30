import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import { TextSelection, type Selection } from '@milkdown/kit/prose/state';
import { getBoundedTextBetween, MAX_EDITOR_SELECTION_TEXT_CHARS } from '../shared/selectionTextLimits';

const TOOLBAR_EXCLUDED_TEXT_PARENT_TYPES = new Set(['frontmatter']);
const MARKDOWN_SYNTAX_MARK_NAME = 'markdownSyntax';

function isToolbarExcludedTextParent(parent: ProseNode | null | undefined): boolean {
  return Boolean(parent && TOOLBAR_EXCLUDED_TEXT_PARENT_TYPES.has(parent.type.name));
}

function hasUsableTextNodeInRange(doc: ProseNode, from: number, to: number): boolean {
  let hasUsableText = false;
  const scanTo = Math.min(to, from + MAX_EDITOR_SELECTION_TEXT_CHARS);

  doc.nodesBetween(from, scanTo, (node, pos, parent) => {
    if (hasUsableText) {
      return false;
    }

    if (TOOLBAR_EXCLUDED_TEXT_PARENT_TYPES.has(node.type.name)) {
      return false;
    }

    if (
      isToolbarExcludedTextParent(parent)
      || !node.isText
      || !node.text
      || node.marks?.some((mark) => mark.type.name === MARKDOWN_SYNTAX_MARK_NAME)
    ) {
      return undefined;
    }

    const nodeStart = pos;
    const nodeEnd = pos + node.nodeSize;
    const selectedStart = Math.max(from, nodeStart);
    const selectedEnd = Math.min(scanTo, nodeEnd);
    if (selectedStart >= selectedEnd) {
      return undefined;
    }

    const selectedText = node.text.slice(
      Math.max(0, selectedStart - nodeStart),
      Math.max(0, selectedEnd - nodeStart)
    );
    if (selectedText.trim().length > 0) {
      hasUsableText = true;
      return false;
    }

    return undefined;
  });

  return hasUsableText;
}

export function hasUsableTextRange(doc: ProseNode, from: number, to: number): boolean {
  const docSize = doc.content.size;
  const safeFrom = Math.max(0, Math.min(from, docSize));
  const safeTo = Math.max(safeFrom, Math.min(to, docSize));
  if (safeFrom === safeTo) {
    return false;
  }
  if (typeof doc.resolve === 'function') {
    try {
      if (!doc.resolve(safeFrom).parent.inlineContent || !doc.resolve(safeTo).parent.inlineContent) {
        return false;
      }
    } catch {
      return false;
    }
  }

  if (typeof doc.nodesBetween === 'function') {
    return hasUsableTextNodeInRange(doc, safeFrom, safeTo);
  }

  return getBoundedTextBetween(doc, safeFrom, safeTo, '\n', '\n').trim().length > 0;
}

export function hasUsableLinkTextRange(doc: ProseNode, from: number, to: number): boolean {
  const docSize = doc.content.size;
  const safeFrom = Math.max(0, Math.min(from, docSize));
  const safeTo = Math.max(safeFrom, Math.min(to, docSize));
  // Lightweight toolbar tests and integrations may only expose document size.
  // Keep their existing selection behavior; structural checks below require a
  // real ProseMirror document resolver.
  if (typeof doc.resolve !== 'function') {
    return safeFrom < safeTo;
  }
  if (!hasUsableTextRange(doc, safeFrom, safeTo)) {
    return false;
  }

  try {
    const start = doc.resolve(safeFrom);
    const end = doc.resolve(safeTo);
    if (start.parent !== end.parent) {
      return false;
    }
  } catch {
    return false;
  }

  let hasUnsupportedInlineContent = false;
  if (typeof doc.nodesBetween !== 'function') {
    return true;
  }

  doc.nodesBetween(safeFrom, safeTo, (node, pos) => {
    if (node.isInline && !node.isText) {
      const selectedStart = Math.max(safeFrom, pos);
      const selectedEnd = Math.min(safeTo, pos + node.nodeSize);
      if (selectedStart < selectedEnd) {
        hasUnsupportedInlineContent = true;
        return false;
      }
    }

    if (!node.isText || !node.text) {
      return undefined;
    }

    const selectedStart = Math.max(safeFrom, pos);
    const selectedEnd = Math.min(safeTo, pos + node.nodeSize);
    if (
      selectedStart < selectedEnd
      && node.marks.some((mark) => mark.type.name === MARKDOWN_SYNTAX_MARK_NAME)
    ) {
      hasUnsupportedInlineContent = true;
      return false;
    }

    return undefined;
  });

  return !hasUnsupportedInlineContent;
}

export function hasUsableTextSelection(selection: Selection, doc: ProseNode): selection is TextSelection {
  return (
    selection instanceof TextSelection &&
    !selection.empty &&
    hasUsableTextRange(doc, selection.from, selection.to)
  );
}

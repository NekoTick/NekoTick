import type { EditorView } from '@milkdown/kit/prose/view';
import {
  createOutlineHeadingId,
  MAX_OUTLINE_HEADING_TEXT_CHARS,
  normalizeHeadingText,
} from '../../Sidebar/Outline/outlineUtils';
import { MAX_BLOCK_POSITION_SNAPSHOT_BLOCKS } from './editorBlockPositionConstants';
import {
  resolveDocumentBottom,
  resolveDocumentTop,
} from './editorBlockPositionGeometry';
import type { EditorHeadingPositionEntry } from './editorBlockPositionTypes';

interface DocumentHeadingMetadata {
  level: number;
  text: string;
  from: number;
  to: number;
}

const STOP_DOCUMENT_HEADING_SCAN = Symbol('stopDocumentHeadingScan');

function readDocumentHeadingText(node: any): string {
  let text = '';
  if (typeof node.childCount === 'number' && typeof node.child === 'function') {
    for (let index = 0; index < node.childCount && text.length < MAX_OUTLINE_HEADING_TEXT_CHARS; index += 1) {
      const child = node.child(index);
      if (!child || child.marks?.some((mark: any) => mark.type?.name === 'markdownSyntax')) continue;
      if (typeof child.text === 'string') {
        text += child.text.slice(0, MAX_OUTLINE_HEADING_TEXT_CHARS - text.length);
      }
    }
  } else if (typeof node.textContent === 'string') {
    text = node.textContent.slice(0, MAX_OUTLINE_HEADING_TEXT_CHARS);
  }
  return normalizeHeadingText(text);
}

export function collectDocumentHeadingMetadata(doc: any): DocumentHeadingMetadata[] | null {
  if (typeof doc.descendants !== 'function') return null;
  const headings: DocumentHeadingMetadata[] = [];
  try {
    doc.descendants((node: any, pos: number) => {
      if (node.type?.name !== 'heading') return true;
      const level = Number(node.attrs?.level);
      if (!Number.isInteger(level) || level < 1 || level > 6) return false;
      headings.push({
        level,
        text: readDocumentHeadingText(node),
        from: pos,
        to: pos + node.nodeSize,
      });
      if (headings.length >= MAX_BLOCK_POSITION_SNAPSHOT_BLOCKS) {
        throw STOP_DOCUMENT_HEADING_SCAN;
      }
      return false;
    });
  } catch (error) {
    if (error !== STOP_DOCUMENT_HEADING_SCAN) throw error;
  }
  return headings;
}

function resolveTopLevelPos(view: EditorView, pos: number): number {
  try {
    const resolved = view.state.doc.resolve(pos);
    return resolved.depth > 0 ? resolved.before(1) : pos;
  } catch {
    return pos;
  }
}

export function collectDocumentHeadingPositions(
  view: EditorView,
  scrollRootTop: number | null,
  scrollTop: number,
): EditorHeadingPositionEntry[] | null {
  const metadata = collectDocumentHeadingMetadata(view.state.doc);
  if (!metadata) return null;

  return metadata.map((heading, index): EditorHeadingPositionEntry => {
    const directElement = view.nodeDOM(heading.from);
    const isDirectHeading = directElement instanceof HTMLElement
      && view.dom.contains(directElement)
      && /^H[1-6]$/.test(directElement.tagName);
    const fallbackElement = isDirectHeading
      ? directElement
      : view.nodeDOM(resolveTopLevelPos(view, heading.from));
    const element = fallbackElement instanceof HTMLElement && view.dom.contains(fallbackElement)
      ? fallbackElement
      : null;
    const rect = element?.getBoundingClientRect() ?? null;
    const hasExactGeometry = Boolean(isDirectHeading && rect && rect.width > 0 && rect.height > 0);
    return {
      ...heading,
      id: createOutlineHeadingId(index, heading.level, heading.text),
      element,
      hasExactGeometry,
      top: rect ? resolveDocumentTop(rect, scrollRootTop, scrollTop) : 0,
      bottom: rect ? resolveDocumentBottom(rect, scrollRootTop, scrollTop) : 0,
    };
  });
}

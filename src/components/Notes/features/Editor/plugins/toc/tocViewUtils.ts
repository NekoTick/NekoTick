import type { TocItem } from './types';
import { translate } from '@/lib/i18n';
import {
  STOP_PROSE_SCAN,
  scanProseDescendants,
  type BoundedProseScanNode,
} from '../shared/boundedProseNodeScan';

export const MAX_TOC_VIEW_HEADINGS = 512;
export const MAX_TOC_VIEW_HEADING_TEXT_CHARS = 240;
const TOC_MAX_LEVEL_PATTERN = /^\d{1,2}$/;

export function getTocEmptyText(): string {
  return translate('editor.tocEmpty');
}

export function normalizeTocMaxLevel(value: unknown): number {
  const parsed = typeof value === 'string'
    ? TOC_MAX_LEVEL_PATTERN.test(value.trim())
      ? Number(value.trim())
      : Number.NaN
    : value;
  return typeof parsed === 'number' && Number.isFinite(parsed)
    ? Math.max(1, Math.min(6, Math.trunc(parsed)))
    : 6;
}

function normalizeHeadingLevel(value: unknown, maxLevel: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  const level = Math.max(1, Math.min(6, Math.trunc(value)));
  return level <= maxLevel ? level : null;
}

export function readBoundedTocHeadingText(node: BoundedProseScanNode): string {
  if (typeof node.childCount === 'number' && typeof node.child === 'function') {
    let text = '';
    for (let index = 0; index < node.childCount && text.length < MAX_TOC_VIEW_HEADING_TEXT_CHARS; index += 1) {
      const child = node.child(index);
      if (!child || child.marks?.some((mark) => mark.type?.name === 'markdownSyntax')) continue;
      if (typeof child.text === 'string') {
        text += child.text.slice(0, MAX_TOC_VIEW_HEADING_TEXT_CHARS - text.length);
      }
    }
    return text;
  }

  const size = node.content?.size;
  if (typeof size === 'number' && Number.isFinite(size) && size >= 0 && typeof node.textBetween === 'function') {
    return node.textBetween(0, Math.min(size, MAX_TOC_VIEW_HEADING_TEXT_CHARS), '', '');
  }

  if (typeof node.text === 'string') {
    return node.text.slice(0, MAX_TOC_VIEW_HEADING_TEXT_CHARS);
  }

  const text = node.textContent;
  return typeof text === 'string' ? text.slice(0, MAX_TOC_VIEW_HEADING_TEXT_CHARS) : '';
}

export function extractHeadings(doc: BoundedProseScanNode, maxLevel = 6): TocItem[] {
  const headings: TocItem[] = [];
  const normalizedMaxLevel = normalizeTocMaxLevel(maxLevel);

  scanProseDescendants(doc, (node, pos) => {
    if (headings.length >= MAX_TOC_VIEW_HEADINGS) {
      return STOP_PROSE_SCAN;
    }

    if (node.type?.name !== 'heading') {
      return true;
    }

    const level = normalizeHeadingLevel(node.attrs?.level, normalizedMaxLevel);
    if (level === null) {
      return true;
    }

    const text = readBoundedTocHeadingText(node);
    if (!text.trim()) {
      return true;
    }

    headings.push({
      level,
      text,
      id: `heading-${pos}`,
      pos,
    });

    return headings.length < MAX_TOC_VIEW_HEADINGS ? true : STOP_PROSE_SCAN;
  });

  return headings;
}

export function createHeadingsSignature(headings: readonly TocItem[]): string {
  return headings
    .map((heading) => `${heading.pos}:${heading.level}:${heading.text}`)
    .join('|');
}

export function renderTocContent(contentEl: HTMLElement, headings: readonly TocItem[], maxLevel: number): void {
  const doc = contentEl.ownerDocument;
  const normalizedMaxLevel = normalizeTocMaxLevel(maxLevel);
  const scopedHeadings = headings
    .filter((heading) => heading.level <= normalizedMaxLevel)
    .slice(0, MAX_TOC_VIEW_HEADINGS);

  if (scopedHeadings.length === 0) {
    const empty = doc.createElement('div');
    empty.className = 'toc-empty md-toc-empty';
    empty.textContent = getTocEmptyText();
    contentEl.replaceChildren(empty);
    return;
  }

  const nav = doc.createElement('nav');
  nav.className = 'toc-nav md-toc-content';
  const list = doc.createElement('ul');
  list.className = 'toc-list';
  nav.appendChild(list);

  for (const heading of scopedHeadings) {
    const item = doc.createElement('li');
    item.className = `toc-item toc-level-${heading.level} md-toc-item md-toc-h${heading.level}`;
    item.style.paddingLeft = `${(heading.level - 1) * 16}px`;

    const link = doc.createElement('a');
    link.className = 'toc-link md-toc-inner';
    link.href = '#';
    link.dataset.headingPos = String(heading.pos);
    link.textContent = heading.text;

    item.appendChild(link);
    list.appendChild(item);
  }

  contentEl.replaceChildren(nav);
}

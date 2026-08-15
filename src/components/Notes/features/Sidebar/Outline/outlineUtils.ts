import type { NotesOutlineHeading } from './types';
import { translate } from '@/lib/i18n';

export const MAX_OUTLINE_HEADING_TEXT_CHARS = 512;

export function getOutlineFallbackText(): string {
  return translate('notes.untitled');
}

export function getHeadingLevelFromTagName(tagName: string): number | null {
  const normalized = tagName.toLowerCase();
  if (!/^h[1-6]$/.test(normalized)) return null;
  return Number.parseInt(normalized.slice(1), 10);
}

export function normalizeHeadingText(rawText: string): string {
  const compact = rawText.replace(/\s+/g, ' ').trim();
  return compact.length > 0 ? compact : getOutlineFallbackText();
}

export function readBoundedHeadingText(element: HTMLElement): string {
  let text = '';
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);

  for (
    let node = walker.nextNode();
    node && text.length < MAX_OUTLINE_HEADING_TEXT_CHARS;
    node = walker.nextNode()
  ) {
    if (node.parentElement?.closest('[data-markdown-syntax]')) continue;
    const value = node.nodeValue ?? '';
    if (value.length === 0) continue;
    const remaining = MAX_OUTLINE_HEADING_TEXT_CHARS - text.length;
    text += value.length > remaining ? value.slice(0, remaining) : value;
  }

  return normalizeHeadingText(text);
}

function slugifyHeadingText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 32);
}

export function createOutlineHeadingId(index: number, level: number, text: string): string {
  const slug = slugifyHeadingText(text);
  const suffix = slug.length > 0 ? slug : 'heading';
  return `outline-${index}-h${level}-${suffix}`;
}

export function areOutlineHeadingsEqual(
  previous: NotesOutlineHeading[],
  next: NotesOutlineHeading[],
): boolean {
  if (previous.length !== next.length) return false;
  for (let index = 0; index < previous.length; index += 1) {
    const left = previous[index];
    const right = next[index];
    if (!left || !right) return false;
    if (
      left.id !== right.id ||
      left.level !== right.level ||
      left.text !== right.text ||
      left.from !== right.from ||
      left.to !== right.to
    ) {
      return false;
    }
  }
  return true;
}

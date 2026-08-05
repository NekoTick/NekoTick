import { sanitizeGithubStyle } from '@/lib/notes/markdown/githubHtmlPolicy';

const CLIPBOARD_SEMANTIC_STYLE_PROPERTIES = new Set([
  'font-style',
  'font-weight',
  'text-decoration',
]);
const CLIPBOARD_TABLE_ALIGNMENTS = new Set(['left', 'center', 'right']);
const CLIPBOARD_TEXT_DECORATION_LINES = new Set(['line-through', 'underline']);

export function isHiddenClipboardElement(element: Element): boolean {
  if (element.hasAttribute('hidden')) return true;
  if (!(element instanceof HTMLElement)) return false;

  const display = element.style.display.trim().toLowerCase();
  const visibility = element.style.visibility.trim().toLowerCase();
  const opacity = element.style.opacity.trim();
  const opacityValue = opacity.endsWith('%')
    ? Number(opacity.slice(0, -1)) / 100
    : Number(opacity);

  return display === 'none'
    || visibility === 'hidden'
    || visibility === 'collapse'
    || (opacity !== '' && opacityValue === 0);
}

export function isClipboardPresentationAttribute(tagName: string, attributeName: string): boolean {
  return attributeName === 'align' && (tagName === 'p' || /^h[1-6]$/.test(tagName));
}

function normalizeTextDecoration(value: string): string {
  const lines = value
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => CLIPBOARD_TEXT_DECORATION_LINES.has(token));
  return Array.from(new Set(lines)).join(' ');
}

export function applyClipboardStylePolicy(tagName: string, element: HTMLElement): void {
  for (let index = element.style.length - 1; index >= 0; index -= 1) {
    const property = element.style.item(index);
    const value = element.style.getPropertyValue(property).trim();
    const normalizedValue = value.toLowerCase();
    const isTableCellAlignment = (tagName === 'th' || tagName === 'td')
      && property === 'text-align'
      && CLIPBOARD_TABLE_ALIGNMENTS.has(normalizedValue);

    if (!CLIPBOARD_SEMANTIC_STYLE_PROPERTIES.has(property) && !isTableCellAlignment) {
      element.style.removeProperty(property);
      continue;
    }

    if (property === 'text-decoration') {
      const decoration = normalizeTextDecoration(value);
      if (!decoration) {
        element.style.removeProperty(property);
        continue;
      }
      element.style.setProperty(property, decoration);
      continue;
    }

    element.style.setProperty(property, value);
  }

  const style = sanitizeGithubStyle(element.getAttribute('style') ?? '');
  if (style) {
    element.setAttribute('style', style);
  } else {
    element.removeAttribute('style');
  }
}

export function normalizeClipboardTableAlignment(tagName: string, element: HTMLElement): void {
  if (tagName !== 'th' && tagName !== 'td') return;

  const alignment = element.getAttribute('align')?.trim().toLowerCase() ?? '';
  if (!element.style.textAlign && CLIPBOARD_TABLE_ALIGNMENTS.has(alignment)) {
    element.style.textAlign = alignment;
  }
  element.removeAttribute('align');
  applyClipboardStylePolicy(tagName, element);
}

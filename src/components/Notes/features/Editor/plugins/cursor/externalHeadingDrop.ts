const MAX_HEADING_DROP_HTML_CHARS = 64 * 1024;
const MAX_HEADING_DROP_TEXT_CHARS = 2_000;
export const MAX_HEADING_DROP_SCAN_ELEMENTS = 2_000;

export interface HeadingDropPayload {
  level: number;
  text: string;
}

function getBoundedBodyText(root: HTMLElement, maxChars: number): string | null {
  let text = '';
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement?.closest('[data-markdown-syntax]')) continue;
    text += node.textContent ?? '';
    if (text.length > maxChars) return null;
  }

  return text;
}

export function parseSingleHeadingDropHtml(html: string): HeadingDropPayload | null {
  if (!html || html.length > MAX_HEADING_DROP_HTML_CHARS) return null;

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const headings: Element[] = [];
  const walker = doc.createTreeWalker(doc.body, 1);
  let scanned = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    scanned += 1;
    if (scanned > MAX_HEADING_DROP_SCAN_ELEMENTS) return null;
    if (!(node instanceof Element) || !/^H[1-6]$/.test(node.tagName)) continue;

    headings.push(node);
    if (headings.length > 1) return null;
  }
  if (headings.length !== 1) return null;

  const heading = headings[0];
  const headingText = getBoundedBodyText(heading as HTMLElement, MAX_HEADING_DROP_TEXT_CHARS + 1);
  const text = headingText?.trim();
  if (!text || text.length > MAX_HEADING_DROP_TEXT_CHARS) return null;
  const bodyText = getBoundedBodyText(doc.body, text.length + 1);
  if (bodyText === null || bodyText.trim() !== text) return null;

  const level = Number(heading.tagName.slice(1));
  if (!Number.isInteger(level) || level < 1 || level > 6) return null;

  return { level, text };
}

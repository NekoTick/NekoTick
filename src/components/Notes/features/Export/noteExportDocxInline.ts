import { ExternalHyperlink, TextRun, type ParagraphChild } from 'docx';
import type { Definition, PhrasingContent } from 'mdast';
import { stripMarkdownInline } from '@/components/common/markdown/plainText';
import { sanitizeNoteLinkHref } from '@/lib/notes/markdown/urlSecurity';
import { createDocxImage, type DocxImageData } from './noteExportDocxImages';

interface InlineStyle {
  bold?: boolean;
  font?: string;
  italics?: boolean;
  strike?: boolean;
}

export interface DocxInlineContext {
  definitions: ReadonlyMap<string, Definition>;
  imageCache: Map<string, DocxImageData | null>;
}

function createTextRuns(text: string, style: InlineStyle = {}): ParagraphChild[] {
  return text.split('\n').map((part, index) => new TextRun({
    text: part,
    break: index > 0 ? 1 : undefined,
    ...style,
  }));
}

function createLink(
  children: readonly PhrasingContent[],
  href: string,
  context: DocxInlineContext,
  style: InlineStyle,
): ParagraphChild[] {
  const runs = createDocxInlineChildren(children, context, style);
  const safeHref = sanitizeNoteLinkHref(href);
  if (!safeHref || !/^(?:https?|mailto|weixin):/i.test(safeHref)) return runs;
  return [new ExternalHyperlink({ children: runs, link: safeHref })];
}

export function createDocxInlineChildren(
  nodes: readonly PhrasingContent[],
  context: DocxInlineContext,
  style: InlineStyle = {},
): ParagraphChild[] {
  const children: ParagraphChild[] = [];
  for (const node of nodes) {
    if (node.type === 'text') {
      children.push(...createTextRuns(node.value, style));
    } else if (node.type === 'break') {
      children.push(new TextRun({ text: '', break: 1, ...style }));
    } else if (node.type === 'inlineCode') {
      children.push(...createTextRuns(node.value, { ...style, font: 'JetBrains Mono' }));
    } else if (node.type === 'strong') {
      children.push(...createDocxInlineChildren(node.children, context, { ...style, bold: true }));
    } else if (node.type === 'emphasis') {
      children.push(...createDocxInlineChildren(node.children, context, { ...style, italics: true }));
    } else if (node.type === 'delete') {
      children.push(...createDocxInlineChildren(node.children, context, { ...style, strike: true }));
    } else if (node.type === 'link') {
      children.push(...createLink(node.children, node.url, context, style));
    } else if (node.type === 'linkReference') {
      const definition = context.definitions.get(node.identifier);
      children.push(...(definition
        ? createLink(node.children, definition.url, context, style)
        : createDocxInlineChildren(node.children, context, style)));
    } else if (node.type === 'image') {
      children.push(createDocxImage(node.url, node.alt, context.imageCache));
    } else if (node.type === 'imageReference') {
      const definition = context.definitions.get(node.identifier);
      children.push(definition
        ? createDocxImage(definition.url, node.alt, context.imageCache)
        : new TextRun(node.alt?.trim() || '[Image]'));
    } else if (node.type === 'html') {
      const text = stripMarkdownInline(node.value);
      if (text) children.push(...createTextRuns(text, style));
    }
  }
  return children;
}

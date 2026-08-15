import {
  AlignmentType,
  HeadingLevel,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type IParagraphOptions,
} from 'docx';
import type { Definition, List, PhrasingContent, RootContent, Table as MdastTable } from 'mdast';
import { stripMarkdownInline } from '@/components/common/markdown/plainText';
import { themeExportLayoutTokens } from '@/styles/themeTokens';
import { createDocxInlineChildren, type DocxInlineContext } from './noteExportDocxInline';

export type DocxBlock = Paragraph | Table;

export interface DocxBuildContext extends DocxInlineContext {
  definitions: ReadonlyMap<string, Definition>;
  nextListInstance: () => number;
  orderedListReference: string;
  reserveParagraphs: (count: number) => boolean;
}

function createParagraph(
  nodes: readonly PhrasingContent[],
  context: DocxBuildContext,
  options: IParagraphOptions = {},
): Paragraph | null {
  if (!context.reserveParagraphs(1)) return null;
  return new Paragraph({ ...options, children: createDocxInlineChildren(nodes, context) });
}

function getQuoteIndent(quoteDepth: number): IParagraphOptions {
  return quoteDepth > 0
    ? {
        indent: { left: themeExportLayoutTokens.docxQuoteIndentLeft * quoteDepth },
        spacing: {
          before: themeExportLayoutTokens.docxQuoteBeforeSpacing,
          after: themeExportLayoutTokens.docxQuoteAfterSpacing,
        },
      }
    : {};
}

function createTable(node: MdastTable, context: DocxBuildContext): Table | null {
  const cellCount = node.children.reduce((count, row) => count + row.children.length, 0);
  if (cellCount === 0 || !context.reserveParagraphs(cellCount)) return null;
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    style: 'TableGrid',
    rows: node.children.map((row, rowIndex) => new TableRow({
      tableHeader: rowIndex === 0,
      children: row.children.map((cell, columnIndex) => {
        const alignment = node.align?.[columnIndex];
        return new TableCell({
          children: [new Paragraph({
            alignment: alignment === 'center'
              ? AlignmentType.CENTER
              : alignment === 'right'
                ? AlignmentType.RIGHT
                : AlignmentType.LEFT,
            children: createDocxInlineChildren(cell.children, context, rowIndex === 0 ? { bold: true } : {}),
          })],
        });
      }),
    })),
  });
}

function createListChildren(
  node: List,
  context: DocxBuildContext,
  output: DocxBlock[],
  depth: number,
  quoteDepth: number,
): boolean {
  const instance = node.ordered ? context.nextListInstance() : undefined;
  for (const item of node.children) {
    let markerAdded = false;
    for (const child of item.children) {
      if (child.type === 'list') {
        if (!createListChildren(child, context, output, depth + 1, quoteDepth)) return false;
        continue;
      }
      if (child.type === 'paragraph') {
        const prefix = !markerAdded && item.checked !== null && item.checked !== undefined
          ? [{ type: 'text', value: item.checked ? '[x] ' : '[ ] ' } as const]
          : [];
        const paragraph = createParagraph([...prefix, ...child.children], context, {
          ...getQuoteIndent(quoteDepth),
          ...(markerAdded
            ? { indent: { left: themeExportLayoutTokens.docxListIndentPerLevel * (depth + 1) } }
            : node.ordered
              ? { numbering: { reference: context.orderedListReference, level: Math.min(depth, 8), instance } }
              : { bullet: { level: Math.min(depth, 8) } }),
        });
        if (!paragraph) return false;
        output.push(paragraph);
        markerAdded = true;
        continue;
      }
      if (!markerAdded) {
        const marker = createParagraph([], context, node.ordered
          ? { numbering: { reference: context.orderedListReference, level: Math.min(depth, 8), instance } }
          : { bullet: { level: Math.min(depth, 8) } });
        if (!marker) return false;
        output.push(marker);
        markerAdded = true;
      }
      if (!createDocxBlockChildren([child], context, output, quoteDepth)) return false;
    }
  }
  return true;
}

const HEADING_LEVELS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
] as const;

export function createDocxBlockChildren(
  nodes: readonly RootContent[],
  context: DocxBuildContext,
  output: DocxBlock[],
  quoteDepth = 0,
): boolean {
  for (const node of nodes) {
    let block: DocxBlock | null = null;
    if (node.type === 'paragraph') {
      block = createParagraph(node.children, context, getQuoteIndent(quoteDepth));
    } else if (node.type === 'heading') {
      block = createParagraph(node.children, context, {
        ...getQuoteIndent(quoteDepth),
        heading: HEADING_LEVELS[node.depth - 1],
        spacing: {
          before: themeExportLayoutTokens.docxHeadingBeforeSpacing,
          after: themeExportLayoutTokens.docxHeadingAfterSpacing,
        },
      });
    } else if (node.type === 'code') {
      if (!context.reserveParagraphs(1)) return false;
      block = new Paragraph({
        ...getQuoteIndent(quoteDepth),
        spacing: {
          before: themeExportLayoutTokens.docxCodeBeforeSpacing,
          after: themeExportLayoutTokens.docxCodeAfterSpacing,
        },
        children: [new TextRun({
          text: node.value,
          font: 'JetBrains Mono',
          size: themeExportLayoutTokens.docxCodeFontSizeHalfPoints,
        })],
      });
    } else if (node.type === 'blockquote') {
      if (!createDocxBlockChildren(node.children, context, output, quoteDepth + 1)) return false;
      continue;
    } else if (node.type === 'list') {
      if (!createListChildren(node, context, output, 0, quoteDepth)) return false;
      continue;
    } else if (node.type === 'table') {
      block = createTable(node, context);
    } else if (node.type === 'thematicBreak') {
      block = createParagraph([{ type: 'text', value: '---' }], context, getQuoteIndent(quoteDepth));
    } else if (node.type === 'html') {
      const text = stripMarkdownInline(node.value);
      if (text) block = createParagraph([{ type: 'text', value: text }], context, getQuoteIndent(quoteDepth));
      else continue;
    } else {
      continue;
    }

    if (!block) return false;
    output.push(block);
  }
  return true;
}

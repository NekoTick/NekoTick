import {
  AlignmentType,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { remarkObsidianImageEmbeds } from '@/components/common/markdown/theme-compatibility/obsidian/imageEmbed';
import type { Definition, Root, RootContent } from 'mdast';
import { themeExportLayoutTokens } from '@/styles/themeTokens';
import {
  createDocxBlockChildren,
  type DocxBlock,
  type DocxBuildContext,
} from './noteExportDocxBlocks';

export const MAX_DOCX_EXPORT_PARAGRAPHS = 20_000;
const DOCX_EXPORT_TRUNCATION_NOTICE = '[Document truncated for export safety]';
const ORDERED_LIST_REFERENCE = 'vlaina-ordered-list';

function createBuildContext(root: Root): DocxBuildContext {
  const definitions = new Map<string, Definition>();
  const stack: RootContent[] = [...root.children].reverse();
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.type === 'definition' && !definitions.has(node.identifier)) {
      definitions.set(node.identifier, node);
    }
    if ('children' in node) {
      for (let index = node.children.length - 1; index >= 0; index -= 1) {
        stack.push(node.children[index] as RootContent);
      }
    }
  }

  let paragraphCount = 1;
  let listInstance = 0;
  return {
    definitions,
    imageCache: new Map(),
    orderedListReference: ORDERED_LIST_REFERENCE,
    reserveParagraphs: (count) => {
      if (paragraphCount + count > MAX_DOCX_EXPORT_PARAGRAPHS) return false;
      paragraphCount += count;
      return true;
    },
    nextListInstance: () => {
      listInstance += 1;
      return listInstance;
    },
  };
}

function appendTruncationNotice(children: DocxBlock[]) {
  const notice = new Paragraph({ children: [new TextRun(DOCX_EXPORT_TRUNCATION_NOTICE)] });
  if (children.length < MAX_DOCX_EXPORT_PARAGRAPHS) {
    children.push(notice);
  } else {
    children[children.length - 1] = notice;
  }
}

export async function createDocxExportBytes(markdown: string, title: string): Promise<Uint8Array> {
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkObsidianImageEmbeds);
  const root = processor.runSync(processor.parse(markdown), { value: markdown }) as Root;
  const context = createBuildContext(root);
  const children: DocxBlock[] = [
    new Paragraph({
      text: title,
      heading: HeadingLevel.TITLE,
      spacing: { after: themeExportLayoutTokens.docxTitleAfterSpacing },
    }),
  ];

  const complete = createDocxBlockChildren(root.children, context, children);
  if (!complete) appendTruncationNotice(children);

  const document = new Document({
    numbering: {
      config: [{
        reference: ORDERED_LIST_REFERENCE,
        levels: Array.from({ length: 9 }, (_value, level) => ({
          level,
          format: LevelFormat.DECIMAL,
          text: `%${level + 1}.`,
          alignment: AlignmentType.START,
          style: {
            paragraph: {
              indent: {
                left: themeExportLayoutTokens.docxListIndentPerLevel * (level + 1),
                hanging: themeExportLayoutTokens.docxListHangingIndent,
              },
            },
          },
        })),
      }],
    },
    sections: [{ properties: {}, children }],
  });
  const blob = await Packer.toBlob(document);
  return new Uint8Array(await blob.arrayBuffer());
}

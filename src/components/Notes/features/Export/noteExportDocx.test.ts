import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  document: vi.fn(function document(options: unknown) { return { kind: 'document', options }; }),
  externalHyperlink: vi.fn(function externalHyperlink(options: unknown) { return { kind: 'link', options }; }),
  imageRun: vi.fn(function imageRun(options: unknown) { return { kind: 'image', options }; }),
  paragraph: vi.fn(function paragraph(options: unknown) { return { kind: 'paragraph', options }; }),
  table: vi.fn(function table(options: unknown) { return { kind: 'table', options }; }),
  tableCell: vi.fn(function tableCell(options: unknown) { return { kind: 'cell', options }; }),
  tableRow: vi.fn(function tableRow(options: unknown) { return { kind: 'row', options }; }),
  textRun: vi.fn(function textRun(options: unknown) { return { kind: 'text', options }; }),
  toBlob: vi.fn(async () => ({
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  })),
}));

vi.mock('docx', () => ({
  AlignmentType: { CENTER: 'center', LEFT: 'left', RIGHT: 'right', START: 'start' },
  Document: mocks.document,
  ExternalHyperlink: mocks.externalHyperlink,
  HeadingLevel: {
    TITLE: 'TITLE',
    HEADING_1: 'HEADING_1',
    HEADING_2: 'HEADING_2',
    HEADING_3: 'HEADING_3',
    HEADING_4: 'HEADING_4',
    HEADING_5: 'HEADING_5',
    HEADING_6: 'HEADING_6',
  },
  ImageRun: mocks.imageRun,
  LevelFormat: { DECIMAL: 'decimal' },
  Packer: { toBlob: mocks.toBlob },
  Paragraph: mocks.paragraph,
  Table: mocks.table,
  TableCell: mocks.tableCell,
  TableRow: mocks.tableRow,
  TextRun: mocks.textRun,
  WidthType: { PERCENTAGE: 'pct' },
}));

import { createDocxExportBytes, MAX_DOCX_EXPORT_PARAGRAPHS } from './noteExportDocx';

function getDocumentChildren(): unknown[] {
  const options = mocks.document.mock.calls[0]?.[0] as { sections: Array<{ children: unknown[] }> };
  return options.sections[0]?.children ?? [];
}

describe('createDocxExportBytes', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockClear());
    mocks.toBlob.mockResolvedValue({
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    });
  });

  it('caps paragraph creation for paragraph-heavy markdown', async () => {
    const markdown = Array.from(
      { length: MAX_DOCX_EXPORT_PARAGRAPHS + 64 },
      (_value, index) => `paragraph ${index}`,
    ).join('\n\n');

    await expect(createDocxExportBytes(markdown, 'Title')).resolves.toEqual(new Uint8Array([1, 2, 3]));

    expect(getDocumentChildren()).toHaveLength(MAX_DOCX_EXPORT_PARAGRAPHS);
    expect(mocks.paragraph.mock.calls.length).toBeLessThanOrEqual(MAX_DOCX_EXPORT_PARAGRAPHS + 1);
    expect(mocks.textRun.mock.calls.at(-1)?.[0]).toBe('[Document truncated for export safety]');
  });

  it('keeps a large fenced code block in one paragraph', async () => {
    const markdown = ['```ts', ...Array.from({ length: 20_000 }, (_value, index) => `code ${index}`), '```'].join('\n');

    await createDocxExportBytes(markdown, 'Title');

    expect(getDocumentChildren()).toHaveLength(2);
    expect(mocks.paragraph).toHaveBeenCalledTimes(2);
    expect(mocks.textRun).toHaveBeenCalledWith(expect.objectContaining({
      font: 'JetBrains Mono',
      text: expect.stringContaining('code 19999'),
    }));
  });

  it('preserves headings, inline styles, links, list kinds, tasks, and tables', async () => {
    await createDocxExportBytes([
      '## Heading',
      '',
      'Wrapped',
      'line with **bold**, *italic*, `code`, ~~strike~~, and [link](https://example.test).',
      '',
      '1. Ordered',
      '   - Nested bullet',
      '- [x] Finished',
      '',
      '| Name | Value |',
      '| :--- | ---: |',
      '| A | B |',
    ].join('\n'), 'Title');

    const paragraphOptions = mocks.paragraph.mock.calls.map(([options]) => options as Record<string, unknown>);
    expect(paragraphOptions).toContainEqual(expect.objectContaining({ heading: 'HEADING_2' }));
    expect(paragraphOptions).toContainEqual(expect.objectContaining({
      numbering: expect.objectContaining({ level: 0 }),
    }));
    expect(paragraphOptions).toContainEqual(expect.objectContaining({ bullet: { level: 1 } }));
    expect(paragraphOptions).toContainEqual(expect.objectContaining({ bullet: { level: 0 } }));
    expect(mocks.externalHyperlink).toHaveBeenCalledWith(expect.objectContaining({ link: 'https://example.test' }));
    expect(mocks.textRun).toHaveBeenCalledWith(expect.objectContaining({ bold: true, text: 'bold' }));
    expect(mocks.textRun).toHaveBeenCalledWith(expect.objectContaining({ italics: true, text: 'italic' }));
    expect(mocks.textRun).toHaveBeenCalledWith(expect.objectContaining({ font: 'JetBrains Mono', text: 'code' }));
    expect(mocks.textRun).toHaveBeenCalledWith(expect.objectContaining({ strike: true, text: 'strike' }));
    expect(mocks.textRun).toHaveBeenCalledWith(expect.objectContaining({ text: '[x] ' }));
    expect(mocks.textRun).toHaveBeenCalledWith(expect.objectContaining({ text: 'Finished' }));
    expect(mocks.textRun).toHaveBeenCalledWith(expect.objectContaining({ break: 1, text: 'line with ' }));
    expect(mocks.table).toHaveBeenCalledTimes(1);
    expect(mocks.tableRow).toHaveBeenCalledTimes(2);
    expect(mocks.tableCell).toHaveBeenCalledTimes(4);
  });

  it('embeds inline and reference PNG images with cached decoded data', async () => {
    const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
    await createDocxExportBytes([
      `![inline](${image})`,
      '',
      '![reference][asset]',
      '',
      `[asset]: ${image}`,
    ].join('\n'), 'Title');

    expect(mocks.imageRun).toHaveBeenCalledTimes(2);
    const first = mocks.imageRun.mock.calls[0]?.[0] as { data: Uint8Array; transformation: unknown };
    const second = mocks.imageRun.mock.calls[1]?.[0] as { data: Uint8Array };
    expect(first.transformation).toEqual({ width: 1, height: 1 });
    expect(second.data).toBe(first.data);
  });

  it('embeds Obsidian image syntax after portable asset resolution', async () => {
    const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';

    await createDocxExportBytes(`![[${image}|Cover image]]`, 'Title');

    expect(mocks.imageRun).toHaveBeenCalledTimes(1);
    expect(mocks.imageRun).toHaveBeenCalledWith(expect.objectContaining({
      altText: expect.objectContaining({ description: 'Cover image' }),
      transformation: { width: 1, height: 1 },
    }));
  });

  it('renders unsafe links and unsupported images as plain fallback text', async () => {
    await createDocxExportBytes([
      '[unsafe](javascript:alert(1))',
      '',
      '![photo](data:image/webp;base64,AQID)',
    ].join('\n'), 'Title');

    expect(mocks.externalHyperlink).not.toHaveBeenCalled();
    expect(mocks.imageRun).not.toHaveBeenCalled();
    expect(mocks.textRun).toHaveBeenCalledWith('photo');
  });
});

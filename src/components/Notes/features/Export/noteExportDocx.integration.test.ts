import { describe, expect, it } from 'vitest';
import { createDocxExportBytes } from './noteExportDocx';

describe('createDocxExportBytes integration', () => {
  it('packs structured Markdown into a DOCX archive', async () => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const bytes = await createDocxExportBytes([
      '# Heading',
      '',
      '1. [Linked item](https://example.test)',
      '',
      '| Name | Value |',
      '| --- | --- |',
      '| Image | ![pixel](' + png + ') |',
    ].join('\n'), 'Export');

    expect(bytes.byteLength).toBeGreaterThan(1_000);
    expect(bytes.slice(0, 2)).toEqual(new Uint8Array([0x50, 0x4b]));
  });
});

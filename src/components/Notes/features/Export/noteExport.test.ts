import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureNativeFileShare } from '@/lib/nativeFileShare';
import {
  exportNote,
  exportNoteToFilePath,
  getNoteExportFileName,
  MAX_NOTE_EXPORT_OUTPUT_BYTES,
  MAX_PNG_EXPORT_CANVAS_DIMENSION,
} from './noteExport';
import { createDocxExportBytes } from './noteExportDocx';

const mocks = vi.hoisted(() => ({
  addToast: vi.fn(),
  getBase64DecodedByteLength: vi.fn(),
  renderNoteExportElement: vi.fn(),
  renderNoteExportHtml: vi.fn(),
  resolveExportMarkdownAssetSources: vi.fn(),
  saveDialog: vi.fn(),
  toPng: vi.fn(),
  writeDesktopBinaryFile: vi.fn(),
}));

vi.mock('html-to-image', () => ({
  toPng: mocks.toPng,
}));

vi.mock('@/lib/electron/bridge', () => ({
  getElectronBridge: () => null,
}));

vi.mock('@/lib/storage/dialog', () => ({
  saveDialog: mocks.saveDialog,
}));

vi.mock('@/stores/useToastStore', () => ({
  useToastStore: {
    getState: () => ({
      addToast: mocks.addToast,
    }),
  },
}));

vi.mock('@/lib/notes/displayName', () => ({
  getNoteTitleFromPath: () => 'Fallback',
}));

vi.mock('@/lib/desktop/fs', () => ({
  writeDesktopBinaryFile: mocks.writeDesktopBinaryFile,
}));

vi.mock('@/lib/markdown/dataImagePolicy', () => ({
  getBase64DecodedByteLength: mocks.getBase64DecodedByteLength,
}));

vi.mock('./noteExportDocx', () => ({
  createDocxExportBytes: vi.fn(),
}));

vi.mock('./noteExportHtml', () => ({
  renderNoteExportElement: mocks.renderNoteExportElement,
  renderNoteExportHtml: mocks.renderNoteExportHtml,
}));

vi.mock('./noteExportMarkdown', () => ({
  resolveExportMarkdownAssetSources: mocks.resolveExportMarkdownAssetSources,
}));

describe('exportNote', () => {
  beforeEach(() => {
    mocks.addToast.mockReset();
    mocks.getBase64DecodedByteLength.mockReset();
    mocks.renderNoteExportElement.mockReset();
    mocks.renderNoteExportHtml.mockReset();
    mocks.resolveExportMarkdownAssetSources.mockReset();
    mocks.saveDialog.mockReset();
    mocks.toPng.mockReset();
    mocks.writeDesktopBinaryFile.mockReset();

    mocks.getBase64DecodedByteLength.mockImplementation((payload: string) => {
      if (payload.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(payload)) {
        return null;
      }
      let padding = 0;
      if (payload.endsWith('==')) padding = 2;
      else if (payload.endsWith('=')) padding = 1;
      return Math.floor((payload.length * 3) / 4) - padding;
    });
    mocks.saveDialog.mockResolvedValue('/tmp/Exported.html');
    mocks.resolveExportMarkdownAssetSources.mockImplementation(async (markdown: string) => markdown);
    mocks.renderNoteExportElement.mockImplementation(async () => ({
      element: document.createElement('article'),
      cleanup: vi.fn(),
    }));
    mocks.renderNoteExportHtml.mockImplementation(async (markdown: string) => `<html>${markdown}</html>`);
    mocks.toPng.mockResolvedValue('data:image/png;base64,cG5n');
  });

  afterEach(() => {
    configureNativeFileShare(null);
  });

  it('strips vlaina-managed frontmatter before exporting', async () => {
    await exportNote({
      format: 'html',
      markdown: [
        '---',
        'vlaina_cover: "@biva/1"',
        'vlaina_updated: "2026-04-22T13:18:03.350Z"',
        '---',
        '',
        '# Exported',
      ].join('\n'),
      notePath: 'Exported.md',
      notesPath: '/notesRoot',
      title: 'Exported',
    });

    expect(mocks.resolveExportMarkdownAssetSources).toHaveBeenCalledWith(
      '# Exported',
      '/notesRoot',
      'Exported.md',
    );
    expect(mocks.renderNoteExportHtml).toHaveBeenCalledWith('# Exported', 'Exported');

    const [, bytes] = mocks.writeDesktopBinaryFile.mock.calls[0] ?? [];
    const writtenHtml = new TextDecoder().decode(bytes);
    expect(writtenHtml).not.toContain('vlaina_cover');
    expect(writtenHtml).not.toContain('vlaina_updated');
    expect(writtenHtml).toContain('# Exported');
  });

  it('shares generated output through the configured native runtime', async () => {
    const shareFile = vi.fn().mockResolvedValue(undefined);
    configureNativeFileShare(shareFile);

    await exportNote({
      format: 'html',
      markdown: '# Shared',
      notePath: 'Shared.md',
      notesPath: '/notesRoot',
      title: 'Shared',
    });

    expect(shareFile).toHaveBeenCalledWith(expect.objectContaining({
      fileName: 'Shared.html',
      mimeType: 'text/html;charset=utf-8',
      title: 'Shared',
    }));
    const request = shareFile.mock.calls[0]?.[0];
    expect(new TextDecoder().decode(request.data)).toBe('<html># Shared</html>');
    expect(mocks.saveDialog).not.toHaveBeenCalled();
    expect(mocks.writeDesktopBinaryFile).not.toHaveBeenCalled();
  });

  it('writes batch output directly to the chosen file path', async () => {
    const result = await exportNoteToFilePath({
      format: 'html',
      markdown: '# Batch',
      notePath: 'Batch.md',
      notesPath: '/notesRoot',
      title: 'Batch',
    }, '/exports/Batch.html');

    expect(result).toEqual({ canceled: false, filePath: '/exports/Batch.html' });
    expect(mocks.saveDialog).not.toHaveBeenCalled();
    expect(mocks.writeDesktopBinaryFile.mock.calls[0]?.[0]).toBe('/exports/Batch.html');
    expect(mocks.addToast).not.toHaveBeenCalled();
  });

  it('builds a safe output filename for a batch export', () => {
    expect(getNoteExportFileName({
      format: 'docx',
      notePath: 'Unsafe.md',
      title: 'Unsafe:/ Name',
    })).toBe('Unsafe Name.docx');
  });

  it('rejects oversized markdown before rendering export output', async () => {
    await expect(exportNote({
      format: 'html',
      markdown: 'x'.repeat(2 * 1024 * 1024 + 1),
      notePath: 'Huge.md',
      notesPath: '/notesRoot',
      title: 'Huge',
    })).rejects.toThrow('Note is too large to export safely.');

    expect(mocks.resolveExportMarkdownAssetSources).not.toHaveBeenCalled();
    expect(mocks.renderNoteExportHtml).not.toHaveBeenCalled();
    expect(mocks.writeDesktopBinaryFile).not.toHaveBeenCalled();
  });

  it('exports PNG without rendering an intermediate HTML document', async () => {
    mocks.saveDialog.mockResolvedValue('/tmp/Exported.png');

    await exportNote({
      format: 'png',
      markdown: '# Exported',
      notePath: 'Exported.md',
      notesPath: '/notesRoot',
      title: 'Exported',
    });

    expect(mocks.renderNoteExportHtml).not.toHaveBeenCalled();
    expect(mocks.renderNoteExportElement).toHaveBeenCalledWith('# Exported', 'Exported');
    expect(mocks.toPng).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({
      skipAutoScale: true,
    }));
    expect(mocks.writeDesktopBinaryFile.mock.calls[0]?.[0]).toBe('/tmp/Exported.png');
    expect(new TextDecoder().decode(mocks.writeDesktopBinaryFile.mock.calls[0]?.[1])).toBe('png');
  });

  it('rejects oversized PNG dimensions before cloning the export element', async () => {
    const element = document.createElement('article');
    const cleanup = vi.fn();
    Object.defineProperty(element, 'clientWidth', { configurable: true, value: 840 });
    Object.defineProperty(element, 'clientHeight', {
      configurable: true,
      value: MAX_PNG_EXPORT_CANVAS_DIMENSION + 1,
    });
    mocks.renderNoteExportElement.mockResolvedValueOnce({ element, cleanup });

    await expect(exportNote({
      format: 'png',
      markdown: '# Too tall',
      notePath: 'Too tall.md',
      notesPath: '/notesRoot',
      title: 'Too tall',
    })).rejects.toThrow('PNG export dimensions exceed the safe canvas limit.');

    expect(mocks.toPng).not.toHaveBeenCalled();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(mocks.writeDesktopBinaryFile).not.toHaveBeenCalled();
  });

  it('rejects PNG exports when html-to-image returns a non-PNG data URL', async () => {
    mocks.toPng.mockResolvedValueOnce('data:text/html;base64,PHNjcmlwdD4=');

    await expect(exportNote({
      format: 'png',
      markdown: '# Exported',
      notePath: 'Exported.md',
      notesPath: '/notesRoot',
      title: 'Exported',
    })).rejects.toThrow('Unexpected PNG export MIME type.');

    expect(mocks.saveDialog).not.toHaveBeenCalled();
    expect(mocks.writeDesktopBinaryFile).not.toHaveBeenCalled();
    expect(mocks.addToast).not.toHaveBeenCalled();
  });

  it('rejects oversized PNG export output before writing a file', async () => {
    mocks.toPng.mockResolvedValueOnce('data:image/png;base64,cG5n');
    mocks.getBase64DecodedByteLength.mockReturnValueOnce(Number.MAX_SAFE_INTEGER);

    await expect(exportNote({
      format: 'png',
      markdown: '# Exported',
      notePath: 'Exported.md',
      notesPath: '/notesRoot',
      title: 'Exported',
    })).rejects.toThrow('PNG export output is too large.');

    expect(mocks.saveDialog).not.toHaveBeenCalled();
    expect(mocks.writeDesktopBinaryFile).not.toHaveBeenCalled();
    expect(mocks.addToast).not.toHaveBeenCalled();
  });

  it('rejects oversized non-PNG export output before prompting for a file', async () => {
    vi.mocked(createDocxExportBytes).mockResolvedValueOnce({
      byteLength: MAX_NOTE_EXPORT_OUTPUT_BYTES + 1,
    } as Uint8Array);

    await expect(exportNote({
      format: 'docx',
      markdown: '# Exported',
      notePath: 'Exported.md',
      notesPath: '/notesRoot',
      title: 'Exported',
    })).rejects.toThrow('Note export output is too large.');

    expect(mocks.saveDialog).not.toHaveBeenCalled();
    expect(mocks.writeDesktopBinaryFile).not.toHaveBeenCalled();
    expect(mocks.addToast).not.toHaveBeenCalled();
  });

  it('revokes the browser download URL if fallback DOM insertion fails', async () => {
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const createObjectURL = vi.fn(() => 'blob:export-test');
    const revokeObjectURL = vi.fn();
    const appendChild = vi.spyOn(document.body, 'appendChild').mockImplementationOnce(() => {
      throw new Error('append failed');
    });
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    });
    mocks.saveDialog.mockResolvedValueOnce(null);

    try {
      await expect(exportNote({
        format: 'html',
        markdown: '# Exported',
        notePath: 'Exported.md',
        notesPath: '/notesRoot',
        title: 'Exported',
      })).rejects.toThrow('append failed');

      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:export-test');
      expect(mocks.addToast).not.toHaveBeenCalled();
    } finally {
      appendChild.mockRestore();
      if (originalCreateObjectURL) {
        Object.defineProperty(URL, 'createObjectURL', {
          configurable: true,
          value: originalCreateObjectURL,
        });
      } else {
        delete (URL as unknown as { createObjectURL?: unknown }).createObjectURL;
      }
      if (originalRevokeObjectURL) {
        Object.defineProperty(URL, 'revokeObjectURL', {
          configurable: true,
          value: originalRevokeObjectURL,
        });
      } else {
        delete (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL;
      }
    }
  });
});

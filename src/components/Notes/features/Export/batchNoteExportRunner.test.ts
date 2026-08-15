import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getBatchNoteExportConcurrency,
  runBatchNoteExports,
} from './batchNoteExportRunner';

const mocks = vi.hoisted(() => ({
  exportNote: vi.fn(),
  exportNoteToFilePath: vi.fn(),
}));

vi.mock('./noteExport', () => ({
  exportNote: mocks.exportNote,
  exportNoteToFilePath: mocks.exportNoteToFilePath,
  getNoteExportFileName: () => 'note.out',
}));

vi.mock('@/lib/storage/adapter', () => ({
  joinPath: (...parts: string[]) => Promise.resolve(parts.join('/')),
}));

const sources = Array.from({ length: 3 }, (_value, index) => ({
  id: `note-${index}`,
  name: `Note ${index}`,
  path: `note-${index}.md`,
}));

describe('runBatchNoteExports', () => {
  beforeEach(() => {
    mocks.exportNote.mockReset();
    mocks.exportNoteToFilePath.mockReset();
  });

  it('applies format-aware concurrency limits', () => {
    expect(getBatchNoteExportConcurrency(['png'], 4)).toBe(1);
    expect(getBatchNoteExportConcurrency(['pdf'], 4)).toBe(1);
    expect(getBatchNoteExportConcurrency(['docx'], 4)).toBe(2);
    expect(getBatchNoteExportConcurrency(['html'], 8)).toBe(4);
    expect(getBatchNoteExportConcurrency(['html'], Number.NaN)).toBe(1);
  });

  it('runs PNG exports serially even when higher concurrency is requested', async () => {
    let releaseFirst: (() => void) | undefined;
    mocks.exportNote
      .mockImplementationOnce(() => new Promise((resolve) => {
        releaseFirst = () => resolve({ canceled: false });
      }))
      .mockResolvedValue({ canceled: false });

    const result = runBatchNoteExports({
      sources,
      formats: ['png'],
      notesPath: '/notes',
      outputDirectory: null,
      concurrency: 4,
      getContent: () => '# Note',
      getTitle: (source) => source.name,
    });

    await vi.waitFor(() => expect(mocks.exportNote).toHaveBeenCalledTimes(1));
    releaseFirst?.();
    await expect(result).resolves.toBe(true);
    expect(mocks.exportNote).toHaveBeenCalledTimes(3);
  });

  it('allows lightweight HTML exports to use bounded parallel workers', async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    mocks.exportNote.mockImplementation(async () => {
      await gate;
      return { canceled: false };
    });

    const result = runBatchNoteExports({
      sources,
      formats: ['html'],
      notesPath: '/notes',
      outputDirectory: null,
      concurrency: 8,
      getContent: () => '# Note',
      getTitle: (source) => source.name,
    });

    await vi.waitFor(() => expect(mocks.exportNote).toHaveBeenCalledTimes(3));
    release?.();
    await expect(result).resolves.toBe(true);
  });
});

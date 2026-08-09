import { joinPath } from '@/lib/storage/adapter';
import { exportNote, exportNoteToFilePath, getNoteExportFileName } from './noteExport';
import { getUniqueBatchExportFileName, type BatchExportSource } from './batchNoteExportModel';
import type { NoteExportFormat } from './noteExportTypes';

interface RunBatchNoteExportsOptions {
  sources: BatchExportSource[];
  formats: NoteExportFormat[];
  notesPath: string;
  outputDirectory: string | null;
  getContent: (source: BatchExportSource) => Promise<string> | string;
  getTitle: (source: BatchExportSource) => string;
  concurrency?: number;
  onProgress?: (completed: number, total: number) => void;
}

export async function runBatchNoteExports({
  sources,
  formats,
  notesPath,
  outputDirectory,
  getContent,
  getTitle,
  concurrency = 1,
  onProgress,
}: RunBatchNoteExportsOptions): Promise<boolean> {
  const usedFileNames = new Set<string>();
  const total = sources.length * formats.length;
  const tasks = sources.flatMap((source) => formats.map((format) => ({ source, format })));
  const contentBySourceId = new Map<string, Promise<string>>();
  const workerCount = Math.min(Math.max(1, Math.floor(concurrency)), tasks.length);
  let nextTaskIndex = 0;
  let completed = 0;
  let canceled = false;
  let hasError = false;
  let firstError: unknown = null;

  const runWorker = async () => {
    try {
      while (!canceled && nextTaskIndex < tasks.length) {
        const task = tasks[nextTaskIndex];
        nextTaskIndex += 1;
        if (!task) return;
        const { source, format } = task;
        let contentPromise = contentBySourceId.get(source.id);
        if (!contentPromise) {
          contentPromise = Promise.resolve(getContent(source));
          contentBySourceId.set(source.id, contentPromise);
        }
        const content = await contentPromise;
        if (canceled) return;
        const request = {
          format,
          markdown: content,
          notePath: source.external ? source.name : source.path,
          notesPath,
          title: getTitle(source),
        };
        const result = outputDirectory
          ? await exportNoteToFilePath(
              request,
              await joinPath(
                outputDirectory,
                getUniqueBatchExportFileName(getNoteExportFileName(request), usedFileNames),
              ),
            )
          : await exportNote(request);
        if (result.canceled) {
          canceled = true;
          return;
        }
        completed += 1;
        onProgress?.(completed, total);
      }
    } catch (error) {
      if (!hasError) {
        hasError = true;
        firstError = error;
      }
      canceled = true;
    }
  };

  await Promise.all(Array.from({ length: workerCount }, runWorker));
  if (hasError) throw firstError;
  return !canceled;
}

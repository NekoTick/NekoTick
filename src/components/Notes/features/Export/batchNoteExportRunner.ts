import { joinPath } from '@/lib/storage/adapter';
import { exportNote, exportNoteToFilePath, getNoteExportFileName } from './noteExport';
import { getUniqueBatchExportFileName, type BatchExportSource } from './batchNoteExportModel';
import type { NoteExportFormat } from './noteExportTypes';
import type { FileTreeNode } from '@/stores/notes/types';

interface RunBatchNoteExportsOptions {
  sources: BatchExportSource[];
  formats: NoteExportFormat[];
  notesPath: string;
  outputDirectory: string | null;
  rootNodes?: readonly FileTreeNode[];
  getContent: (source: BatchExportSource) => Promise<string> | string;
  getTitle: (source: BatchExportSource) => string;
  concurrency?: number;
  onProgress?: (completed: number, total: number) => void;
}

export function getBatchNoteExportConcurrency(
  formats: readonly NoteExportFormat[],
  requestedConcurrency: number,
): number {
  const requested = Number.isFinite(requestedConcurrency)
    ? Math.max(1, Math.floor(requestedConcurrency))
    : 1;
  if (formats.some((format) => format === 'pdf' || format === 'png')) return 1;
  if (formats.includes('docx')) return Math.min(requested, 2);
  return Math.min(requested, 4);
}

export async function runBatchNoteExports({
  sources,
  formats,
  notesPath,
  outputDirectory,
  rootNodes,
  getContent,
  getTitle,
  concurrency = 1,
  onProgress,
}: RunBatchNoteExportsOptions): Promise<boolean> {
  const usedFileNames = new Set<string>();
  const total = sources.length * formats.length;
  const tasks = sources.flatMap((source) => formats.map((format) => ({ source, format })));
  const contentBySourceId = new Map<string, Promise<string>>();
  const remainingTasksBySourceId = new Map(sources.map((source) => [source.id, formats.length]));
  const workerCount = Math.min(getBatchNoteExportConcurrency(formats, concurrency), tasks.length);
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
          notesPath: source.external ? '' : notesPath,
          ...(!source.external && rootNodes ? { rootNodes } : {}),
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
        const remainingTasks = (remainingTasksBySourceId.get(source.id) ?? 1) - 1;
        remainingTasksBySourceId.set(source.id, remainingTasks);
        if (remainingTasks <= 0) contentBySourceId.delete(source.id);
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

import { getStorageAdapter, joinPath } from '@/lib/storage/adapter';
import type { FileTreeNode } from '@/stores/notes/useNotesStore';
import type { NoteExportFormat } from './noteExportTypes';

export const MAX_BATCH_NOTE_CHARS = 2 * 1024 * 1024;

export const BATCH_EXPORT_FORMATS: Array<{
  value: NoteExportFormat;
  label: string;
  icon: string;
}> = [
  { value: 'docx', label: 'Word (.docx)', icon: 'file.text' },
  { value: 'pdf', label: 'PDF', icon: 'file.text' },
  { value: 'html', label: 'HTML', icon: 'file.public' },
  { value: 'png', label: 'Image (.png)', icon: 'file.image' },
];

export interface BatchExportSource {
  id: string;
  name: string;
  path: string;
  content?: string;
  external?: boolean;
}

export function collectBatchExportSources(nodes: readonly FileTreeNode[]): BatchExportSource[] {
  const output: BatchExportSource[] = [];
  const stack = [...nodes].reverse();
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    if (node.isFolder) {
      for (let index = node.children.length - 1; index >= 0; index -= 1) {
        stack.push(node.children[index]!);
      }
      continue;
    }
    if (node.kind !== 'image') {
      output.push({ id: `root:${node.path}`, name: node.name, path: node.path });
    }
  }
  return output;
}

export function getBatchExportTitle(name: string): string {
  return name.replace(/\.(?:md|markdown|mdown|mkd)$/i, '') || 'Untitled';
}

export function isMarkdownExportFile(file: File): boolean {
  return /\.(?:md|markdown|mdown|mkd)$/i.test(file.name);
}

export function getUniqueBatchExportFileName(fileName: string, usedFileNames: Set<string>): string {
  const extensionIndex = fileName.lastIndexOf('.');
  const baseName = extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName;
  const extension = extensionIndex > 0 ? fileName.slice(extensionIndex) : '';
  let candidate = fileName;
  let suffix = 2;
  while (usedFileNames.has(candidate.toLocaleLowerCase())) {
    candidate = `${baseName} (${suffix})${extension}`;
    suffix += 1;
  }
  usedFileNames.add(candidate.toLocaleLowerCase());
  return candidate;
}

export async function readBatchWorkspaceNote(path: string, notesPath: string): Promise<string> {
  const absolutePath = await joinPath(notesPath, path);
  return getStorageAdapter().readFile(absolutePath, MAX_BATCH_NOTE_CHARS);
}

import type { FilesystemPlugin } from '@capacitor/filesystem';
import { Directory } from '@capacitor/filesystem';
import type { FileInfo, ListOptions } from '@/lib/storage/adapter';
import { joinCapacitorPath, toNativeDataPath } from './capacitorPath';

export const MAX_CAPACITOR_LIST_ENTRIES = 20_000;

function resolveLimit(options?: ListOptions): number {
  const requested = options?.maxEntries;
  return typeof requested === 'number' && Number.isSafeInteger(requested) && requested > 0
    ? Math.min(requested, MAX_CAPACITOR_LIST_ENTRIES)
    : MAX_CAPACITOR_LIST_ENTRIES;
}

function toStorageFileInfo(parent: string, file: {
  name: string;
  type: 'directory' | 'file';
  size: number;
  ctime?: number;
  mtime: number;
}): FileInfo {
  return {
    name: file.name,
    path: joinCapacitorPath(parent, file.name),
    isDirectory: file.type === 'directory',
    isFile: file.type === 'file',
    size: file.type === 'file' ? file.size : undefined,
    createdAt: file.ctime,
    modifiedAt: file.mtime,
  };
}

async function readChildren(filesystem: FilesystemPlugin, path: string, includeHidden: boolean): Promise<FileInfo[]> {
  const result = await filesystem.readdir({ path: toNativeDataPath(path), directory: Directory.Data });
  return result.files
    .filter((file) => includeHidden || !file.name.startsWith('.'))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((file) => toStorageFileInfo(path, file));
}

export async function listCapacitorDirectory(
  filesystem: FilesystemPlugin,
  path: string,
  options?: ListOptions,
): Promise<FileInfo[]> {
  const limit = resolveLimit(options);
  const initial = await readChildren(filesystem, path, options?.includeHidden === true);
  if (!options?.recursive) return initial.slice(0, limit);

  const results: FileInfo[] = [];
  const stack = [...initial].reverse();
  while (stack.length > 0 && results.length < limit) {
    const entry = stack.pop();
    if (!entry) break;
    results.push(entry);
    if (!entry.isDirectory || results.length >= limit) continue;
    const children = await readChildren(filesystem, entry.path, options.includeHidden === true);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push(children[index]);
    }
  }
  return results;
}

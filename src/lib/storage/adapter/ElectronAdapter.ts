import { getElectronBridge } from '@/lib/electron/bridge';
import type { FileInfo, ListOptions, StorageAdapter, WriteOptions } from './types';

export const MAX_ELECTRON_RECURSIVE_LIST_ENTRIES = 20_000;
export const MAX_ELECTRON_WRITE_BYTES = 64 * 1024 * 1024;

function getFs() {
  const bridge = getElectronBridge();
  if (!bridge) {
    throw new Error('Electron fs bridge is not available.');
  }
  return bridge.fs;
}

function getPathApi() {
  const bridge = getElectronBridge();
  if (!bridge) {
    throw new Error('Electron path bridge is not available.');
  }
  return bridge.path;
}

function assertElectronWriteBytes(
  byteLength: number,
  maxBytes: number | null | undefined = MAX_ELECTRON_WRITE_BYTES,
): void {
  const resolvedMaxBytes = maxBytes === undefined ? MAX_ELECTRON_WRITE_BYTES : maxBytes;
  if (
    !Number.isSafeInteger(byteLength) ||
    byteLength < 0 ||
    (resolvedMaxBytes !== null && (
      !Number.isSafeInteger(resolvedMaxBytes) ||
      resolvedMaxBytes < 0 ||
      resolvedMaxBytes > MAX_ELECTRON_WRITE_BYTES ||
      byteLength > resolvedMaxBytes
    ))
  ) {
    throw new Error('Electron file content is too large to write.');
  }
}

function assertElectronTextWriteBytes(
  content: string,
  byteLength?: number,
  maxBytes?: number | null,
): void {
  const resolvedMaxBytes = maxBytes === undefined ? MAX_ELECTRON_WRITE_BYTES : maxBytes;
  if (resolvedMaxBytes !== null && content.length > resolvedMaxBytes) {
    throw new Error('Electron file content is too large to write.');
  }

  const resolvedByteLength = byteLength ?? new Blob([content]).size;
  if (resolvedByteLength < content.length) {
    throw new Error('Invalid precomputed text byte length.');
  }
  assertElectronWriteBytes(resolvedByteLength, maxBytes);
}

export class ElectronAdapter implements StorageAdapter {
  readonly platform = 'electron' as const;

  private basePath: string | null = null;

  async readFile(path: string, maxBytes?: number | null): Promise<string> {
    return getFs().readTextFile(path, maxBytes);
  }

  async readBinaryFile(path: string, maxBytes?: number): Promise<Uint8Array> {
    return getFs().readBinaryFile(path, maxBytes);
  }

  async writeFile(path: string, content: string, options?: WriteOptions): Promise<void> {
    assertElectronTextWriteBytes(content, options?.byteLength, options?.maxBytes);
    const { byteLength: _byteLength, ...writeOptions } = options ?? {};
    await getFs().writeTextFile(path, content, writeOptions);
  }

  async writeFileIfUnchanged(path: string, expectedContent: string | null, content: string): Promise<boolean> {
    if (expectedContent !== null) {
      assertElectronTextWriteBytes(expectedContent);
    }
    assertElectronTextWriteBytes(content);
    return getFs().writeTextFileIfUnchanged(path, expectedContent, content);
  }

  async writeBinaryFile(path: string, content: Uint8Array, options?: WriteOptions): Promise<void> {
    assertElectronWriteBytes(content.byteLength);
    if (options?.recursive) {
      const normalized = path.replace(/[\\/]+$/, '');
      const lastSeparator = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
      if (lastSeparator > 0) {
        await getFs().mkdir(normalized.slice(0, lastSeparator), true);
      }
    }

    await getFs().writeBinaryFile(path, content);
  }

  async deleteFile(path: string): Promise<void> {
    await getFs().deleteFile(path);
  }

  async deleteDir(path: string, recursive = false): Promise<void> {
    await getFs().deleteDir(path, recursive);
  }

  async exists(path: string): Promise<boolean> {
    return getFs().exists(path);
  }

  async mkdir(path: string, recursive = false): Promise<void> {
    await getFs().mkdir(path, recursive);
  }

  async listDir(path: string, options?: ListOptions): Promise<FileInfo[]> {
    const entries = await getFs().listDir(path, options?.maxEntries);
    const filtered = options?.includeHidden
      ? entries
      : entries.filter((entry) => !entry.name.startsWith('.'));

    if (!options?.recursive) {
      return filtered;
    }

    const nested: FileInfo[] = [];
    const visitedDirectories = new Set<string>([path]);
    const stack = [...filtered].reverse();

    while (stack.length > 0 && nested.length < MAX_ELECTRON_RECURSIVE_LIST_ENTRIES) {
      const entry = stack.pop();
      if (!entry) break;

      nested.push(entry);
      if (
        nested.length >= MAX_ELECTRON_RECURSIVE_LIST_ENTRIES ||
        nested.length + stack.length >= MAX_ELECTRON_RECURSIVE_LIST_ENTRIES ||
        !entry.isDirectory ||
        visitedDirectories.has(entry.path)
      ) {
        continue;
      }

      visitedDirectories.add(entry.path);
      const children = await getFs().listDir(entry.path);
      const visibleChildren = options?.includeHidden
        ? children
        : children.filter((entry) => !entry.name.startsWith('.'));

      for (let index = visibleChildren.length - 1; index >= 0; index -= 1) {
        stack.push(visibleChildren[index]);
      }
    }

    return nested;
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await getFs().rename(oldPath, newPath);
  }

  async copyFile(src: string, dest: string, maxBytes?: number | null): Promise<void> {
    if (maxBytes === undefined) {
      await getFs().copyFile(src, dest);
      return;
    }
    await getFs().copyFile(src, dest, maxBytes);
  }

  async stat(path: string): Promise<FileInfo | null> {
    return getFs().stat(path);
  }

  async getBasePath(): Promise<string> {
    if (this.basePath === null) {
      this.basePath = await getPathApi().appDataDir();
    }

    return this.basePath;
  }
}

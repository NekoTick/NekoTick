import type { StorageAdapter, FileInfo, WriteOptions, ListOptions } from './types';
import {
  MAX_WEB_ADAPTER_FILE_BYTES,
  MAX_WEB_ADAPTER_LIST_ENTRIES,
  WEB_ADAPTER_STORE_DIRS,
  WEB_ADAPTER_STORE_FILES,
} from './webAdapterConstants';
import { WebAdapterDatabase } from './webAdapterDb';
import {
  createDirEntry as createStoredDirEntry,
  deleteDirEntry as deleteStoredDirEntry,
  readStoredDir,
} from './webAdapterDirs';
import {
  assertWritableWebByteLength,
  createStoredTextFile,
  createStoredFileInfo,
  deleteStoredFile,
  encodeStoredFileAsBytes,
  getStoredFileByteLength,
  getStoredFileCreatedAt,
  normalizeReadByteLimit,
  putStoredFile,
  readStoredFileAsBytes,
  readStoredFileAsText,
  readStoredFile as readStoredFileEntry,
} from './webAdapterFiles';
import { buildWebAdapterListDirEntries } from './webAdapterListDir';
import { getWebAdapterParentDir, normalizeWebAdapterPath } from './webAdapterPath';
import {
  assertCompletePrefixScan,
  hasStoredEntryWithPrefix,
  readStoredDirsByPrefix as scanStoredDirsByPrefix,
  readStoredFilesByPrefix as scanStoredFilesByPrefix,
} from './webAdapterPrefixScan';
import { renameWebAdapterDirectory } from './webAdapterRename';
import type { PrefixScanOptions, PrefixScanResult, StoredDir, StoredFile } from './webAdapterTypes';

export { MAX_WEB_ADAPTER_FILE_BYTES, MAX_WEB_ADAPTER_LIST_ENTRIES };
export { MAX_WEB_ADAPTER_PREFIX_SCAN_ENTRIES } from './webAdapterConstants';

export class WebAdapter implements StorageAdapter {
  readonly platform = 'web' as const;

  private readonly database = new WebAdapterDatabase();

  private async getDB(): Promise<IDBDatabase> {
    return this.database.getDB();
  }

  async readFile(path: string, maxBytes?: number | null): Promise<string> {
    const readLimit = normalizeReadByteLimit(maxBytes, path);
    const file = await this.readStoredFile(path);
    if (!file) throw new Error(`File not found: ${path}`);
    return readStoredFileAsText(file, path, readLimit);
  }

  private async readStoredFile(path: string): Promise<StoredFile | undefined> {
    return readStoredFileEntry(await this.getDB(), this.normalizePath(path));
  }

  private async writeStoredFile(path: string, file: StoredFile): Promise<void> {
    if (file.content instanceof Blob) {
      await putStoredFile(await this.getDB(), { ...file, path });
      return;
    }
    if (file.isBinary) {
      await this.writeBinaryFile(path, new Uint8Array(file.content as Uint8Array));
    } else {
      await this.writeFile(path, file.content as string);
    }
  }

  async readBinaryFile(path: string, maxBytes?: number): Promise<Uint8Array> {
    const readLimit = normalizeReadByteLimit(maxBytes, path);
    const file = await this.readStoredFile(path);
    if (!file) throw new Error(`File not found: ${path}`);
    return readStoredFileAsBytes(file, path, readLimit);
  }

  async writeFile(path: string, content: string, options?: WriteOptions): Promise<void> {
    return this.writeTextFile(path, content, options);
  }

  async writeFileBlob(path: string, content: Blob, options?: WriteOptions): Promise<void> {
    return this.writeTextFile(path, content, options);
  }

  private async writeTextFile(path: string, content: string | Blob, options?: WriteOptions): Promise<void> {
    const normalizedPath = this.normalizePath(path);
    const existingFile = await this.readStoredFile(normalizedPath);
    const file = await createStoredTextFile(normalizedPath, content, existingFile, options);
    if (options?.recursive) await this.ensureParentDir(normalizedPath);
    await putStoredFile(await this.getDB(), file);
  }

  async writeBinaryFile(path: string, content: Uint8Array, options?: WriteOptions): Promise<void> {
    const normalizedPath = this.normalizePath(path);
    assertWritableWebByteLength(content.byteLength, normalizedPath);

    const existingFile = await this.readStoredFile(normalizedPath);
    let finalContent = new Uint8Array(content);
    if (options?.append && existingFile) {
      assertWritableWebByteLength(getStoredFileByteLength(existingFile) + finalContent.byteLength, normalizedPath);
      const existing = await encodeStoredFileAsBytes(existingFile);
      const combined = new Uint8Array(existing.byteLength + finalContent.byteLength);
      combined.set(existing);
      combined.set(finalContent, existing.byteLength);
      finalContent = combined;
      assertWritableWebByteLength(finalContent.byteLength, normalizedPath);
    }

    if (options?.recursive) await this.ensureParentDir(normalizedPath);
    await putStoredFile(await this.getDB(), {
      path: normalizedPath,
      content: finalContent,
      isBinary: true,
      size: finalContent.length,
      modifiedAt: Date.now(),
      createdAt: getStoredFileCreatedAt(existingFile) ?? Date.now(),
    });
  }

  async deleteFile(path: string): Promise<void> {
    await deleteStoredFile(await this.getDB(), this.normalizePath(path));
  }

  async deleteDir(path: string, recursive = false): Promise<void> {
    const normalizedPath = this.normalizePath(path);
    if (recursive) {
      const prefix = normalizedPath === '/' ? '/' : `${normalizedPath}/`;
      const fileScan = await this.readStoredFilesByPrefix(prefix);
      const dirScan = await this.readStoredDirsByPrefix(normalizedPath);
      this.assertCompletePrefixScan(fileScan, dirScan, 'delete');
      for (const file of fileScan.entries) {
        if (file.path.startsWith(prefix)) await this.deleteFile(file.path);
      }
      for (const dir of dirScan.entries.slice().reverse()) {
        if (dir.path !== normalizedPath && dir.path.startsWith(prefix)) await this.deleteDirEntry(dir.path);
      }
    } else if ((await this.listDir(normalizedPath, { includeHidden: true })).length > 0) {
      throw new Error(`Directory not empty: ${path}`);
    }
    await this.deleteDirEntry(normalizedPath);
  }

  private async deleteDirEntry(path: string): Promise<void> {
    await deleteStoredDirEntry(await this.getDB(), path);
  }

  async exists(path: string): Promise<boolean> {
    const normalizedPath = this.normalizePath(path);
    const db = await this.getDB();
    if (await readStoredFileEntry(db, normalizedPath)) return true;
    if (await readStoredDir(db, normalizedPath)) return true;
    return this.hasStoredChildPath(normalizedPath);
  }

  async mkdir(path: string, recursive = false): Promise<void> {
    const normalizedPath = this.normalizePath(path);
    if (!recursive) {
      await this.createDirEntry(normalizedPath);
      return;
    }

    const parts = normalizedPath.split('/').filter(Boolean);
    let currentPath = '';
    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : `/${part}`;
      await this.createDirEntry(currentPath);
    }
  }

  private async createDirEntry(path: string): Promise<void> {
    await createStoredDirEntry(await this.getDB(), path);
  }

  async listDir(path: string, options?: ListOptions): Promise<FileInfo[]> {
    const normalizedPath = this.normalizePath(path);
    const prefix = normalizedPath === '/' ? '/' : `${normalizedPath}/`;
    const fileScan = await this.readStoredFilesByPrefix(prefix, { prioritizeForListing: true });
    const dirScan = await this.readStoredDirsByPrefix(prefix, { prioritizeForListing: true });
    return buildWebAdapterListDirEntries({
      normalizedPath,
      files: fileScan.entries,
      dirs: dirScan.entries,
      options,
    });
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    const normalizedOld = this.normalizePath(oldPath);
    const normalizedNew = this.normalizePath(newPath);
    if (normalizedOld === normalizedNew) return;
    if (!(await this.exists(normalizedOld))) throw new Error(`Path not found: ${oldPath}`);

    const stat = await this.stat(normalizedOld);
    if (stat?.isDirectory) {
      await renameWebAdapterDirectory({
        normalizedOld,
        normalizedNew,
        oldPath,
        readStoredFilesByPrefix: (prefix) => this.readStoredFilesByPrefix(prefix),
        readStoredDirsByPrefix: (prefix) => this.readStoredDirsByPrefix(prefix),
        assertCompletePrefixScan: (fileScan, dirScan, operation) =>
          this.assertCompletePrefixScan(fileScan, dirScan, operation),
        writeStoredFile: (path, file) => this.writeStoredFile(path, file),
        deleteFile: (path) => this.deleteFile(path),
        createDirEntry: (path) => this.createDirEntry(path),
        deleteDirEntry: (path) => this.deleteDirEntry(path),
      });
      return;
    }

    const file = await this.readStoredFile(normalizedOld);
    if (!file) throw new Error(`File not found: ${oldPath}`);
    await this.writeStoredFile(normalizedNew, file);
    await this.deleteFile(normalizedOld);
  }

  async copyFile(src: string, dest: string, _maxBytes?: number | null): Promise<void> {
    const file = await this.readStoredFile(src);
    if (!file) throw new Error(`File not found: ${src}`);
    await this.writeStoredFile(dest, file);
  }

  async stat(path: string): Promise<FileInfo | null> {
    const normalizedPath = this.normalizePath(path);
    const db = await this.getDB();
    const file = await readStoredFileEntry(db, normalizedPath);
    if (file) return createStoredFileInfo(file, normalizedPath);
    if (await readStoredDir(db, normalizedPath) || await this.hasStoredChildPath(normalizedPath)) {
      return {
        name: normalizedPath.split('/').pop() || '',
        path: normalizedPath,
        isDirectory: true,
        isFile: false,
      };
    }
    return null;
  }

  async getBasePath(): Promise<string> {
    return '/vlaina';
  }

  private normalizePath(path: string): string {
    return normalizeWebAdapterPath(path);
  }

  private async ensureParentDir(path: string): Promise<void> {
    const dir = getWebAdapterParentDir(path);
    if (dir) await this.mkdir(dir, true);
  }

  private async hasStoredChildPath(normalizedPath: string): Promise<boolean> {
    const prefix = normalizedPath === '/' ? '/' : `${normalizedPath}/`;
    if (await this.hasStoredEntryWithPrefix(WEB_ADAPTER_STORE_FILES, prefix)) return true;
    return this.hasStoredEntryWithPrefix(WEB_ADAPTER_STORE_DIRS, prefix);
  }

  private assertCompletePrefixScan(
    fileScan: PrefixScanResult<StoredFile>,
    dirScan: PrefixScanResult<StoredDir>,
    operation: 'delete' | 'move',
  ): void {
    assertCompletePrefixScan(fileScan, dirScan, operation);
  }

  private async readStoredFilesByPrefix(
    prefix: string,
    options: PrefixScanOptions = {},
  ): Promise<PrefixScanResult<StoredFile>> {
    return scanStoredFilesByPrefix(await this.getDB(), prefix, options);
  }

  private async readStoredDirsByPrefix(
    prefix: string,
    options: PrefixScanOptions = {},
  ): Promise<PrefixScanResult<StoredDir>> {
    return scanStoredDirsByPrefix(await this.getDB(), prefix, options);
  }

  private async hasStoredEntryWithPrefix(
    storeName: typeof WEB_ADAPTER_STORE_FILES | typeof WEB_ADAPTER_STORE_DIRS,
    prefix: string,
  ): Promise<boolean> {
    return hasStoredEntryWithPrefix(await this.getDB(), storeName, prefix);
  }
}

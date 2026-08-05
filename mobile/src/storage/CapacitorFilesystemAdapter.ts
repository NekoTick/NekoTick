import { Capacitor } from '@capacitor/core';
import {
  Directory,
  Encoding,
  Filesystem,
  type FilesystemPlugin,
} from '@capacitor/filesystem';
import type {
  FileInfo,
  ListOptions,
  StorageAdapter,
  WriteOptions,
} from '@/lib/storage/adapter';
import { encodeFilesystemBinary, readFilesystemBinary, readFilesystemText } from './capacitorBinary';
import { listCapacitorDirectory } from './capacitorListing';
import {
  getCapacitorBasePath,
  getCapacitorParentPath,
  normalizeCapacitorPath,
  toNativeDataPath,
} from './capacitorPath';
import { PathOperationQueue } from './PathOperationQueue';

export const MAX_CAPACITOR_FILE_BYTES = 64 * 1024 * 1024;

function assertByteLength(byteLength: number, maxBytes: number | null | undefined): void {
  const limit = maxBytes === null ? null : maxBytes ?? MAX_CAPACITOR_FILE_BYTES;
  if (
    !Number.isSafeInteger(byteLength) ||
    byteLength < 0 ||
    (limit !== null && (!Number.isSafeInteger(limit) || limit < 0 || byteLength > limit))
  ) {
    throw new Error('Mobile file content is too large.');
  }
}

export class CapacitorFilesystemAdapter implements StorageAdapter {
  readonly platform = 'capacitor' as const;

  private readonly operations = new PathOperationQueue();
  private basePathPromise: Promise<string> | null = null;

  constructor(private readonly filesystem: FilesystemPlugin = Filesystem) {}

  async readFile(path: string, maxBytes?: number | null): Promise<string> {
    await this.assertReadableSize(path, maxBytes);
    const result = await this.filesystem.readFile({
      path: toNativeDataPath(path),
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });
    return readFilesystemText(result.data);
  }

  async readBinaryFile(path: string, maxBytes?: number): Promise<Uint8Array> {
    await this.assertReadableSize(path, maxBytes);
    const result = await this.filesystem.readFile({
      path: toNativeDataPath(path),
      directory: Directory.Data,
    });
    return readFilesystemBinary(result.data);
  }

  async writeFile(path: string, content: string, options?: WriteOptions): Promise<void> {
    const normalized = normalizeCapacitorPath(path);
    assertByteLength(options?.byteLength ?? new TextEncoder().encode(content).byteLength, options?.maxBytes);
    await this.operations.run(normalized, async () => {
      if (options?.recursive) await this.ensureParent(normalized);
      const request = {
        path: toNativeDataPath(normalized),
        data: content,
        directory: Directory.Data,
        encoding: Encoding.UTF8,
      } as const;
      if (options?.append) await this.filesystem.appendFile(request);
      else await this.filesystem.writeFile({ ...request, recursive: options?.recursive });
    });
  }

  async writeFileIfUnchanged(path: string, expectedContent: string | null, content: string): Promise<boolean> {
    const normalized = normalizeCapacitorPath(path);
    assertByteLength(new TextEncoder().encode(content).byteLength, undefined);
    return this.operations.run(normalized, async () => {
      const exists = await this.exists(normalized);
      if ((expectedContent === null && exists) || (expectedContent !== null && !exists)) return false;
      if (expectedContent !== null && await this.readFile(normalized) !== expectedContent) return false;
      await this.ensureParent(normalized);
      await this.filesystem.writeFile({
        path: toNativeDataPath(normalized),
        data: content,
        directory: Directory.Data,
        encoding: Encoding.UTF8,
      });
      return true;
    });
  }

  async writeBinaryFile(path: string, content: Uint8Array, options?: WriteOptions): Promise<void> {
    const normalized = normalizeCapacitorPath(path);
    assertByteLength(content.byteLength, options?.maxBytes);
    await this.operations.run(normalized, async () => {
      if (options?.recursive) await this.ensureParent(normalized);
      const request = {
        path: toNativeDataPath(normalized),
        data: encodeFilesystemBinary(content),
        directory: Directory.Data,
      } as const;
      if (options?.append) await this.filesystem.appendFile(request);
      else await this.filesystem.writeFile({ ...request, recursive: options?.recursive });
    });
  }

  async deleteFile(path: string): Promise<void> {
    const normalized = normalizeCapacitorPath(path);
    await this.operations.run(normalized, () => this.filesystem.deleteFile({
      path: toNativeDataPath(normalized),
      directory: Directory.Data,
    }));
  }

  async deleteDir(path: string, recursive = false): Promise<void> {
    await this.filesystem.rmdir({ path: toNativeDataPath(path), directory: Directory.Data, recursive });
  }

  async exists(path: string): Promise<boolean> {
    return (await this.stat(path)) !== null;
  }

  async mkdir(path: string, recursive = false): Promise<void> {
    const normalized = normalizeCapacitorPath(path);
    if (await this.exists(normalized)) return;
    try {
      await this.filesystem.mkdir({ path: toNativeDataPath(normalized), directory: Directory.Data, recursive });
    } catch (error) {
      if (!(await this.exists(normalized))) throw error;
    }
  }

  async listDir(path: string, options?: ListOptions): Promise<FileInfo[]> {
    return listCapacitorDirectory(this.filesystem, normalizeCapacitorPath(path), options);
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    const normalizedOld = normalizeCapacitorPath(oldPath);
    const normalizedNew = normalizeCapacitorPath(newPath);
    if (normalizedOld === normalizedNew) return;
    await this.operations.run(normalizedNew, async () => {
      await this.ensureParent(normalizedNew);
      const source = await this.stat(normalizedOld);
      const destination = await this.stat(normalizedNew);
      if (source?.isFile && destination?.isFile) {
        await this.replaceFile(normalizedOld, normalizedNew);
        return;
      }
      await this.movePath(normalizedOld, normalizedNew);
    });
  }

  async copyFile(src: string, dest: string, maxBytes?: number | null): Promise<void> {
    const normalizedSrc = normalizeCapacitorPath(src);
    const normalizedDest = normalizeCapacitorPath(dest);
    if (normalizedSrc === normalizedDest) return;
    await this.assertReadableSize(normalizedSrc, maxBytes);
    await this.operations.run(normalizedDest, async () => {
      await this.ensureParent(normalizedDest);
      const destination = await this.stat(normalizedDest);
      if (!destination?.isFile) {
        await this.copyPath(normalizedSrc, normalizedDest);
        return;
      }

      const tempPath = this.getReplacementPath(normalizedDest, 'copy');
      try {
        await this.copyPath(normalizedSrc, tempPath);
        await this.replaceFile(tempPath, normalizedDest);
      } catch (error) {
        await this.deletePath(tempPath).catch(() => undefined);
        throw error;
      }
    });
  }

  async stat(path: string): Promise<FileInfo | null> {
    const normalized = normalizeCapacitorPath(path);
    try {
      const result = await this.filesystem.stat({ path: toNativeDataPath(normalized), directory: Directory.Data });
      return {
        name: normalized.split('/').pop() ?? '',
        path: normalized,
        isDirectory: result.type === 'directory',
        isFile: result.type === 'file',
        size: result.type === 'file' ? result.size : undefined,
        createdAt: result.ctime,
        modifiedAt: result.mtime,
      };
    } catch {
      return null;
    }
  }

  async getBasePath(): Promise<string> {
    this.basePathPromise ??= this.ensureBasePath();
    return this.basePathPromise;
  }

  async toFileUrl(path: string): Promise<string> {
    const result = await this.filesystem.getUri({ path: toNativeDataPath(path), directory: Directory.Data });
    return Capacitor.convertFileSrc(result.uri);
  }

  private async ensureBasePath(): Promise<string> {
    await this.mkdir(getCapacitorBasePath(), true);
    return getCapacitorBasePath();
  }

  private async ensureParent(path: string): Promise<void> {
    const parent = getCapacitorParentPath(path);
    if (parent) await this.mkdir(parent, true);
  }

  private async replaceFile(source: string, destination: string): Promise<void> {
    const displacedPath = this.getReplacementPath(destination, 'previous');
    await this.movePath(destination, displacedPath);
    try {
      await this.movePath(source, destination);
    } catch (error) {
      await this.movePath(displacedPath, destination).catch(() => undefined);
      throw error;
    }
    await this.deletePath(displacedPath).catch(() => undefined);
  }

  private async movePath(source: string, destination: string): Promise<void> {
    await this.filesystem.rename({
      from: toNativeDataPath(source),
      to: toNativeDataPath(destination),
      directory: Directory.Data,
      toDirectory: Directory.Data,
    });
  }

  private async copyPath(source: string, destination: string): Promise<void> {
    await this.filesystem.copy({
      from: toNativeDataPath(source),
      to: toNativeDataPath(destination),
      directory: Directory.Data,
      toDirectory: Directory.Data,
    });
  }

  private async deletePath(path: string): Promise<void> {
    await this.filesystem.deleteFile({ path: toNativeDataPath(path), directory: Directory.Data });
  }

  private getReplacementPath(path: string, kind: string): string {
    const parent = getCapacitorParentPath(path);
    const name = normalizeCapacitorPath(path).split('/').pop() ?? 'file';
    return normalizeCapacitorPath(`${parent}/.${name}.${crypto.randomUUID()}.${kind}`);
  }

  private async assertReadableSize(path: string, maxBytes?: number | null): Promise<void> {
    const info = await this.stat(path);
    if (!info?.isFile) throw new Error(`File not found: ${path}`);
    assertByteLength(info.size ?? 0, maxBytes);
  }
}

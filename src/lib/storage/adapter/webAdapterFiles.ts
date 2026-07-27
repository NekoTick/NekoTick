import type { FileInfo, WriteOptions } from './types';
import {
  MAX_WEB_ADAPTER_FILE_BYTES,
  WEB_ADAPTER_STORE_FILES,
} from './webAdapterConstants';
import type { StoredFile } from './webAdapterTypes';

export function normalizeReadByteLimit(maxBytes: number | null | undefined, path: string): number | null {
  if (maxBytes === undefined) return MAX_WEB_ADAPTER_FILE_BYTES;
  if (maxBytes === null) return null;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || maxBytes > MAX_WEB_ADAPTER_FILE_BYTES) {
    throw new Error(`Invalid binary read limit for ${path}`);
  }
  return maxBytes;
}

export function getTextByteLength(content: string): number {
  return new Blob([content]).size;
}

export function assertWritableWebByteLength(
  byteLength: number,
  path: string,
  maxBytes: number | null | undefined = MAX_WEB_ADAPTER_FILE_BYTES,
): void {
  const resolvedMaxBytes = maxBytes === undefined ? MAX_WEB_ADAPTER_FILE_BYTES : maxBytes;
  if (
    !Number.isSafeInteger(byteLength) ||
    byteLength < 0 ||
    (resolvedMaxBytes !== null && (
      !Number.isSafeInteger(resolvedMaxBytes) ||
      resolvedMaxBytes < 0 ||
      resolvedMaxBytes > MAX_WEB_ADAPTER_FILE_BYTES ||
      byteLength > resolvedMaxBytes
    ))
  ) {
    throw new Error(`Web content is too large to write: ${path}`);
  }
}

export function getStoredFileByteLength(file: StoredFile): number {
  if (Number.isSafeInteger(file.size) && file.size >= 0) {
    return file.size;
  }

  if (file.isBinary) {
    if (file.content instanceof Blob) return file.content.size;
    return new Uint8Array(file.content as Uint8Array).byteLength;
  }

  if (file.content instanceof Blob) return file.content.size;
  return getTextByteLength(file.content as string);
}

export function getDeclaredStoredFileByteLength(file: StoredFile): number | null {
  return Number.isSafeInteger(file.size) && file.size >= 0 ? file.size : null;
}

export function getStoredFileModifiedAt(file: StoredFile): number | undefined {
  return Number.isFinite(file.modifiedAt) ? file.modifiedAt : undefined;
}

export function getStoredFileCreatedAt(file: StoredFile | null | undefined): number | undefined {
  return file && Number.isFinite(file.createdAt) ? file.createdAt : undefined;
}

export function createStoredFileInfo(file: StoredFile, path = file.path): FileInfo {
  return {
    name: path.split('/').pop() || '',
    path,
    isDirectory: false,
    isFile: true,
    size: getStoredFileByteLength(file),
    createdAt: getStoredFileCreatedAt(file),
    modifiedAt: getStoredFileModifiedAt(file),
  };
}

export async function decodeStoredFileAsText(file: StoredFile): Promise<string> {
  if (file.content instanceof Blob) return file.content.text();
  if (!file.isBinary) {
    return file.content as string;
  }

  return new TextDecoder().decode(new Uint8Array(file.content as Uint8Array));
}

export async function encodeStoredFileAsBytes(file: StoredFile): Promise<Uint8Array> {
  if (file.content instanceof Blob) return new Uint8Array(await file.content.arrayBuffer());
  if (file.isBinary) {
    return new Uint8Array(file.content as Uint8Array);
  }

  return new TextEncoder().encode(file.content as string);
}

export async function createStoredTextFile(
  path: string,
  content: string | Blob,
  existingFile: StoredFile | undefined,
  options?: WriteOptions,
): Promise<StoredFile> {
  const incomingByteLength = content instanceof Blob
    ? content.size
    : options?.byteLength ?? getTextByteLength(content);
  assertWritableWebByteLength(incomingByteLength, path, options?.maxBytes);
  if (typeof content === 'string' && incomingByteLength < content.length) {
    throw new Error(`Invalid precomputed text byte length for ${path}`);
  }

  let finalContent = content;
  let finalByteLength = incomingByteLength;
  if (options?.append && existingFile) {
    assertWritableWebByteLength(
      getStoredFileByteLength(existingFile) + incomingByteLength,
      path,
      options.maxBytes,
    );
    const appendedContent = content instanceof Blob ? await content.text() : content;
    finalContent = await decodeStoredFileAsText(existingFile) + appendedContent;
    finalByteLength = getTextByteLength(finalContent);
    assertWritableWebByteLength(finalByteLength, path, options.maxBytes);
  }

  if (!(finalContent instanceof Blob) && options?.maxBytes === null) {
    finalContent = new Blob([finalContent]);
  }
  return {
    path,
    content: finalContent,
    isBinary: false,
    size: finalByteLength,
    modifiedAt: Date.now(),
    createdAt: getStoredFileCreatedAt(existingFile) ?? Date.now(),
  };
}

export async function readStoredFile(db: IDBDatabase, normalizedPath: string): Promise<StoredFile | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(WEB_ADAPTER_STORE_FILES, 'readonly');
    const store = tx.objectStore(WEB_ADAPTER_STORE_FILES);
    const request = store.get(normalizedPath);
    request.onsuccess = () => resolve(request.result as StoredFile | undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteStoredFile(db: IDBDatabase, normalizedPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(WEB_ADAPTER_STORE_FILES, 'readwrite');
    const store = tx.objectStore(WEB_ADAPTER_STORE_FILES);
    const request = store.delete(normalizedPath);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function putStoredFile(db: IDBDatabase, file: StoredFile): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(WEB_ADAPTER_STORE_FILES, 'readwrite');
    const store = tx.objectStore(WEB_ADAPTER_STORE_FILES);
    const request = store.put(file);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function readStoredFileAsText(
  file: StoredFile,
  path: string,
  readLimit: number | null,
): Promise<string> {
  const declaredByteLength = getDeclaredStoredFileByteLength(file);
  if (readLimit !== null && declaredByteLength !== null && declaredByteLength > readLimit) {
    throw new Error(`File is too large to read: ${path}`);
  }

  if (file.content instanceof Blob) {
    if (readLimit !== null && file.content.size > readLimit) {
      throw new Error(`File is too large to read: ${path}`);
    }
    return file.content.text();
  }

  if (file.isBinary) {
    const bytes = new Uint8Array(file.content as Uint8Array);
    if (readLimit !== null && bytes.byteLength > readLimit) {
      throw new Error(`File is too large to read: ${path}`);
    }
    return new TextDecoder().decode(bytes);
  }

  const content = file.content as string;
  if (readLimit !== null && new TextEncoder().encode(content).byteLength > readLimit) {
    throw new Error(`File is too large to read: ${path}`);
  }
  return content;
}

export async function readStoredFileAsBytes(
  file: StoredFile,
  path: string,
  readLimit: number | null,
): Promise<Uint8Array> {
  const declaredByteLength = getDeclaredStoredFileByteLength(file);
  if (readLimit !== null && declaredByteLength !== null && declaredByteLength > readLimit) {
    throw new Error(`File is too large to read: ${path}`);
  }

  const bytes = file.content instanceof Blob
    ? new Uint8Array(await file.content.arrayBuffer())
    : file.isBinary
    ? new Uint8Array(file.content as Uint8Array)
    : new TextEncoder().encode(file.content as string);
  if (readLimit !== null && bytes.byteLength > readLimit) {
    throw new Error(`File is too large to read: ${path}`);
  }
  return bytes;
}

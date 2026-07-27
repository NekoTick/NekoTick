import { getStorageAdapter } from '@/lib/storage/adapter';

const encoder = new TextEncoder();
const UTF8_LENGTH_CHUNK_CHARS = 256 * 1024;
const UTF8_LENGTH_SLICE_MS = 8;

export async function readRecoverableText<T>(
  path: string,
  maxBytes: number | null,
  parse: (content: string) => T | null | Promise<T | null>,
): Promise<T | null> {
  const storage = getStorageAdapter();
  const primary = await readParsed(path, maxBytes, parse);
  if (primary) return primary;

  const backupPath = `${path}.bak`;
  const backup = await readParsed(backupPath, maxBytes, parse);
  if (!backup) return null;

  try {
    const content = await storage.readFile(backupPath, maxBytes);
    await replaceText(path, content, maxBytes);
  } catch {
  }
  return backup;
}

export async function writeRecoverableText(
  path: string,
  content: string,
  maxBytes: number | null,
): Promise<number> {
  const byteLength = await getUtf8ByteLength(content);
  if (maxBytes !== null && byteLength > maxBytes) {
    throw new Error('Whiteboard file is too large');
  }

  const storage = getStorageAdapter();
  const writeOptions = { byteLength, maxBytes, recursive: true };
  if (storage.platform === 'web') {
    await storage.writeFile(path, content, writeOptions);
    return byteLength;
  }
  const tempPath = getTempPath(path);
  try {
    await storage.writeFile(tempPath, content, writeOptions);
    if (await storage.exists(path)) {
      await storage.copyFile(path, `${path}.bak`, maxBytes);
    }
    await storage.rename(tempPath, path);
    return byteLength;
  } catch (error) {
    await storage.deleteFile(tempPath).catch(() => undefined);
    throw error;
  }
}

async function getUtf8ByteLength(content: string): Promise<number> {
  if (content.length <= UTF8_LENGTH_CHUNK_CHARS) return encoder.encode(content).byteLength;
  let byteLength = 0;
  let offset = 0;
  let sliceStartedAt = performance.now();
  while (offset < content.length) {
    let end = Math.min(content.length, offset + UTF8_LENGTH_CHUNK_CHARS);
    if (end < content.length && isHighSurrogate(content.charCodeAt(end - 1))) end -= 1;
    byteLength += encoder.encode(content.slice(offset, end)).byteLength;
    offset = end;
    if (offset < content.length && performance.now() - sliceStartedAt >= UTF8_LENGTH_SLICE_MS) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      sliceStartedAt = performance.now();
    }
  }
  return byteLength;
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

async function readParsed<T>(
  path: string,
  maxBytes: number | null,
  parse: (content: string) => T | null | Promise<T | null>,
): Promise<T | null> {
  const storage = getStorageAdapter();
  if (!await storage.exists(path)) return null;
  try {
    return await parse(await storage.readFile(path, maxBytes));
  } catch {
    return null;
  }
}

async function replaceText(path: string, content: string, maxBytes: number | null): Promise<void> {
  const storage = getStorageAdapter();
  const tempPath = getTempPath(path);
  try {
    await storage.writeFile(tempPath, content, {
      byteLength: await getUtf8ByteLength(content),
      maxBytes,
      recursive: true,
    });
    await storage.rename(tempPath, path);
  } catch (error) {
    await storage.deleteFile(tempPath).catch(() => undefined);
    throw error;
  }
}

function getTempPath(path: string): string {
  return `${path}.${crypto.randomUUID()}.tmp`;
}

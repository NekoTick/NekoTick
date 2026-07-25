import { getStorageAdapter } from '@/lib/storage/adapter';

const encoder = new TextEncoder();

export async function readRecoverableText<T>(
  path: string,
  maxBytes: number,
  parse: (content: string) => T | null,
): Promise<T | null> {
  const storage = getStorageAdapter();
  const primary = await readParsed(path, maxBytes, parse);
  if (primary) return primary;

  const backupPath = `${path}.bak`;
  const backup = await readParsed(backupPath, maxBytes, parse);
  if (!backup) return null;

  try {
    const content = await storage.readFile(backupPath, maxBytes);
    await replaceText(path, content);
  } catch {
  }
  return backup;
}

export async function writeRecoverableText(path: string, content: string, maxBytes: number): Promise<number> {
  const byteLength = encoder.encode(content).byteLength;
  if (byteLength > maxBytes) {
    throw new Error('Whiteboard file is too large');
  }

  const storage = getStorageAdapter();
  const tempPath = getTempPath(path);
  try {
    await storage.writeFile(tempPath, content, { recursive: true });
    if (await storage.exists(path)) {
      await storage.copyFile(path, `${path}.bak`);
    }
    await storage.rename(tempPath, path);
    return byteLength;
  } catch (error) {
    await storage.deleteFile(tempPath).catch(() => undefined);
    throw error;
  }
}

async function readParsed<T>(
  path: string,
  maxBytes: number,
  parse: (content: string) => T | null,
): Promise<T | null> {
  const storage = getStorageAdapter();
  if (!await storage.exists(path)) return null;
  try {
    return parse(await storage.readFile(path, maxBytes));
  } catch {
    return null;
  }
}

async function replaceText(path: string, content: string): Promise<void> {
  const storage = getStorageAdapter();
  const tempPath = getTempPath(path);
  try {
    await storage.writeFile(tempPath, content, { recursive: true });
    await storage.rename(tempPath, path);
  } catch (error) {
    await storage.deleteFile(tempPath).catch(() => undefined);
    throw error;
  }
}

function getTempPath(path: string): string {
  return `${path}.${crypto.randomUUID()}.tmp`;
}

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { writeRecoverableText } from './whiteboardTextStorage';

const mocks = vi.hoisted(() => ({
  storage: {
    copyFile: vi.fn(async () => undefined),
    deleteFile: vi.fn(async () => undefined),
    exists: vi.fn(async () => true),
    platform: 'web' as 'electron' | 'web',
    rename: vi.fn(async () => undefined),
    writeFile: vi.fn(async () => undefined),
  },
}));

vi.mock('@/lib/storage/adapter', () => ({
  getStorageAdapter: () => mocks.storage,
}));

describe('whiteboardTextStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.storage.platform = 'web';
  });

  it('uses one atomic write for recoverable text in web storage', async () => {
    const content = 'large whiteboard';
    const byteLength = new TextEncoder().encode(content).byteLength;

    await expect(writeRecoverableText('/boards/board.json', content, 1024)).resolves.toBe(byteLength);

    expect(mocks.storage.writeFile).toHaveBeenCalledWith('/boards/board.json', content, {
      byteLength,
      maxBytes: 1024,
      recursive: true,
    });
    expect(mocks.storage.exists).not.toHaveBeenCalled();
    expect(mocks.storage.copyFile).not.toHaveBeenCalled();
    expect(mocks.storage.rename).not.toHaveBeenCalled();
  });

  it('keeps the temporary file and backup protocol for desktop storage', async () => {
    mocks.storage.platform = 'electron';

    await writeRecoverableText('/boards/board.json', 'content', 1024);

    expect(mocks.storage.writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/^\/boards\/board\.json\..+\.tmp$/),
      'content',
      { byteLength: 7, maxBytes: 1024, recursive: true },
    );
    expect(mocks.storage.copyFile).toHaveBeenCalledWith('/boards/board.json', '/boards/board.json.bak', 1024);
    expect(mocks.storage.rename).toHaveBeenCalledWith(
      expect.stringMatching(/^\/boards\/board\.json\..+\.tmp$/),
      '/boards/board.json',
    );
  });

  it('computes UTF-8 byte length correctly across large text chunks', async () => {
    const content = `${'a'.repeat(256 * 1024 - 1)}\ud83d\ude00`;

    await writeRecoverableText('/boards/unicode.json', content, content.length + 4);

    expect(mocks.storage.writeFile).toHaveBeenCalledWith('/boards/unicode.json', content, {
      byteLength: new TextEncoder().encode(content).byteLength,
      maxBytes: content.length + 4,
      recursive: true,
    });
  });

  it('passes an explicit unbounded write through to the storage adapter', async () => {
    mocks.storage.platform = 'electron';

    await expect(writeRecoverableText('/boards/large.json', 'content', null)).resolves.toBe(7);

    expect(mocks.storage.writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/^\/boards\/large\.json\..+\.tmp$/),
      'content',
      { byteLength: 7, maxBytes: null, recursive: true },
    );
    expect(mocks.storage.copyFile).toHaveBeenCalledWith(
      '/boards/large.json',
      '/boards/large.json.bak',
      null,
    );
  });
});

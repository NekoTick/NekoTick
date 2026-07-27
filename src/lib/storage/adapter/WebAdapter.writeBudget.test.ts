import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MAX_WEB_ADAPTER_FILE_BYTES, WebAdapter } from './WebAdapter';

interface StoredFileForTest {
  path: string;
  content: string | Uint8Array;
  isBinary: boolean;
  size: number;
  modifiedAt: number;
  createdAt: number;
}

describe('WebAdapter write budgets', () => {
  let adapter: WebAdapter;

  beforeEach(() => {
    adapter = new WebAdapter();
  });

  function replaceReadStoredFile(
    readStoredFile: (path: string) => Promise<StoredFileForTest | undefined>,
  ): () => void {
    const target = adapter as unknown as {
      readStoredFile: (path: string) => Promise<StoredFileForTest | undefined>;
    };
    const original = target.readStoredFile;
    target.readStoredFile = readStoredFile;
    return () => {
      target.readStoredFile = original;
    };
  }

  it('rejects appending text past the web write limit before storing a replacement', async () => {
    const restore = replaceReadStoredFile(async () => ({
      path: '/write-budget/huge.md',
      content: '',
      isBinary: false,
      size: MAX_WEB_ADAPTER_FILE_BYTES,
      modifiedAt: 1,
      createdAt: 1,
    }));

    try {
      await expect(adapter.writeFile('/write-budget/huge.md', 'x', { append: true })).rejects.toThrow(
        'Web content is too large to write',
      );
    } finally {
      restore();
    }

    await expect(adapter.exists('/write-budget/huge.md')).resolves.toBe(false);
  });

  it('rejects oversized recursive text writes before creating parent directories', async () => {
    const originalBlob = globalThis.Blob;
    vi.stubGlobal('Blob', class {
      readonly size = MAX_WEB_ADAPTER_FILE_BYTES + 1;
    } as unknown as typeof Blob);

    try {
      await expect(
        adapter.writeFile('/write-budget/new/huge.md', 'x', { recursive: true }),
      ).rejects.toThrow('Web content is too large to write');
    } finally {
      vi.stubGlobal('Blob', originalBlob);
    }

    await expect(adapter.exists('/write-budget/new')).resolves.toBe(false);
  });

  it('reuses a precomputed UTF-8 byte length for text writes', async () => {
    const originalBlob = globalThis.Blob;
    vi.stubGlobal('Blob', class {
      constructor() {
        throw new Error('text byte length was recomputed');
      }
    } as unknown as typeof Blob);

    try {
      await adapter.writeFile('/write-budget/known.md', 'hello', {
        byteLength: 5,
        recursive: true,
      });
    } finally {
      vi.stubGlobal('Blob', originalBlob);
    }

    await expect(adapter.readFile('/write-budget/known.md')).resolves.toBe('hello');
  });

  it('allows explicitly unbounded text writes while retaining the default write limit', async () => {
    await expect(adapter.writeFile('/write-budget/board.json', 'content', {
      byteLength: MAX_WEB_ADAPTER_FILE_BYTES + 1,
      maxBytes: null,
      recursive: true,
    })).resolves.toBeUndefined();

    await expect(adapter.readFile('/write-budget/board.json', null)).resolves.toBe('content');
  });

  it('requires an explicit null to read past the default web file limit', async () => {
    const restore = replaceReadStoredFile(async () => ({
      path: '/write-budget/large-board.json',
      content: 'content',
      isBinary: false,
      size: MAX_WEB_ADAPTER_FILE_BYTES + 1,
      modifiedAt: 1,
      createdAt: 1,
    }));

    try {
      await expect(adapter.readFile('/write-budget/large-board.json')).rejects.toThrow('File is too large to read');
      await expect(adapter.readFile('/write-budget/large-board.json', null)).resolves.toBe('content');
    } finally {
      restore();
    }
  });

  it('stores prebuilt text blobs without materializing a large string', async () => {
    await adapter.writeFileBlob('/write-budget/board-blob.json', new Blob(['content']), {
      maxBytes: null,
      recursive: true,
    });

    await expect(adapter.readFile('/write-budget/board-blob.json', null)).resolves.toBe('content');
  });

  it('rejects appending binary data past the web write limit before storing a replacement', async () => {
    const restore = replaceReadStoredFile(async () => ({
      path: '/write-budget/huge.bin',
      content: new Uint8Array(),
      isBinary: true,
      size: MAX_WEB_ADAPTER_FILE_BYTES,
      modifiedAt: 1,
      createdAt: 1,
    }));

    try {
      await expect(
        adapter.writeBinaryFile('/write-budget/huge.bin', new Uint8Array([1]), { append: true }),
      ).rejects.toThrow('Web content is too large to write');
    } finally {
      restore();
    }

    await expect(adapter.exists('/write-budget/huge.bin')).resolves.toBe(false);
  });

  it('rejects oversized recursive binary writes before creating parent directories', async () => {
    const oversized = { byteLength: MAX_WEB_ADAPTER_FILE_BYTES + 1 } as Uint8Array;

    await expect(
      adapter.writeBinaryFile('/write-budget/assets/huge.bin', oversized, { recursive: true }),
    ).rejects.toThrow('Web content is too large to write');

    await expect(adapter.exists('/write-budget/assets')).resolves.toBe(false);
  });

  it('does not turn append read failures into overwrites', async () => {
    await adapter.writeFile('/write-budget/original.md', 'original', { recursive: true });
    const restore = replaceReadStoredFile(async () => {
      throw new Error('IndexedDB read failed');
    });

    try {
      await expect(adapter.writeFile('/write-budget/original.md', ' replacement', { append: true })).rejects.toThrow(
        'IndexedDB read failed',
      );
    } finally {
      restore();
    }

    await expect(adapter.readFile('/write-budget/original.md')).resolves.toBe('original');
  });

  it('still appends to missing web files as new files', async () => {
    await adapter.writeFile('/write-budget/new.md', 'created', { append: true, recursive: true });

    await expect(adapter.readFile('/write-budget/new.md')).resolves.toBe('created');
  });
});

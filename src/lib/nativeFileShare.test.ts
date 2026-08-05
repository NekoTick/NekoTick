import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  configureNativeFileShare,
  hasNativeFileShare,
  shareNativeFile,
} from './nativeFileShare';

afterEach(() => {
  configureNativeFileShare(null);
});

describe('native file sharing runtime', () => {
  it('reports an unavailable native handler without consuming the file', async () => {
    const request = {
      data: new Uint8Array([1, 2, 3]),
      fileName: 'note.html',
      mimeType: 'text/html',
    };

    expect(hasNativeFileShare()).toBe(false);
    await expect(shareNativeFile(request)).resolves.toBe(false);
  });

  it('forwards files to the configured native handler', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const request = {
      data: new Uint8Array([1, 2, 3]),
      fileName: 'note.html',
      mimeType: 'text/html',
      title: 'Note',
    };
    configureNativeFileShare(handler);

    expect(hasNativeFileShare()).toBe(true);
    await expect(shareNativeFile(request)).resolves.toBe(true);
    expect(handler).toHaveBeenCalledWith(request);
  });
});

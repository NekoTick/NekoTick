import { describe, expect, it } from 'vitest';
import { encodeFilesystemBinary, readFilesystemBinary } from './capacitorBinary';

describe('Capacitor binary conversion', () => {
  it('round trips binary data without argument-size dependent spreading', async () => {
    const bytes = Uint8Array.from({ length: 100_000 }, (_, index) => index % 251);
    const encoded = encodeFilesystemBinary(bytes);
    await expect(readFilesystemBinary(encoded)).resolves.toEqual(bytes);
  });

  it('reads Blob results from the web implementation', async () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 255]);
    await expect(readFilesystemBinary(new Blob([bytes]))).resolves.toEqual(bytes);
  });
});

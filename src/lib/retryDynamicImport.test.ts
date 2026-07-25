import { describe, expect, it, vi } from 'vitest';
import { isTransientDynamicImportError, retryDynamicImport } from './retryDynamicImport';

describe('retryDynamicImport', () => {
  it('retries transient dynamic import fetch failures', async () => {
    const load = vi.fn<() => Promise<{ value: string }>>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch dynamically imported module: /NotesView.tsx'))
      .mockResolvedValueOnce({ value: 'loaded' });
    const wait = vi.fn(async () => undefined);

    await expect(retryDynamicImport(load, wait)).resolves.toEqual({ value: 'loaded' });

    expect(load).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(150);
  });

  it('does not retry module evaluation errors', async () => {
    const error = new Error('Module initialization failed');
    const load = vi.fn<() => Promise<never>>().mockRejectedValue(error);
    const wait = vi.fn(async () => undefined);

    await expect(retryDynamicImport(load, wait)).rejects.toBe(error);

    expect(load).toHaveBeenCalledOnce();
    expect(wait).not.toHaveBeenCalled();
  });

  it('recognizes browser and bundler chunk load failures', () => {
    expect(isTransientDynamicImportError(new Error('Importing a module script failed.'))).toBe(true);
    expect(isTransientDynamicImportError(Object.assign(new Error('chunk failed'), { name: 'ChunkLoadError' }))).toBe(true);
    expect(isTransientDynamicImportError(new Error('Rendered more hooks than expected'))).toBe(false);
  });
});

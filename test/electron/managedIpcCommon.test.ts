import { describe, expect, it } from 'vitest';
import { getManagedErrorMessage } from '../../electron/managedIpcCommon.mjs';

describe('managed IPC common helpers', () => {
  it('always returns a string for hostile Error message properties', () => {
    const error = new Error('original');
    Object.defineProperty(error, 'message', {
      get: () => ({ secret: 'fake-secret-value' }),
    });

    expect(getManagedErrorMessage(error)).toBe('Unknown error');
  });
});

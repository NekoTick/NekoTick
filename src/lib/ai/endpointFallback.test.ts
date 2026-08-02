import { describe, expect, it } from 'vitest';
import {
  extractEndpointErrorCode,
  extractEndpointErrorText,
  extractEndpointStatusCode,
  shouldTryAlternateEndpointAfterEndpointError,
} from './endpointFallback';

describe('endpoint fallback error inspection', () => {
  it('does not invoke throwing fields on untrusted errors', () => {
    const error = Object.defineProperties({}, {
      code: { get: () => { throw new Error('hostile code getter'); } },
      details: { get: () => { throw new Error('hostile details getter'); } },
      error: { get: () => { throw new Error('hostile nested error getter'); } },
      errorCode: { get: () => { throw new Error('hostile errorCode getter'); } },
      message: { get: () => { throw new Error('hostile message getter'); } },
      status: { get: () => { throw new Error('hostile status getter'); } },
      statusCode: { get: () => { throw new Error('hostile statusCode getter'); } },
    });

    expect(() => extractEndpointStatusCode(error)).not.toThrow();
    expect(() => extractEndpointErrorCode(error)).not.toThrow();
    expect(() => extractEndpointErrorText(error)).not.toThrow();
    expect(() => shouldTryAlternateEndpointAfterEndpointError(error)).not.toThrow();
    expect(extractEndpointStatusCode(error)).toBeNull();
    expect(extractEndpointErrorCode(error)).toBe('');
    expect(extractEndpointErrorText(error)).toBe('');
  });
});

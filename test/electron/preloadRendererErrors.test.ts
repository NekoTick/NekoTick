import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { createRendererErrorReport, sanitizeLocationHref } = require(
  '../../electron/preloadRendererErrors.cjs',
);
const originalUrl = window.location.href;

afterEach(() => {
  window.history.replaceState({}, '', originalUrl);
});

describe('renderer error report privacy', () => {
  it('removes query values and hashes from the actual renderer href', () => {
    window.history.replaceState(
      {},
      '',
      '/index.html?notesRootPath=%2Fprivate%2Fnotes&notePath=secret.md#private-heading',
    );

    const report = createRendererErrorReport({ message: 'test' });

    expect(report.href).toBe(`${window.location.origin}/index.html`);
    expect(report.href).not.toContain('private');
    expect(report.href).not.toContain('secret.md');
    expect(report.location.searchKeys).toEqual(['notesRootPath', 'notePath']);
    expect(report.location.hash).toBe('');
  });

  it('returns an empty href for malformed values', () => {
    expect(sanitizeLocationHref('not a URL')).toBe('');
  });
});

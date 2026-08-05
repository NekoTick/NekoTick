import { describe, expect, it } from 'vitest';
import {
  MAX_WEB_SEARCH_STATUS_JSON_LENGTH,
  MAX_WEB_SEARCH_STATUS_MARKUPS,
  extractWebSearchStatuses,
  sanitizeWebSearchSourceUrl,
} from './statusMarkup';

function legacyStatusMarkup(status: unknown): string {
  const json = JSON.stringify(status)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<web-search-status>${json}</web-search-status>`;
}

describe('web search status markup', () => {
  it('round-trips status payloads and removes markup from content', () => {
    const markup = legacyStatusMarkup({
      phase: 'results',
      query: 'a < b & c',
      results: [{ title: 'Title', url: 'https://example.com', snippet: 'Summary', publishedAt: null }],
    });

    const parsed = extractWebSearchStatuses(`${markup}\n\nAnswer`);

    expect(parsed.statuses).toEqual([
      {
        phase: 'results',
        query: 'a < b & c',
        results: [{ title: 'Title', url: 'https://example.com', snippet: 'Summary', publishedAt: null }],
      },
    ]);
    expect(parsed.content).toBe('Answer');
  });

  it('drops malformed or unsafe status payload fields', () => {
    const markup = legacyStatusMarkup({
      phase: 'results',
      query: 'safe',
      urls: ['javascript:alert(1)', 'https://example.com/read'],
      results: [
        { title: 'Unsafe', url: 'javascript:alert(1)', snippet: 'Bad', publishedAt: null },
        { title: 'Safe', url: 'https://example.com', snippet: 'Good', publishedAt: null },
      ],
      failedSources: [
        { url: 'data:text/html,hello', message: 'Bad' },
        { url: 'https://example.com/fail', message: 'Skipped' },
      ],
      metrics: { durationMs: 12.6 },
    });
    const invalidMarkup = '<web-search-status>{"phase":"invalid","urls":["https://example.com"]}</web-search-status>';

    const parsed = extractWebSearchStatuses(`${markup}${invalidMarkup}Answer`);

    expect(parsed.statuses).toEqual([
      {
        phase: 'results',
        query: 'safe',
        urls: ['https://example.com/read'],
        results: [{ title: 'Safe', url: 'https://example.com', snippet: 'Good', publishedAt: null }],
        failedSources: [{ url: 'https://example.com/fail', message: 'Skipped' }],
        metrics: { durationMs: 13 },
      },
    ]);
    expect(parsed.content).toBe('Answer');
  });

  it('drops local network and control-character source URLs', () => {
    const markup = legacyStatusMarkup({
      phase: 'results',
      urls: [
        'https://example.com/read',
        'http://127.0.0.1:3000/admin',
        'http://localhost/admin',
        'http://router/admin',
        'http://192.168.1.1/admin',
        'https://user:pass@example.com/private',
        'https:example.com/no-slashes',
        'https://example.com\\@internal.test/admin',
        'https://example.com/\u202Ecod.exe',
      ],
      results: [
        { title: 'Loopback', url: 'http://2130706433/admin', snippet: 'Bad', publishedAt: null },
        { title: 'Safe', url: ' https://safe.example/article ', snippet: 'Good', publishedAt: null },
      ],
      failedSources: [
        { url: 'http://[::1]/admin', message: 'Bad' },
        { url: 'https://safe.example/fail', message: 'Skipped' },
      ],
    });

    const parsed = extractWebSearchStatuses(`${markup}Answer`);

    expect(parsed.statuses).toEqual([
      {
        phase: 'results',
        urls: ['https://example.com/read'],
        results: [{ title: 'Safe', url: 'https://safe.example/article', snippet: 'Good', publishedAt: null }],
        failedSources: [{ url: 'https://safe.example/fail', message: 'Skipped' }],
      },
    ]);
    expect(parsed.content).toBe('Answer');
  });

  it('limits parsed status markup count while still stripping excess markup', () => {
    const markup = legacyStatusMarkup({ phase: 'searching', query: 'bounded' });
    const parsed = extractWebSearchStatuses(`${markup.repeat(MAX_WEB_SEARCH_STATUS_MARKUPS + 2)}Answer`);

    expect(parsed.statuses).toHaveLength(MAX_WEB_SEARCH_STATUS_MARKUPS);
    expect(parsed.content).toBe('Answer');
  });

  it('keeps parsing case-insensitive status tags', () => {
    const parsed = extractWebSearchStatuses(
      '<WEB-SEARCH-STATUS>{"phase":"searching","query":"Case"}</WEB-SEARCH-STATUS>Answer'
    );

    expect(parsed.statuses).toEqual([{ phase: 'searching', query: 'Case' }]);
    expect(parsed.content).toBe('Answer');
  });

  it('strips oversized status payloads without parsing them', () => {
    const parsed = extractWebSearchStatuses(
      `<web-search-status>${'x'.repeat(MAX_WEB_SEARCH_STATUS_JSON_LENGTH + 1)}</web-search-status>Answer`
    );

    expect(parsed.statuses).toEqual([]);
    expect(parsed.content).toBe('Answer');
  });

  it('strips unterminated status markup instead of exposing internal status text', () => {
    const content = `Visible before <web-search-status>${'x'.repeat(MAX_WEB_SEARCH_STATUS_JSON_LENGTH + 1)}Answer`;
    const parsed = extractWebSearchStatuses(content);

    expect(parsed.statuses).toEqual([]);
    expect(parsed.content).toBe('Visible before');
  });

  it('accepts only public http sources', () => {
    expect(sanitizeWebSearchSourceUrl('https://example.com')).toBe('https://example.com');
    expect(sanitizeWebSearchSourceUrl('http://example.com/path')).toBe('http://example.com/path');
    expect(sanitizeWebSearchSourceUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizeWebSearchSourceUrl('data:text/html,hello')).toBeNull();
    expect(sanitizeWebSearchSourceUrl('mailto:user@example.com')).toBeNull();
    expect(sanitizeWebSearchSourceUrl('/relative')).toBeNull();
    expect(sanitizeWebSearchSourceUrl('http://10.0.0.1/admin')).toBeNull();
    expect(sanitizeWebSearchSourceUrl('http://service.local/admin')).toBeNull();
    expect(sanitizeWebSearchSourceUrl('https://user:pass@example.com/private')).toBeNull();
    expect(sanitizeWebSearchSourceUrl('https:example.com/path')).toBeNull();
    expect(sanitizeWebSearchSourceUrl('https://example.com\\@internal.test/path')).toBeNull();
    expect(sanitizeWebSearchSourceUrl('https://example.com/\u0000path')).toBeNull();
    expect(sanitizeWebSearchSourceUrl(`https://example.com/${'a'.repeat(4096)}`)).toBeNull();
    expect(sanitizeWebSearchSourceUrl(`${' '.repeat(4097)}https://example.com`)).toBeNull();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { isBlockedIp, normalizePublicHttpUrl, resolvePublicUrl } from '../electron/webSearch/ssrfGuard.mjs';

describe('web search SSRF guard', () => {
  it('does not classify normal hostnames as blocked IPs', () => {
    expect(isBlockedIp('example.com')).toBe(false);
  });

  it('does not coerce non-string IP inputs', () => {
    const ip = {
      toString: vi.fn(() => {
        throw new Error('ip coercion');
      }),
    };

    expect(isBlockedIp(ip)).toBe(false);
    expect(isBlockedIp('1'.repeat(129))).toBe(false);
    expect(ip.toString).not.toHaveBeenCalled();
  });

  it('blocks loopback and private IPs', () => {
    expect(isBlockedIp('127.0.0.1')).toBe(true);
    expect(isBlockedIp('10.0.0.1')).toBe(true);
    expect(isBlockedIp('192.168.1.1')).toBe(true);
    expect(isBlockedIp('172.16.0.1')).toBe(true);
    expect(isBlockedIp('100.64.0.1')).toBe(true);
    expect(isBlockedIp('198.18.0.1')).toBe(true);
    expect(isBlockedIp('192.0.2.1')).toBe(true);
    expect(isBlockedIp('198.51.100.1')).toBe(true);
    expect(isBlockedIp('203.0.113.1')).toBe(true);
    expect(isBlockedIp('::1')).toBe(true);
    expect(isBlockedIp('::ffff:172.16.0.1')).toBe(true);
    expect(isBlockedIp('[::ffff:7f00:1]')).toBe(true);
    expect(isBlockedIp('::ffff:169.254.1.1')).toBe(true);
    expect(isBlockedIp('[fe90::1]')).toBe(true);
    expect(isBlockedIp('febf::1')).toBe(true);
    expect(isBlockedIp('fed0::1')).toBe(true);
    expect(isBlockedIp('ff02::1')).toBe(true);
    expect(isBlockedIp('2001:db8::1')).toBe(true);
    expect(isBlockedIp('2002::1')).toBe(true);
  });

  it('blocks IPv6 translation and special-purpose ranges', () => {
    expect(isBlockedIp('64:ff9b::c000:201')).toBe(true);
    expect(isBlockedIp('64:ff9b:1::1')).toBe(true);
    expect(isBlockedIp('100::1')).toBe(true);
    expect(isBlockedIp('2001:1ff:ffff::1')).toBe(true);
    expect(isBlockedIp('3fff:fff::1')).toBe(true);
    expect(isBlockedIp('5f00::1')).toBe(true);

    expect(isBlockedIp('64:ff9b:2::1')).toBe(false);
    expect(isBlockedIp('101::1')).toBe(false);
    expect(isBlockedIp('2001:200::1')).toBe(false);
    expect(isBlockedIp('3fff:1000::1')).toBe(false);
  });

  it('allows only http and https URL protocols', () => {
    expect(normalizePublicHttpUrl('https://example.com/path').toString()).toBe('https://example.com/path');
    expect(() => normalizePublicHttpUrl('file:///etc/passwd')).toThrow('Only HTTP and HTTPS URLs are supported.');
  });

  it('rejects URLs with credentials', () => {
    expect(() => normalizePublicHttpUrl('https://user:pass@example.com/path')).toThrow('URL credentials are not supported.');
  });

  it('rejects ambiguous or unsafe HTTP URL syntax before normalization', () => {
    expect(() => normalizePublicHttpUrl('https:example.com/path')).toThrow('Invalid URL.');
    expect(() => normalizePublicHttpUrl('http:/example.com/path')).toThrow('Invalid URL.');
    expect(() => normalizePublicHttpUrl('https://example.com\\@internal.test/path')).toThrow('Invalid URL.');
    expect(() => normalizePublicHttpUrl('https://example.com/\u202Ecod.exe')).toThrow('Invalid URL.');
  });

  it('rejects non-string and overlong URLs before coercion or parsing', () => {
    const rawUrl = {
      toString: vi.fn(() => {
        throw new Error('url coercion');
      }),
    };

    expect(() => normalizePublicHttpUrl(rawUrl)).toThrow('Invalid URL.');
    expect(rawUrl.toString).not.toHaveBeenCalled();
    expect(() => normalizePublicHttpUrl(`https://example.com/${'a'.repeat(4096)}`)).toThrow('Invalid URL.');
  });

  it('blocks local hostnames before DNS resolution', async () => {
    await expect(resolvePublicUrl('http://router/admin')).rejects.toMatchObject({ code: 'blocked_url' });
    await expect(resolvePublicUrl('http://service.home.arpa/admin')).rejects.toMatchObject({ code: 'blocked_url' });
    await expect(resolvePublicUrl('http://assets.localhost/admin')).rejects.toMatchObject({ code: 'blocked_url' });
    await expect(resolvePublicUrl('http://[64:ff9b::c000:201]/admin')).rejects.toMatchObject({ code: 'blocked_url' });
  });
});

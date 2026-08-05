import { afterEach, describe, expect, it, vi } from 'vitest';
import { isBlockedNativeProviderUrl } from './nativeProviderUrlPolicy';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('native provider URL policy', () => {
  it('allows empty drafts and valid HTTPS URLs on native mobile', () => {
    vi.stubGlobal('Capacitor', { isNativePlatform: () => true });

    expect(isBlockedNativeProviderUrl('')).toBe(false);
    expect(isBlockedNativeProviderUrl(' https://api.example.test/v1 ')).toBe(false);
  });

  it.each([
    'http://api.example.test',
    'https://',
    'https://user:secret@api.example.test',
    'not a URL',
  ])('blocks invalid native provider URL %s', (apiHost) => {
    vi.stubGlobal('Capacitor', { isNativePlatform: () => true });

    expect(isBlockedNativeProviderUrl(apiHost)).toBe(true);
  });

  it('leaves desktop provider URL compatibility unchanged', () => {
    vi.stubGlobal('Capacitor', { isNativePlatform: () => false });

    expect(isBlockedNativeProviderUrl('http://localhost:11434')).toBe(false);
  });
});

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LanguageTab } from './LanguageTab';

vi.mock('@/lib/i18n', () => ({
  APP_LANGUAGES: [
    { code: 'en', nativeName: 'English' },
    { code: 'zh-CN', nativeName: '简体中文' },
  ],
  SYSTEM_LANGUAGE_PREFERENCE: 'system',
  getBrowserLanguages: () => ['en'],
  resolveSystemLanguage: () => 'en',
  useI18n: () => ({
    languagePreference: 'en',
    setLanguagePreference: vi.fn(),
    t: (key: string) => key === 'common.system' ? 'System' : key,
  }),
}));

describe('LanguageTab', () => {
  it('exposes the selected language to assistive technology', () => {
    render(<LanguageTab />);

    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '简体中文' })).toHaveAttribute('aria-pressed', 'false');
  });
});

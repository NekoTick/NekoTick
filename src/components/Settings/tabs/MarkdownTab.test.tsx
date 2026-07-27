import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MarkdownTab } from './MarkdownTab';

const mocks = vi.hoisted(() => ({
  state: {
    typewriterMode: false,
    bodyLineNumbers: false,
    codeLineNumbers: false,
    setMarkdownTypewriterMode: vi.fn(),
    setMarkdownBodyLineNumbers: vi.fn(),
    setMarkdownCodeBlockLineNumbers: vi.fn(),
  },
}));

vi.mock('@/stores/unified/useUnifiedStore', () => ({
  useUnifiedStore: (selector: (state: typeof mocks.state) => unknown) => selector(mocks.state),
}));

vi.mock('@/stores/unified/settings/markdownSettings', () => ({
  selectMarkdownTypewriterModeEnabled: (state: typeof mocks.state) => state.typewriterMode,
  selectMarkdownBodyLineNumbersEnabled: (state: typeof mocks.state) => state.bodyLineNumbers,
  selectCodeBlockLineNumbersEnabled: (state: typeof mocks.state) => state.codeLineNumbers,
}));

vi.mock('@/components/ui/shortcut-keys', () => ({
  ShortcutKeys: () => null,
  SOFT_SHORTCUT_KEY_CLASSNAME: '',
}));

vi.mock('./ImagesTab', () => ({ ImagesTab: () => null }));

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

describe('MarkdownTab', () => {
  it('names each Markdown switch with its visible setting label', () => {
    render(<MarkdownTab />);

    expect(screen.getByRole('switch', { name: 'settings.markdown.typewriterMode' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'settings.markdown.bodyLineNumbers' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'settings.markdown.showLineNumbers' })).toBeInTheDocument();
  });
});

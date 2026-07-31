import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImportedMarkdownTheme } from '@/lib/markdown/theme-compatibility/types';
import { MarkdownThemeLoader } from './MarkdownThemeLoader';
import { clearCompiledImportedMarkdownThemeStyles } from './markdownThemeCompiler';

type MarkdownThemeMockStore = {
  setMarkdownImportedThemeId: (importedThemeId: string | null) => void;
  data: {
    settings: {
      markdown: {
        typewriterMode: boolean;
        theme: {
          importedThemeId: string | null;
        };
        body: {
          showLineNumbers: boolean;
        };
        codeBlock: {
          showLineNumbers: boolean;
        };
      };
    };
  };
};

const mocks = vi.hoisted(() => ({
  readImportedMarkdownTheme: vi.fn(),
  useUnifiedStore: vi.fn(),
  store: {
    setMarkdownImportedThemeId: vi.fn(),
    data: {
      settings: {
        markdown: {
          typewriterMode: false,
          theme: {
            importedThemeId: 'clean-light',
          },
          body: {
            showLineNumbers: false,
          },
          codeBlock: {
            showLineNumbers: false,
          },
        },
      },
    },
  } as MarkdownThemeMockStore,
}));

vi.mock('@/lib/markdown/theme-compatibility/importedThemeStorage', () => ({
  readImportedMarkdownTheme: (...args: unknown[]) => mocks.readImportedMarkdownTheme(...args),
}));

vi.mock('@/stores/unified/useUnifiedStore', () => ({
  useUnifiedStore: (selector: (state: typeof mocks.store) => unknown) => mocks.useUnifiedStore(selector),
}));

function setMarkdownTheme(importedThemeId: string | null) {
  mocks.store.data = {
    ...mocks.store.data,
    settings: {
      ...mocks.store.data.settings,
      markdown: {
        ...mocks.store.data.settings.markdown,
        theme: { importedThemeId },
      },
    },
  };
}

function importedTheme(theme: Partial<ImportedMarkdownTheme>): ImportedMarkdownTheme {
  return {
    id: 'clean-light',
    name: 'Clean Light',
    platform: 'typora',
    cssFile: 'clean-light.css',
    sourcePath: null,
    createdAt: 1,
    updatedAt: 1,
    css: '#write h1 { color: red; } body { --bg-color: white; }',
    ...theme,
  };
}

const importedThemeWaitForOptions = { timeout: 3000 };

describe('MarkdownThemeLoader', () => {
  beforeEach(() => {
    document.head.querySelectorAll('style[data-vlaina-imported-markdown-theme="true"]').forEach((element) => {
      element.remove();
    });
    document.head.querySelectorAll('style[data-vlaina-imported-markdown-theme-post-bridge="true"]').forEach((element) => {
      element.remove();
    });
    document.head.querySelectorAll('style[data-vlaina-imported-app-theme="true"]').forEach((element) => {
      element.remove();
    });
    document.documentElement.removeAttribute('data-vlaina-imported-app-theme');
    document.documentElement.removeAttribute('data-vlaina-imported-app-theme-platform');
    clearCompiledImportedMarkdownThemeStyles();
    setMarkdownTheme('clean-light');
    mocks.readImportedMarkdownTheme.mockResolvedValue(importedTheme({}));
    mocks.store.setMarkdownImportedThemeId = vi.fn();
    mocks.useUnifiedStore.mockImplementation((selector: (state: typeof mocks.store) => unknown) =>
      selector(mocks.store)
    );
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('injects imported theme CSS only after scoping it to the markdown root', async () => {
    render(<MarkdownThemeLoader />);

    await waitFor(() => {
      const style = document.head.querySelector<HTMLStyleElement>(
        'style[data-vlaina-imported-markdown-theme="true"]'
      );
      expect(style?.textContent).toContain('[data-markdown-theme-root="true"][data-markdown-imported-theme="clean-light"]#write h1');
      expect(style?.textContent).toContain('[data-markdown-theme-root="true"][data-markdown-imported-theme="clean-light"] { --bg-color: white; }');
      expect(style?.textContent).not.toMatch(/(^|[}\n]\s*)body\s*\{/);
    }, importedThemeWaitForOptions);
  });

  it('bridges imported theme variables into app shell tokens for shared UI surfaces', async () => {
    mocks.readImportedMarkdownTheme.mockResolvedValue(importedTheme({
      id: 'typora-sample',
      css: [
        ':root {',
        '  --db: #fff;',
        '  --df: #1c1e1f;',
        '  --df-a: #7d868a;',
        '  --pn-c: #ebedef;',
        '  --a-c: #d36c28;',
        '  --v-selected-c: #1c1e1f33;',
        '}',
        '#write h1 { color: red; }',
      ].join('\n'),
    }));

    render(<MarkdownThemeLoader />);

    await waitFor(() => {
      const style = document.head.querySelector<HTMLStyleElement>(
        'style[data-vlaina-imported-app-theme="true"]'
      );
      expect(document.documentElement.getAttribute('data-vlaina-imported-app-theme')).toBe('typora-sample');
      expect(document.documentElement.getAttribute('data-vlaina-imported-app-theme-platform')).toBe('typora');
      expect(style?.textContent).toContain(':root[data-vlaina-imported-app-theme="typora-sample"]');
      expect(style?.textContent).toContain('--vlaina-color-surface-main: var(--db);');
      expect(style?.textContent).toContain('--vlaina-color-setting-panel: var(--db);');
      expect(style?.textContent).toContain('--vlaina-sidebar-surface: var(--pn-c);');
      expect(style?.textContent).toContain('--vlaina-sidebar-row-selected-bg: var(--v-selected-c);');
      expect(style?.textContent).not.toContain('#write h1');
    }, importedThemeWaitForOptions);
  });

  it('injects the Typora post bridge after imported theme CSS so DOM compatibility fixes win', async () => {
    mocks.readImportedMarkdownTheme.mockResolvedValue(importedTheme({
      id: 'typora-sample',
      platform: 'typora',
      css: [
        ':root { --db: #fff; --df: #1c1e1f; --v-write-w: 900px; }',
        '#write.done::before { content: ""; background: red; }',
        '#write .v-caption.full { position: fixed; }',
        '#write .v-tag { white-space: nowrap !important; }',
      ].join('\n'),
    }));

    render(<MarkdownThemeLoader />);

    await waitFor(() => {
      const importedStyle = document.head.querySelector<HTMLStyleElement>(
        'style[data-vlaina-imported-markdown-theme="true"]'
      );
      const appStyle = document.head.querySelector<HTMLStyleElement>(
        'style[data-vlaina-imported-app-theme="true"]'
      );
      const postBridgeStyle = document.head.querySelector<HTMLStyleElement>(
        'style[data-vlaina-imported-markdown-theme-post-bridge="true"]'
      );

      expect(importedStyle).toBeInstanceOf(HTMLStyleElement);
      expect(appStyle).toBeInstanceOf(HTMLStyleElement);
      expect(postBridgeStyle).toBeInstanceOf(HTMLStyleElement);
      expect(postBridgeStyle?.id).toBe('vlaina-imported-markdown-theme-post-bridge-typora-sample');
      expect(postBridgeStyle?.textContent).toContain('[data-markdown-imported-theme="typora-sample"].theme-typora');
      expect(postBridgeStyle?.textContent).not.toContain('.done::before');
      expect(postBridgeStyle?.textContent).toContain('.v-caption.full');
      expect(postBridgeStyle?.textContent).toContain(':is(.v-tag, .editor-tag-token, .v-badge-name, .v-badge-value, .v-stepwise, .v-coating)');
      expect(postBridgeStyle?.textContent).toContain('white-space: break-spaces !important;');
      expect(postBridgeStyle?.textContent).toContain('white-space: normal !important;');
      expect(postBridgeStyle?.textContent).toContain('max-width: 100% !important;');
      expect(postBridgeStyle?.textContent).toContain('background: transparent !important;');
      expect(Array.from(document.head.children).indexOf(postBridgeStyle as HTMLStyleElement)).toBeGreaterThan(
        Array.from(document.head.children).indexOf(importedStyle as HTMLStyleElement)
      );
      expect(Array.from(document.head.children).indexOf(postBridgeStyle as HTMLStyleElement)).toBeGreaterThan(
        Array.from(document.head.children).indexOf(appStyle as HTMLStyleElement)
      );
    }, importedThemeWaitForOptions);
  });

  it('injects a post bridge for normal Typora imported themes', async () => {
    mocks.readImportedMarkdownTheme.mockResolvedValue(importedTheme({
      id: 'clean-light',
      platform: 'typora',
      css: '#write h1 { color: red; }',
    }));

    render(<MarkdownThemeLoader />);

    await waitFor(() => {
      expect(document.head.querySelector('style[data-vlaina-imported-markdown-theme="true"]')).not.toBeNull();
      const postBridgeStyle = document.head.querySelector<HTMLStyleElement>(
        'style[data-vlaina-imported-markdown-theme-post-bridge="true"]'
      );
      expect(postBridgeStyle).toBeInstanceOf(HTMLStyleElement);
      expect(postBridgeStyle?.id).toBe('vlaina-imported-markdown-theme-post-bridge-clean-light');
      expect(postBridgeStyle?.textContent).toContain('[data-markdown-imported-theme="clean-light"].theme-typora');
    }, importedThemeWaitForOptions);
  });

  it('keeps the previous imported theme CSS until the next theme is ready', async () => {
    const firstTheme = importedTheme({
      id: 'clean-light',
      css: '#write h1 { color: red; }',
    });
    const secondTheme = importedTheme({
      id: 'night',
      name: 'Night',
      cssFile: 'night.css',
      css: '#write h1 { color: blue; }',
    });
    mocks.readImportedMarkdownTheme.mockResolvedValueOnce(firstTheme);
    const view = render(<MarkdownThemeLoader />);

    await waitFor(() => {
      expect(document.head.querySelector('style[data-vlaina-imported-markdown-theme="true"]')?.id).toContain('clean-light');
    }, importedThemeWaitForOptions);

    setMarkdownTheme('night');
    mocks.readImportedMarkdownTheme.mockResolvedValueOnce(secondTheme);
    view.rerender(<MarkdownThemeLoader />);

    expect(document.head.querySelector('style[data-vlaina-imported-markdown-theme="true"]')?.id).toContain('clean-light');

    await waitFor(() => {
      const style = document.head.querySelector<HTMLStyleElement>(
        'style[data-vlaina-imported-markdown-theme="true"]'
      );
      expect(style?.id).toContain('night');
      expect(style?.textContent).toContain('color: blue');
      expect(document.head.querySelectorAll('style[data-vlaina-imported-markdown-theme="true"]')).toHaveLength(1);
    }, importedThemeWaitForOptions);
  });

  it('sanitizes unsafe CSS URLs again before injecting persisted imported CSS', async () => {
    mocks.readImportedMarkdownTheme.mockResolvedValue(importedTheme({
      css: [
        '@import url("https://example.com/theme.css");',
        '#write { color: red; }',
        '.bad { background: url(javascript:alert(1)); }',
        '.escaped { background: url(ja\\000076ascript:alert(1)); }',
        '.literal::before { content: "url(javascript:alert(1))"; }',
      ].join('\n'),
    }));

    render(<MarkdownThemeLoader />);

    await waitFor(() => {
      const style = document.head.querySelector<HTMLStyleElement>(
        'style[data-vlaina-imported-markdown-theme="true"]'
      );
      expect(style?.textContent).toContain('.bad { background: url(""); }');
      expect(style?.textContent).toContain('.escaped { background: url(""); }');
      expect(style?.textContent).toContain('content: "url(javascript:alert(1))"');
      expect(style?.textContent).not.toContain('@import');
      expect(style?.textContent).not.toContain('background: url(javascript:alert(1))');
    }, importedThemeWaitForOptions);
  });

  it('removes imported theme CSS when the imported theme id is cleared', async () => {
    const view = render(<MarkdownThemeLoader />);

    await waitFor(() => {
      expect(document.head.querySelector('style[data-vlaina-imported-markdown-theme="true"]')).not.toBeNull();
    }, importedThemeWaitForOptions);

    setMarkdownTheme(null);
    view.rerender(<MarkdownThemeLoader />);

    await waitFor(() => {
      expect(document.head.querySelector('style[data-vlaina-imported-markdown-theme="true"]')).toBeNull();
      expect(document.head.querySelector('style[data-vlaina-imported-markdown-theme-post-bridge="true"]')).toBeNull();
      expect(document.head.querySelector('style[data-vlaina-imported-app-theme="true"]')).toBeNull();
      expect(document.documentElement.hasAttribute('data-vlaina-imported-app-theme')).toBe(false);
      expect(document.documentElement.hasAttribute('data-vlaina-imported-app-theme-platform')).toBe(false);
    }, importedThemeWaitForOptions);
  });

  it('clears the saved imported theme id when the persisted theme is missing', async () => {
    const staleStyle = document.createElement('style');
    staleStyle.id = 'vlaina-imported-markdown-theme-clean-light';
    staleStyle.setAttribute('data-vlaina-imported-markdown-theme', 'true');
    staleStyle.textContent = '#write { color: red; }';
    document.head.appendChild(staleStyle);
    mocks.readImportedMarkdownTheme.mockResolvedValue(null);

    render(<MarkdownThemeLoader />);

    await waitFor(() => {
      expect(document.head.querySelector('style[data-vlaina-imported-markdown-theme="true"]')).toBeNull();
      expect(document.head.querySelector('style[data-vlaina-imported-markdown-theme-post-bridge="true"]')).toBeNull();
      expect(document.head.querySelector('style[data-vlaina-imported-app-theme="true"]')).toBeNull();
      expect(document.documentElement.hasAttribute('data-vlaina-imported-app-theme')).toBe(false);
      expect(mocks.store.setMarkdownImportedThemeId).toHaveBeenCalledWith(null);
    }, importedThemeWaitForOptions);
  });

  it('injects Obsidian-source CSS into the same external Markdown layer', async () => {
    mocks.readImportedMarkdownTheme.mockResolvedValue(importedTheme({
      platform: 'obsidian',
      css: [
        'body.theme-dark { --background-primary: #101010; }',
        '.markdown-preview-view h1 { color: var(--text-accent); }',
      ].join('\n'),
    }));

    render(<MarkdownThemeLoader />);

    await waitFor(() => {
      const style = document.head.querySelector<HTMLStyleElement>(
        'style[data-vlaina-imported-markdown-theme="true"]'
      );
      expect(style?.textContent).toContain('[data-markdown-theme-root="true"][data-markdown-imported-theme="clean-light"].theme-dark');
      expect(style?.textContent).toContain('[data-markdown-theme-root="true"][data-markdown-imported-theme="clean-light"].markdown-preview-view h1');
      expect(style?.textContent).not.toContain('data-markdown-theme-platform="obsidian"');
      expect(style?.textContent).not.toContain('body.theme-dark');
      expect(document.documentElement.getAttribute('data-vlaina-imported-app-theme-platform')).toBe('obsidian');
    }, importedThemeWaitForOptions);
  });
});

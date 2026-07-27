import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import { AppearanceTab } from './AppearanceTab';
import { raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';
import { MARKDOWN_FONT_SIZE_STYLE_ID } from '@/lib/markdown/markdownFontSize';
import { SETTINGS_BEFORE_CLOSE_EVENT } from '../settingsEvents';

const mocks = vi.hoisted(() => ({
  uiState: {
    fontSize: 17,
    setFontSizePreview: vi.fn(),
    setFontSize: vi.fn(),
    resetFontSize: vi.fn(),
  },
  unifiedState: {
    data: {
      settings: {
        ui: {
          colorMode: 'system',
        },
        markdown: {
          typewriterMode: false,
          theme: {
            importedThemeId: null,
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
    setColorMode: vi.fn(),
    setMarkdownImportedThemeId: vi.fn(),
  },
  addToast: vi.fn(),
  ensureImportedMarkdownThemesDirectory: vi.fn(),
  listImportedMarkdownThemesFromDirectory: vi.fn(),
  syncImportedMarkdownThemesFromDirectory: vi.fn(),
  openPathInFileManager: vi.fn(),
}));

vi.mock('@/components/ui/icons', () => ({
  Icon: ({ name }: { name: string }) => <span aria-hidden="true" data-testid={`icon-${name}`} />,
}));

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/dropdown-menu', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  const DropdownContext = React.createContext<((open: boolean) => void) | null>(null);

  return {
    DropdownMenu: ({
      children,
      onOpenChange,
    }: {
      children: ReactNode;
      onOpenChange?: (open: boolean) => void;
    }) => (
      <DropdownContext.Provider value={onOpenChange ?? null}>
        {children}
      </DropdownContext.Provider>
    ),
    DropdownMenuTrigger: ({
      children,
    }: {
      asChild?: boolean;
      children: ReactElement<{ onClick?: (event: unknown) => void }>;
    }) => {
      const onOpenChange = React.useContext(DropdownContext);
      return React.cloneElement(children, {
        onClick: (event: unknown) => {
          children.props.onClick?.(event);
          onOpenChange?.(true);
        },
      });
    },
    DropdownMenuContent: ({
      children,
      className,
    }: {
      children: ReactNode;
      className?: string;
    }) => <div role="menu" className={className}>{children}</div>,
    DropdownMenuItem: ({
      children,
      className,
      onSelect,
    }: {
      children: ReactNode;
      className?: string;
      onSelect?: () => void;
    }) => (
      <button type="button" role="menuitem" className={className} onClick={() => onSelect?.()}>
        {children}
      </button>
    ),
  };
});

vi.mock('@/stores/uiSlice', () => ({
  UI_FONT_SIZE_DEFAULT: 17,
  UI_FONT_SIZE_MAX: 120,
  UI_FONT_SIZE_MIN: 14,
  useUIStore: (selector: (state: typeof mocks.uiState) => unknown) => selector(mocks.uiState),
}));

vi.mock('@/stores/useToastStore', () => ({
  useToastStore: (selector: (state: { addToast: typeof mocks.addToast }) => unknown) =>
    selector({ addToast: mocks.addToast }),
}));

vi.mock('@/stores/unified/useUnifiedStore', () => ({
  useUnifiedStore: (selector: (state: typeof mocks.unifiedState) => unknown) => selector(mocks.unifiedState),
}));

vi.mock('@/lib/desktop/shell', () => ({
  openPathInFileManager: (...args: unknown[]) => mocks.openPathInFileManager(...args),
}));

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string) => ({
      'common.reset': 'Reset',
      'settings.appearance.baseFontSize': 'Base font size',
      'settings.appearance.darkMode': 'Dark',
      'settings.appearance.display': 'Display',
      'settings.appearance.fontSize': 'Font Size',
      'settings.appearance.lightMode': 'Light',
      'settings.appearance.openThemeFolder': 'Open theme folder',
      'settings.appearance.openThemeFolderFailed': 'Failed to open theme folder.',
      'settings.appearance.systemMode': 'System',
      'settings.appearance.theme': 'Theme',
      'settings.appearance.theme.default': 'Default',
    }[key] ?? key),
  }),
}));

vi.mock('@/lib/markdown/theme-compatibility/importedThemeStorage', () => ({
  ensureImportedMarkdownThemesDirectory: (...args: unknown[]) =>
    mocks.ensureImportedMarkdownThemesDirectory(...args),
  listImportedMarkdownThemesFromDirectory: (...args: unknown[]) =>
    mocks.listImportedMarkdownThemesFromDirectory(...args),
  syncImportedMarkdownThemesFromDirectory: (...args: unknown[]) =>
    mocks.syncImportedMarkdownThemesFromDirectory(...args),
}));

vi.mock('@/components/markdown-theme/markdownThemeCompiler', () => ({
  preloadMarkdownThemeCompiler: vi.fn(),
  preloadCompiledImportedMarkdownThemeStyles: vi.fn(),
}));

const directoryTheme = {
  id: 'vlook-fancy',
  name: 'vlook-fancy',
  platform: 'typora' as const,
  cssFile: 'vlook-fancy.css',
  sourcePath: '/app/.vlaina/app/themes/vlook-fancy.css',
  sourceModifiedAt: 10,
  sourceSize: 100,
  createdAt: 1,
  updatedAt: 2,
};

describe('AppearanceTab theme entry', () => {
  beforeEach(() => {
    mocks.uiState.fontSize = 17;
    mocks.unifiedState.data.settings.ui.colorMode = 'system';
    mocks.unifiedState.data.settings.markdown.theme.importedThemeId = null;
    mocks.ensureImportedMarkdownThemesDirectory.mockResolvedValue('/app/.vlaina/app/themes');
    mocks.listImportedMarkdownThemesFromDirectory.mockResolvedValue([directoryTheme]);
    mocks.syncImportedMarkdownThemesFromDirectory.mockResolvedValue({
      directoryPath: '/app/.vlaina/app/themes',
      themes: [directoryTheme],
      activeThemeId: 'vlook-fancy',
    });
    mocks.openPathInFileManager.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    document.documentElement.style.removeProperty('--vlaina-markdown-font-size');
    document.getElementById(MARKDOWN_FONT_SIZE_STYLE_ID)?.remove();
  });

  it('gives the font-size slider its visible setting name', async () => {
    render(<AppearanceTab />);

    await waitFor(() => {
      expect(screen.getByRole('slider', { name: 'Base font size' })).toBeInTheDocument();
    });
  });

  it('shows directory themes without exposing a compatibility-layer selector', async () => {
    render(<AppearanceTab />);

    await waitFor(() => {
      expect(screen.getByRole('menuitem', { name: 'vlook-fancy' })).toBeInTheDocument();
    });

    expect(screen.getByText('Theme')).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(['markdown', 'css'].join('\\s+'), 'i'))).not.toBeInTheDocument();
    expect(screen.queryByText(/typora/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/obsidian/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitem', { name: 'vlook-fancy' }));

    expect(mocks.unifiedState.setMarkdownImportedThemeId).toHaveBeenCalledWith('vlook-fancy');
  });

  it('reuses the theme capsule surface for the dropdown list', async () => {
    render(<AppearanceTab />);

    await waitFor(() => {
      expect(screen.getByRole('menuitem', { name: 'vlook-fancy' })).toBeInTheDocument();
    });

    expect(screen.getByRole('menu').className).toContain(raisedPillSurfaceClass);
    expect(screen.getByRole('menu').className).toContain('rounded-[var(--vlaina-ui-radius-panel)]');
    expect(screen.getByRole('menuitem', { name: 'Default' }).className).toContain('rounded-full');
  });

  it('refreshes directory themes from the dropdown and opens the fixed theme folder', async () => {
    render(<AppearanceTab />);

    fireEvent.click(screen.getByRole('button', { name: 'Default' }));

    await waitFor(() => {
      expect(mocks.syncImportedMarkdownThemesFromDirectory).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByLabelText('Open theme folder'));

    await waitFor(() => {
      expect(mocks.ensureImportedMarkdownThemesDirectory).toHaveBeenCalledTimes(1);
      expect(mocks.openPathInFileManager).toHaveBeenCalledWith('/app/.vlaina/app/themes');
    });
  });

  it('previews base font size through UI state while dragging and persists it on release', async () => {
    const { container } = render(<AppearanceTab />);
    const slider = container.querySelector<HTMLInputElement>('input[type="range"]');
    expect(slider).not.toBeNull();
    const initialProgress = slider!.style.getPropertyValue('--vlaina-appearance-font-size-progress');
    expect(slider!.style.getPropertyValue('--vlaina-gradient-appearance-font-size-slider')).toContain(initialProgress);

    fireEvent.mouseDown(slider!);
    fireEvent.change(slider!, { target: { value: '20' } });

    expect(mocks.uiState.setFontSize).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(document.getElementById(MARKDOWN_FONT_SIZE_STYLE_ID)).toHaveAttribute('data-font-size-px', '20px');
    });
    const updatedProgress = slider!.style.getPropertyValue('--vlaina-appearance-font-size-progress');
    expect(slider!.style.getPropertyValue('--vlaina-gradient-appearance-font-size-slider')).toContain(updatedProgress);
    expect(document.documentElement.style.getPropertyValue('--vlaina-markdown-font-size')).toBe('');

    fireEvent.mouseUp(window);

    expect(mocks.uiState.setFontSize).toHaveBeenCalledWith(20);
  });

  it('previews base font size wheel changes before committing the final value', async () => {
    const handleParentWheel = vi.fn();
    const { container } = render(
      <div onWheel={handleParentWheel}>
        <AppearanceTab />
      </div>
    );
    await waitFor(() => {
      expect(screen.getByRole('menuitem', { name: 'vlook-fancy' })).toBeInTheDocument();
    });

    const slider = container.querySelector<HTMLInputElement>('input[type="range"]');
    expect(slider).not.toBeNull();

    vi.useFakeTimers();
    try {
      fireEvent.wheel(slider!, { deltaY: -100 });
      fireEvent.wheel(slider!, { deltaY: -100 });

      expect(handleParentWheel).not.toHaveBeenCalled();
      expect(mocks.uiState.setFontSize).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(20);
      });

      expect(document.getElementById(MARKDOWN_FONT_SIZE_STYLE_ID)).toHaveAttribute('data-font-size-px', '19px');
      expect(mocks.uiState.setFontSize).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(mocks.uiState.setFontSize).toHaveBeenCalledTimes(1);
      expect(mocks.uiState.setFontSize).toHaveBeenCalledWith(19);
    } finally {
      vi.useRealTimers();
    }
  });

  it('commits a pending font size change before settings closes', async () => {
    const { container } = render(<AppearanceTab />);
    await waitFor(() => {
      expect(screen.getByRole('menuitem', { name: 'vlook-fancy' })).toBeInTheDocument();
    });
    const slider = container.querySelector<HTMLInputElement>('input[type="range"]');
    expect(slider).not.toBeNull();

    fireEvent.wheel(slider!, { deltaY: -100 });
    act(() => {
      window.dispatchEvent(new Event(SETTINGS_BEFORE_CLOSE_EVENT));
    });

    expect(mocks.uiState.setFontSize).toHaveBeenCalledWith(18);
  });
});

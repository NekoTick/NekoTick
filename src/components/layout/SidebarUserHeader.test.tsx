import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { SidebarUserHeader } from './SidebarUserHeader';
import { useUIStore } from '@/stores/uiSlice';
import { OPEN_SETTINGS_EVENT } from '@/components/Settings/settingsEvents';

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/ui/icons', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('@/components/ui/shortcut-keys', () => ({
  ShortcutKeys: () => <span data-testid="shortcut-keys" />,
}));

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('./WorkspaceSwitcher', () => ({
  WorkspaceSwitcher: ({ className, onOpenSettings }: { className?: string; onOpenSettings?: () => void }) => (
    <button type="button" className={className} data-testid="workspace-switcher" onClick={onOpenSettings} />
  ),
}));

function setHeaderRect(header: Element) {
  Object.defineProperty(header, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 40,
      right: 240,
      width: 240,
      height: 40,
      toJSON: () => ({}),
    }),
  });
}

function moveMouseOverHeader() {
  act(() => {
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 12, clientY: 12 }));
  });
}

describe('SidebarUserHeader', () => {
  beforeEach(() => {
    useUIStore.setState({ devPlatformPreview: 'system' });
  });

  afterEach(() => {
    cleanup();
  });

  it('uses the compact titlebar padding on the system platform preview', async () => {
    const { container } = render(<SidebarUserHeader toggleSidebar={() => {}} />);

    await screen.findByTestId('workspace-switcher');

    expect(container.querySelector('.sidebar-user-header')).toHaveClass(
      'app-drag-region',
      'px-3',
    );
    expect(container.querySelector('[data-sidebar-header-spacer="true"]')).toHaveClass(
      'app-drag-region',
      'cursor-grab',
    );
  });

  it('reserves macOS traffic-light space during macOS platform preview', async () => {
    useUIStore.setState({ devPlatformPreview: 'macos' });

    const { container } = render(<SidebarUserHeader toggleSidebar={() => {}} />);

    await screen.findByTestId('workspace-switcher');

    expect(container.querySelector('.sidebar-user-header')).toHaveClass(
      'app-no-drag',
      'pl-[var(--vlaina-space-76px)]',
      'pr-2',
    );
    expect(container.querySelector('[data-sidebar-header-spacer="true"]')).toHaveClass('app-no-drag');
    expect(container.querySelector('[data-sidebar-header-spacer="true"]')).not.toHaveClass('cursor-grab');
  });

  it('clears hover and focused header controls when the mouse leaves the window', async () => {
    const { container } = render(<SidebarUserHeader toggleSidebar={() => {}} />);

    const header = container.querySelector('.sidebar-user-header') as HTMLElement;
    setHeaderRect(header);
    const switcher = await screen.findByTestId('workspace-switcher');

    moveMouseOverHeader();
    switcher.focus();

    expect(header).toHaveAttribute('data-hovered', 'true');
    expect(switcher).toHaveFocus();

    act(() => {
      window.dispatchEvent(new MouseEvent('mouseout'));
    });

    expect(header).not.toHaveAttribute('data-hovered');
    expect(switcher).not.toHaveFocus();
  });

  it('clears header interaction before opening settings from the workspace switcher', async () => {
    const onOpenSettings = vi.fn();
    window.addEventListener(OPEN_SETTINGS_EVENT, onOpenSettings);
    try {
      const { container } = render(<SidebarUserHeader toggleSidebar={() => {}} />);

      const header = container.querySelector('.sidebar-user-header') as HTMLElement;
      setHeaderRect(header);
      const switcher = await screen.findByTestId('workspace-switcher');

      moveMouseOverHeader();
      switcher.focus();

      expect(header).toHaveAttribute('data-hovered', 'true');
      expect(switcher).toHaveFocus();

      act(() => {
        switcher.click();
      });

      expect(onOpenSettings).toHaveBeenCalledTimes(1);
      expect(header).not.toHaveAttribute('data-hovered');
      expect(switcher).not.toHaveFocus();
    } finally {
      window.removeEventListener(OPEN_SETTINGS_EVENT, onOpenSettings);
    }
  });

  it('clears focused hidden controls before collapsing the sidebar', async () => {
    const toggleSidebar = vi.fn();
    render(<SidebarUserHeader toggleSidebar={toggleSidebar} />);

    await screen.findByTestId('workspace-switcher');
    const collapseButton = screen.getByRole('button', { name: 'common.collapseSidebar' });

    collapseButton.focus();
    expect(collapseButton).toHaveFocus();

    act(() => {
      collapseButton.click();
    });

    expect(toggleSidebar).toHaveBeenCalledTimes(1);
    expect(collapseButton).not.toHaveFocus();
  });

  it('suppresses hover while settings are open', async () => {
    const { container, rerender } = render(<SidebarUserHeader toggleSidebar={() => {}} />);

    const header = container.querySelector('.sidebar-user-header') as HTMLElement;
    setHeaderRect(header);
    const switcher = await screen.findByTestId('workspace-switcher');

    moveMouseOverHeader();
    switcher.focus();

    expect(header).toHaveAttribute('data-hovered', 'true');
    expect(switcher).toHaveFocus();

    rerender(<SidebarUserHeader toggleSidebar={() => {}} interactionSuppressed />);

    expect(header).toHaveAttribute('data-interaction-suppressed', 'true');
    expect(header).not.toHaveAttribute('data-hovered');
    expect(switcher).not.toHaveFocus();

    moveMouseOverHeader();

    expect(header).not.toHaveAttribute('data-hovered');
  });
});

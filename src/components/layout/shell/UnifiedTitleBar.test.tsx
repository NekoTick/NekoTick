import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UnifiedTitleBar } from './UnifiedTitleBar';
import { useUIStore } from '@/stores/uiSlice';

const mocks = vi.hoisted(() => ({
  isMacOS: vi.fn(() => false),
  shouldRenderMacOSTrafficLightPreview: vi.fn(() => false),
  desktopWindow: {
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
  },
}));

vi.mock('@/lib/desktop/platform', () => ({
  isMacOS: mocks.isMacOS,
  shouldRenderMacOSTrafficLightPreview: mocks.shouldRenderMacOSTrafficLightPreview,
}));

vi.mock('@/lib/desktop/window', () => ({
  desktopWindow: mocks.desktopWindow,
}));

vi.mock('@/components/ui/icons', () => ({
  Icon: ({ name }: { name: string }) => <span>{name}</span>,
}));

vi.mock('@/components/layout/WindowControls', () => ({
  WindowControls: () => <div data-testid="window-controls" />,
}));

describe('UnifiedTitleBar', () => {
  beforeEach(() => {
    mocks.isMacOS.mockReturnValue(false);
    mocks.shouldRenderMacOSTrafficLightPreview.mockReturnValue(false);
    useUIStore.setState({ devPlatformPreview: 'system' });
  });

  it('reserves native traffic-light space when the sidebar is collapsed on macOS', () => {
    mocks.isMacOS.mockReturnValueOnce(true);

    render(
      <UnifiedTitleBar
        sidebarCollapsed
        onToggleSidebar={() => {}}
      />
    );

    expect(screen.getByRole('button').parentElement).toHaveClass('pl-[var(--vlaina-space-76px)]');
  });

  it('keeps the collapsed sidebar toggle compact on non-mac platforms', () => {
    mocks.isMacOS.mockReturnValueOnce(false);

    render(
      <UnifiedTitleBar
        sidebarCollapsed
        onToggleSidebar={() => {}}
      />
    );

    const toggleButton = screen.getByRole('button', { name: 'Toggle sidebar' });
    expect(toggleButton.parentElement).toHaveClass('pl-2');
  });

  it('extends the sidebar backdrop behind the expanded workspace name', () => {
    const { container } = render(
      <UnifiedTitleBar
        sidebarCollapsed={false}
        leftSlot={<div>vlaina</div>}
        onToggleSidebar={() => {}}
      />
    );

    expect(container.querySelector('[data-shell-titlebar-sidebar-backdrop="true"]')).toHaveClass(
      'bg-[var(--vlaina-color-surface-sidebar-backdrop)]',
    );
    expect(container.querySelector('[data-shell-titlebar-sidebar-card="true"]')).toHaveClass(
      'rounded-t-[var(--vlaina-ui-radius-panel)]',
      'bg-[var(--vlaina-color-sidebar-card-surface)]',
    );
  });

  it('reports hover on the collapsed sidebar toggle area', () => {
    const handleHoverChange = vi.fn();

    render(
      <UnifiedTitleBar
        sidebarCollapsed
        onToggleSidebar={() => {}}
        onCollapsedSidebarToggleHoverChange={handleHoverChange}
      />
    );

    const toggleButton = screen.getByRole('button', { name: 'Toggle sidebar' });
    const toggleArea = toggleButton.parentElement;
    expect(toggleArea).not.toBeNull();

    fireEvent.mouseEnter(toggleArea!);
    fireEvent.mouseLeave(toggleArea!);

    expect(handleHoverChange).toHaveBeenNthCalledWith(1, true);
    expect(handleHoverChange).toHaveBeenNthCalledWith(2, false);
  });

  it('renders traffic-light preview controls when macOS preview is active off macOS', () => {
    mocks.isMacOS.mockReturnValue(true);
    mocks.shouldRenderMacOSTrafficLightPreview.mockReturnValue(true);
    useUIStore.setState({ devPlatformPreview: 'macos' });

    render(
      <UnifiedTitleBar
        sidebarCollapsed
        onToggleSidebar={() => {}}
      />
    );

    expect(screen.getByTestId('macos-traffic-light-preview')).toBeInTheDocument();
  });

  it('compensates right titlebar chrome while Windows resize events lag', () => {
    render(
      <UnifiedTitleBar
        sidebarCollapsed={false}
        rightSlot={<button type="button">Right action</button>}
        onToggleSidebar={() => {}}
      />,
    );

    expect(screen.getByText('Right action').parentElement).toHaveClass('translate-x-[var(--vlaina-window-resize-compensation-x)]');
  });
});

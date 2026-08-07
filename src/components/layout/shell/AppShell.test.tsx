import { cleanup, fireEvent, render } from '@testing-library/react';
import { forwardRef, type ReactNode, type Ref } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';

const mocks = vi.hoisted(() => ({
  setLayoutPanelDragging: vi.fn(),
  setLayoutPanelTransitioning: vi.fn(),
}));

vi.mock('@/stores/uiSlice', () => ({
  useUIStore: (selector: (state: {
    setLayoutPanelDragging: typeof mocks.setLayoutPanelDragging;
    setLayoutPanelTransitioning: typeof mocks.setLayoutPanelTransitioning;
  }) => unknown) => selector({
    setLayoutPanelDragging: mocks.setLayoutPanelDragging,
    setLayoutPanelTransitioning: mocks.setLayoutPanelTransitioning,
  }),
}));

vi.mock('./UnifiedTitleBar', () => ({
  UnifiedTitleBar: forwardRef<HTMLDivElement, {
    onCollapsedSidebarToggleHoverChange?: (hovered: boolean) => void;
  }>(function UnifiedTitleBar({ onCollapsedSidebarToggleHoverChange }, ref) {
    return (
      <div ref={ref} data-testid="titlebar">
        <button
          type="button"
          data-testid="collapsed-sidebar-toggle"
          onMouseEnter={() => onCollapsedSidebarToggleHoverChange?.(true)}
          onMouseLeave={() => onCollapsedSidebarToggleHoverChange?.(false)}
        />
      </div>
    );
  }),
}));

vi.mock('./UnifiedSidebarContainer', () => ({
  UnifiedSidebarContainer: ({
    children,
    collapsed,
    peeking,
    onDragStateChange,
    onPeekChange,
    onLayoutAnimationComplete,
    widthScopeRef,
  }: {
    children: ReactNode;
    collapsed: boolean;
    peeking?: boolean;
    onDragStateChange?: (dragging: boolean) => void;
    onPeekChange?: (peeking: boolean) => void;
    onLayoutAnimationComplete?: () => void;
    widthScopeRef?: Ref<HTMLDivElement>;
  }) => (
    <aside
      ref={widthScopeRef}
      data-testid="sidebar"
      data-shell-sidebar-peek={collapsed ? 'true' : undefined}
      data-open={collapsed ? (peeking ? 'true' : 'false') : undefined}
      aria-hidden={collapsed ? !peeking : undefined}
      onMouseEnter={collapsed ? () => onPeekChange?.(true) : undefined}
      onMouseLeave={collapsed ? () => onPeekChange?.(false) : undefined}
    >
      {children}
      <button
        type="button"
        data-testid="sidebar-layout-animation-complete"
        onClick={onLayoutAnimationComplete}
      />
      <button
        type="button"
        data-testid="sidebar-drag-start"
        onMouseDown={() => onDragStateChange?.(true)}
        onMouseUp={() => onDragStateChange?.(false)}
      />
    </aside>
  ),
}));

describe('AppShell', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('scopes live sidebar width variables away from the main shell root', () => {
    const { container, rerender } = render(
      <AppShell
        sidebarWidth={260}
        sidebarCollapsed={false}
        sidebarContent={<div>Sidebar</div>}
        onSidebarWidthChange={() => {}}
        onSidebarToggle={() => {}}
      >
        <div>Main</div>
      </AppShell>
    );

    const shell = container.querySelector<HTMLElement>('[data-app-shell-root="true"]');
    const titlebar = container.querySelector<HTMLElement>('[data-testid="titlebar"]');
    const sidebar = container.querySelector<HTMLElement>('[data-testid="sidebar"]');
    expect(shell).not.toBeNull();
    expect(titlebar).not.toBeNull();
    expect(sidebar).not.toBeNull();
    expect(shell!.style.getPropertyValue('--vlaina-shell-sidebar-width')).toBe('');
    expect(titlebar!.style.getPropertyValue('--vlaina-shell-sidebar-width')).toBe('260px');
    expect(titlebar!.style.getPropertyValue('--vlaina-width-sidebar-content-inner')).toBe(
      'calc(260px - var(--vlaina-size-32px))'
    );
    expect(sidebar!.style.getPropertyValue('--vlaina-shell-sidebar-width')).toBe('260px');
    expect(sidebar!.style.getPropertyValue('--vlaina-width-sidebar-content-inner')).toBe(
      'calc(260px - var(--vlaina-size-32px))'
    );

    rerender(
      <AppShell
        sidebarWidth={320}
        sidebarCollapsed={false}
        sidebarContent={<div>Sidebar</div>}
        onSidebarWidthChange={() => {}}
        onSidebarToggle={() => {}}
      >
        <div>Main</div>
      </AppShell>
    );

    expect(shell!.style.getPropertyValue('--vlaina-shell-sidebar-width')).toBe('');
    expect(titlebar!.style.getPropertyValue('--vlaina-shell-sidebar-width')).toBe('320px');
    expect(sidebar!.style.getPropertyValue('--vlaina-shell-sidebar-width')).toBe('320px');
    expect(sidebar!.style.getPropertyValue('--vlaina-width-sidebar-content-inner')).toBe(
      'calc(320px - var(--vlaina-size-32px))'
    );
  });

  it('shows collapsed sidebar content from the left-edge peek hotzone', () => {
    const { container } = render(
      <AppShell
        sidebarWidth={300}
        sidebarCollapsed
        sidebarContent={<div data-testid="sidebar-content">Sidebar</div>}
        onSidebarWidthChange={() => {}}
        onSidebarToggle={() => {}}
      >
        <div>Main</div>
      </AppShell>
    );

    expect(container.querySelector('[data-testid="sidebar"]')).toBeInTheDocument();

    const hotzone = container.querySelector<HTMLElement>('[data-shell-sidebar-peek-hotzone="true"]');
    const peekLayer = container.querySelector<HTMLElement>('[data-shell-sidebar-peek-layer="true"]');
    const peekSidebar = container.querySelector<HTMLElement>('[data-shell-sidebar-peek="true"]');
    expect(hotzone).not.toBeNull();
    expect(peekLayer).toHaveClass('z-[var(--vlaina-z-40)]');
    expect(peekSidebar).not.toBeNull();
    expect(peekSidebar).toHaveAttribute('data-open', 'false');
    expect(peekSidebar).toHaveAttribute('aria-hidden', 'true');
    expect(document.documentElement).toHaveAttribute('data-shell-sidebar-peek');
    expect(document.documentElement).not.toHaveAttribute('data-shell-sidebar-peek-open');
    expect(hotzone!.style.width).toBe('48px');
    expect(peekSidebar!.style.getPropertyValue('--vlaina-shell-sidebar-width')).toBe('300px');
    fireEvent.mouseEnter(hotzone!);

    expect(peekSidebar).toHaveAttribute('data-open', 'true');
    expect(peekSidebar).toHaveAttribute('aria-hidden', 'false');
    expect(document.documentElement).toHaveAttribute('data-shell-sidebar-peek-open');

    fireEvent.mouseLeave(peekSidebar!);

    expect(peekSidebar).toHaveAttribute('data-open', 'false');
    expect(peekSidebar).toHaveAttribute('aria-hidden', 'true');
    expect(document.documentElement).not.toHaveAttribute('data-shell-sidebar-peek-open');
  });

  it('shows collapsed sidebar content from the titlebar toggle hover', () => {
    const { container } = render(
      <AppShell
        sidebarWidth={300}
        sidebarCollapsed
        sidebarContent={<div data-testid="sidebar-content">Sidebar</div>}
        onSidebarWidthChange={() => {}}
        onSidebarToggle={() => {}}
      >
        <div>Main</div>
      </AppShell>
    );

    const toggle = container.querySelector<HTMLElement>('[data-testid="collapsed-sidebar-toggle"]');
    const peekSidebar = container.querySelector<HTMLElement>('[data-shell-sidebar-peek="true"]');
    expect(toggle).not.toBeNull();
    expect(peekSidebar).not.toBeNull();
    expect(peekSidebar).toHaveAttribute('data-open', 'false');

    fireEvent.mouseEnter(toggle!);

    expect(peekSidebar).toHaveAttribute('data-open', 'true');
    expect(peekSidebar).toHaveAttribute('aria-hidden', 'false');
  });

  it('disables every collapsed sidebar hover entry point when peek is disabled', () => {
    const { container } = render(
      <AppShell
        sidebarWidth={300}
        sidebarCollapsed
        sidebarHoverPeekEnabled={false}
        sidebarContent={<div>Sidebar</div>}
        onSidebarWidthChange={() => {}}
        onSidebarToggle={() => {}}
      >
        <div>Main</div>
      </AppShell>
    );

    const toggle = container.querySelector<HTMLElement>('[data-testid="collapsed-sidebar-toggle"]');
    const sidebar = container.querySelector<HTMLElement>('[data-shell-sidebar-peek="true"]');
    expect(container.querySelector('[data-shell-sidebar-peek-hotzone="true"]')).not.toBeInTheDocument();
    expect(sidebar).toHaveAttribute('data-open', 'false');

    fireEvent.mouseEnter(toggle!);
    fireEvent.mouseEnter(sidebar!);

    expect(sidebar).toHaveAttribute('data-open', 'false');
  });

  it('keeps the sidebar container mounted while toggling collapse state', () => {
    const { container, rerender } = render(
      <AppShell
        sidebarWidth={300}
        sidebarCollapsed={false}
        sidebarContent={<div data-testid="sidebar-content">Sidebar</div>}
        onSidebarWidthChange={() => {}}
        onSidebarToggle={() => {}}
      >
        <div>Main</div>
      </AppShell>
    );

    const sidebar = container.querySelector<HTMLElement>('[data-testid="sidebar"]');
    expect(sidebar).toBeInTheDocument();

    rerender(
      <AppShell
        sidebarWidth={300}
        sidebarCollapsed
        sidebarContent={<div data-testid="sidebar-content">Sidebar</div>}
        onSidebarWidthChange={() => {}}
        onSidebarToggle={() => {}}
      >
        <div>Main</div>
      </AppShell>
    );

    expect(container.querySelector<HTMLElement>('[data-testid="sidebar"]')).toBe(sidebar);
    expect(sidebar).toHaveAttribute('data-shell-sidebar-peek', 'true');

    rerender(
      <AppShell
        sidebarWidth={300}
        sidebarCollapsed={false}
        sidebarContent={<div data-testid="sidebar-content">Sidebar</div>}
        onSidebarWidthChange={() => {}}
        onSidebarToggle={() => {}}
      >
        <div>Main</div>
      </AppShell>
    );

    expect(container.querySelector<HTMLElement>('[data-testid="sidebar"]')).toBe(sidebar);
    expect(sidebar).not.toHaveAttribute('data-shell-sidebar-peek');
  });

  it('marks layout transitioning until the sidebar slide completes', () => {
    const { getByTestId, rerender } = render(
      <AppShell
        sidebarWidth={300}
        sidebarCollapsed={false}
        sidebarContent={<div>Sidebar</div>}
        onSidebarWidthChange={() => {}}
        onSidebarToggle={() => {}}
      >
        <div>Main</div>
      </AppShell>
    );
    mocks.setLayoutPanelTransitioning.mockClear();

    rerender(
      <AppShell
        sidebarWidth={300}
        sidebarCollapsed
        sidebarContent={<div>Sidebar</div>}
        onSidebarWidthChange={() => {}}
        onSidebarToggle={() => {}}
      >
        <div>Main</div>
      </AppShell>
    );

    expect(mocks.setLayoutPanelTransitioning).toHaveBeenCalledWith('shell-sidebar', true);

    fireEvent.click(getByTestId('sidebar-layout-animation-complete'));
    expect(mocks.setLayoutPanelTransitioning).toHaveBeenLastCalledWith('shell-sidebar', false);
  });

  it('freezes the main layout width and marks the shell while resizing the sidebar', () => {
    const { container, getByTestId } = render(
      <AppShell
        sidebarWidth={300}
        sidebarCollapsed={false}
        sidebarContent={<div>Sidebar</div>}
        onSidebarWidthChange={() => {}}
        onSidebarToggle={() => {}}
      >
        <div data-testid="main-content" style={{ width: '75%', minWidth: '12px' }}>Main</div>
      </AppShell>
    );

    const shell = container.querySelector<HTMLElement>('[data-app-shell-root="true"]');
    const main = container.querySelector<HTMLElement>('main');
    const mainContent = getByTestId('main-content');
    const dragHandle = getByTestId('sidebar-drag-start');

    fireEvent.mouseDown(dragHandle);

    expect(shell).toHaveAttribute('data-layout-panel-dragging', 'true');
    expect(main?.style.overflow).toBe('hidden');
    expect(mainContent.style.width).toBe('0px');
    expect(mainContent.style.minWidth).toBe('0px');
    expect(mocks.setLayoutPanelDragging).toHaveBeenLastCalledWith(true);

    fireEvent.mouseUp(dragHandle);

    expect(shell).not.toHaveAttribute('data-layout-panel-dragging');
    expect(main?.style.overflow).toBe('');
    expect(mainContent.style.width).toBe('75%');
    expect(mainContent.style.minWidth).toBe('12px');
    expect(mocks.setLayoutPanelDragging).toHaveBeenLastCalledWith(false);
  });
});

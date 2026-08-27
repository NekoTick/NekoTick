import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SidebarCapsulePanel,
  SidebarSurface,
} from '@/components/layout/sidebar/SidebarPrimitives';
import { UnifiedSidebarContainer } from './UnifiedSidebarContainer';

const resizeMocks = vi.hoisted(() => ({
  isDragging: false,
  options: null as null | {
    onDragStateChange?: (dragging: boolean) => void;
    onWidthChange: (width: number) => void;
    onWidthCommit?: (width: number) => void;
  },
}));

vi.mock('./useShellSidebarResize', () => ({
  useShellSidebarResize: (options: NonNullable<typeof resizeMocks.options>) => {
    resizeMocks.options = options;
    return {
      isDragging: resizeMocks.isDragging,
      handleDragStart: vi.fn(),
      handleDoubleClick: vi.fn(),
    };
  },
}));

describe('UnifiedSidebarContainer', () => {
  beforeEach(() => {
    resizeMocks.isDragging = false;
    resizeMocks.options = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the sidebar card over its inset backdrop', () => {
    render(
      <UnifiedSidebarContainer
        width={260}
        collapsed={false}
        onWidthChange={() => {}}
      >
        <SidebarSurface>
          <SidebarCapsulePanel>Sidebar content</SidebarCapsulePanel>
        </SidebarSurface>
      </UnifiedSidebarContainer>,
    );

    const panel = screen.getByText('Sidebar content');
    const sidebar = panel.closest('aside');
    expect(sidebar).toHaveClass('bg-[var(--vlaina-color-surface-sidebar-backdrop)]');
    expect(sidebar).toHaveAttribute('data-shell-sidebar-docked', 'true');
    expect(panel).toHaveClass('m-2');
    expect(panel).toHaveClass('rounded-[var(--vlaina-ui-radius-panel)]');
    expect(panel).toHaveClass('bg-[var(--vlaina-color-sidebar-card-surface)]');
    expect(panel).toHaveClass('shadow-[var(--vlaina-shadow-raised-soft)]');
  });

  it('only keeps the sidebar on a dedicated transform layer while collapsed', () => {
    const renderSidebar = (collapsed: boolean) => (
      <UnifiedSidebarContainer
        width={260}
        collapsed={collapsed}
        onWidthChange={() => {}}
      >
        Sidebar content
      </UnifiedSidebarContainer>
    );
    const { container, rerender } = render(renderSidebar(false));
    const sidebar = container.querySelector('aside');

    expect(sidebar).not.toHaveClass('transform-gpu');
    expect(sidebar).not.toHaveClass('will-change-transform');

    rerender(renderSidebar(true));

    expect(sidebar).toHaveClass('transform-gpu');
    expect(sidebar).toHaveClass('will-change-transform');
  });

  it('updates the live width during drag and commits the persisted width on release', () => {
    vi.useFakeTimers();
    const onWidthChange = vi.fn();
    const onLiveWidthChange = vi.fn();
    const { container } = render(
      <UnifiedSidebarContainer
        width={260}
        collapsed={false}
        onWidthChange={onWidthChange}
        onLiveWidthChange={onLiveWidthChange}
      >
        Sidebar content
      </UnifiedSidebarContainer>,
    );

    expect(container.querySelector('[data-sidebar-resize-preview="true"]')).not.toBeInTheDocument();
    const layout = container.querySelector<HTMLElement>('[data-shell-sidebar-layout="true"]');
    const sidebar = container.querySelector<HTMLElement>('aside');
    const handle = container.querySelector<HTMLElement>('[data-resize-handle="shell-sidebar"]');
    act(() => resizeMocks.options?.onWidthChange(420));
    expect(layout?.style.width).toBe('420px');
    expect(sidebar?.style.width).toBe('420px');
    expect(handle?.style.left).toBe('415px');
    expect(onLiveWidthChange).toHaveBeenCalledWith(420);
    expect(onWidthChange).not.toHaveBeenCalled();

    act(() => resizeMocks.options?.onWidthCommit?.(420));
    expect(onWidthChange).toHaveBeenCalledWith(420);
    expect(layout?.style.width).toBe('420px');

    act(() => vi.advanceTimersByTime(16));
    expect(layout?.style.width).toBe('var(--vlaina-shell-sidebar-width)');
    expect(sidebar?.style.width).toBe('var(--vlaina-shell-sidebar-width)');
    expect(handle?.style.left).toBe('calc(var(--vlaina-shell-sidebar-width) - 5px)');
  });

  it('holds scroll-root layout during drag and restores it on the next frame', () => {
    vi.useFakeTimers();
    const onDragStateChange = vi.fn();
    const { getByTestId } = render(
      <UnifiedSidebarContainer
        width={260}
        collapsed={false}
        onWidthChange={() => {}}
        onDragStateChange={onDragStateChange}
      >
        <div
          data-testid="scroll-root"
          data-sidebar-scroll-root="true"
          style={{ minWidth: '10px' }}
        />
      </UnifiedSidebarContainer>,
    );
    const scrollRoot = getByTestId('scroll-root');
    Object.defineProperty(scrollRoot, 'clientWidth', { configurable: true, value: 220 });

    act(() => resizeMocks.options?.onDragStateChange?.(true));
    expect(scrollRoot.style.width).toBe('220px');
    expect(scrollRoot.style.minWidth).toBe('220px');
    expect(scrollRoot.style.maxWidth).toBe('220px');
    expect(onDragStateChange).toHaveBeenLastCalledWith(true);

    act(() => resizeMocks.options?.onDragStateChange?.(false));
    expect(scrollRoot.style.width).toBe('220px');
    expect(onDragStateChange).toHaveBeenLastCalledWith(false);

    act(() => vi.advanceTimersByTime(16));
    expect(scrollRoot.style.width).toBe('');
    expect(scrollRoot.style.minWidth).toBe('10px');
    expect(scrollRoot.style.maxWidth).toBe('');
  });

  it('closes a peeking sidebar only after the pointer leaves the application window', () => {
    const onPeekChange = vi.fn();
    const rootMatches = vi.spyOn(document.documentElement, 'matches');
    render(
      <UnifiedSidebarContainer
        width={260}
        collapsed
        peeking
        onPeekChange={onPeekChange}
        onWidthChange={() => {}}
      >
        <button type="button">Open file</button>
      </UnifiedSidebarContainer>,
    );

    rootMatches.mockReturnValue(true);
    fireEvent.mouseOut(window, { relatedTarget: null });
    expect(onPeekChange).not.toHaveBeenCalled();

    rootMatches.mockReturnValue(false);
    fireEvent.mouseOut(window, { relatedTarget: null });

    expect(onPeekChange).toHaveBeenCalledWith(false);
  });

  it('keeps a peeking sidebar open when navigation moves focus while the pointer remains inside', () => {
    const onPeekChange = vi.fn();
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);

    render(
      <>
        <UnifiedSidebarContainer
          width={260}
          collapsed
          peeking
          onPeekChange={onPeekChange}
          onWidthChange={() => {}}
        >
          <button type="button">Open file</button>
        </UnifiedSidebarContainer>
        <button type="button">Editor</button>
      </>,
    );

    const navigationButton = screen.getByRole('button', { name: 'Open file' });
    const editor = screen.getByRole('button', { name: 'Editor' });
    const sidebar = navigationButton.closest('aside');

    fireEvent.mouseEnter(sidebar!);
    onPeekChange.mockClear();
    navigationButton.focus();

    fireEvent.focusOut(navigationButton, { relatedTarget: editor });
    expect(onPeekChange).not.toHaveBeenCalled();

    editor.focus();
    fireEvent.mouseLeave(sidebar!);
    expect(onPeekChange).toHaveBeenCalledWith(false);
  });

  it('clears stale pointer state after the sidebar returns to its expanded layout', () => {
    const onPeekChange = vi.fn();
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    const renderSidebar = (collapsed: boolean) => (
      <>
        <UnifiedSidebarContainer
          width={260}
          collapsed={collapsed}
          peeking={collapsed}
          onPeekChange={onPeekChange}
          onWidthChange={() => {}}
        >
          <button type="button">Open file</button>
        </UnifiedSidebarContainer>
        <button type="button">Editor</button>
      </>
    );
    const { rerender } = render(renderSidebar(true));
    const navigationButton = screen.getByRole('button', { name: 'Open file' });
    const sidebar = navigationButton.closest('aside');

    fireEvent.mouseEnter(sidebar!);
    rerender(renderSidebar(false));
    rerender(renderSidebar(true));
    onPeekChange.mockClear();

    fireEvent.focusOut(navigationButton, {
      relatedTarget: screen.getByRole('button', { name: 'Editor' }),
    });
    expect(onPeekChange).toHaveBeenCalledWith(false);
  });

  it('keeps a peeking sidebar open while its editor has focus', () => {
    const onPeekChange = vi.fn();
    const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(true);

    render(
      <>
        <UnifiedSidebarContainer
          width={260}
          collapsed
          peeking
          onPeekChange={onPeekChange}
          onWidthChange={() => {}}
        >
          <input aria-label="Rename" />
        </UnifiedSidebarContainer>
        <button type="button">Outside</button>
      </>,
    );

    const input = screen.getByRole('textbox', { name: 'Rename' });
    const outsideButton = screen.getByRole('button', { name: 'Outside' });
    const sidebar = input.closest('aside');
    input.focus();

    fireEvent.mouseLeave(sidebar!, { relatedTarget: outsideButton });
    expect(onPeekChange).not.toHaveBeenCalled();

    hasFocus.mockReturnValue(false);
    fireEvent.blur(input);
    expect(onPeekChange).not.toHaveBeenCalled();

    hasFocus.mockReturnValue(true);
    fireEvent.focusOut(input, { relatedTarget: outsideButton });
    expect(onPeekChange).toHaveBeenCalledWith(false);
  });
});

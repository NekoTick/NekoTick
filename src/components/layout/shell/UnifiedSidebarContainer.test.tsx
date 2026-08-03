import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  SidebarCapsulePanel,
  SidebarSurface,
} from '@/components/layout/sidebar/SidebarPrimitives';
import { UnifiedSidebarContainer } from './UnifiedSidebarContainer';

vi.mock('./useShellSidebarResize', () => ({
  useShellSidebarResize: () => ({ isDragging: false, handleDragStart: vi.fn() }),
}));

describe('UnifiedSidebarContainer', () => {
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
    expect(panel).toHaveClass('m-2');
    expect(panel).toHaveClass('rounded-[var(--vlaina-ui-radius-panel)]');
    expect(panel).toHaveClass('bg-[var(--vlaina-color-sidebar-card-surface)]');
    expect(panel).toHaveClass('shadow-[var(--vlaina-shadow-raised-soft)]');
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

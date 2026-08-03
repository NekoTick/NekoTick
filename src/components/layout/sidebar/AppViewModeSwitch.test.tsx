import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppViewModeSwitch } from './AppViewModeSwitch';
import { clearAppViewModeFocusIntent } from './appViewModeFocusIntent';

const hoisted = vi.hoisted(() => ({
  uiState: {
    appViewMode: 'chat' as 'notes' | 'chat' | 'whiteboard' | 'graph' | 'lab',
    setAppViewMode: vi.fn(),
  },
}));

vi.mock('@/components/ui/icons', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string) => ({
      'app.viewNotes': 'Notes',
      'app.viewChat': 'Chat',
      'app.viewWhiteboard': 'Board',
      'app.viewGraph': 'Graph',
      'shortcut.action.toggleAppViewMode': 'Switch app view',
    }[key] ?? key),
  }),
}));

vi.mock('@/stores/uiSlice', () => ({
  useUIStore: (selector: (state: typeof hoisted.uiState) => unknown) => selector(hoisted.uiState),
}));

describe('AppViewModeSwitch', () => {
  beforeEach(() => {
    hoisted.uiState.appViewMode = 'chat';
    hoisted.uiState.setAppViewMode.mockClear();
  });

  afterEach(() => {
    cleanup();
    clearAppViewModeFocusIntent();
  });

  it('optimistically expands only the selected view while switching', () => {
    render(<AppViewModeSwitch />);
    const notesTab = screen.getByRole('tab', { name: 'Notes' });
    const boardTab = screen.getByRole('tab', { name: 'Board' });
    const chatTab = screen.getByRole('tab', { name: 'Chat' });
    const graphTab = screen.getByRole('tab', { name: 'Graph' });
    const tabList = screen.getByRole('tablist', { name: 'Switch app view' });

    expect(screen.getAllByRole('tab')).toEqual([notesTab, graphTab, boardTab, chatTab]);
    expect(tabList).toHaveAttribute('aria-orientation', 'horizontal');
    expect(tabList).toHaveClass('h-14');
    expect(tabList).not.toHaveClass(
      '!bg-[var(--vlaina-color-pill-surface)]',
      '!shadow-[var(--vlaina-shadow-raised-soft)]',
    );
    expect(screen.getByTestId('icon-graph.network')).toBeInTheDocument();

    expect(chatTab).toHaveAttribute('aria-selected', 'true');
    expect(chatTab).toHaveAttribute('tabindex', '0');
    expect(boardTab).toHaveAttribute('aria-selected', 'false');
    expect(notesTab).toHaveAttribute('tabindex', '-1');
    expect(graphTab).toHaveAttribute('tabindex', '-1');
    expect(boardTab).toHaveAttribute('tabindex', '-1');
    for (const tab of [notesTab, graphTab, boardTab, chatTab]) {
      expect(tab).toHaveClass(
        'h-[var(--vlaina-size-44px)]',
      );
    }
    expect(chatTab).toHaveClass('min-w-max', 'shrink-0');
    for (const tab of [notesTab, graphTab, boardTab]) {
      expect(tab).toHaveClass(
        'min-w-[var(--vlaina-size-32px)]',
        'shrink',
      );
    }
    expect(chatTab.style.width).toContain('calc(');
    expect(notesTab).toHaveStyle({ width: 'var(--vlaina-size-44px)' });
    expect(chatTab.firstElementChild).toHaveClass(
      'bg-[var(--vlaina-sidebar-row-selected-bg)]',
      'shadow-[var(--vlaina-shadow-selection-soft)]',
      'inset-y-[var(--vlaina-size-4px)]',
      'opacity-[var(--vlaina-opacity-100)]',
    );
    expect(notesTab.firstElementChild).toHaveClass('opacity-[var(--vlaina-opacity-0)]');
    expect(chatTab).toHaveClass(
      'transition-[width]',
      'ease-[var(--vlaina-ease-in-out)]',
    );
    expect(screen.getByText('Chat')).toHaveClass('opacity-[var(--vlaina-opacity-100)]');
    expect(screen.getByText('Notes')).toHaveClass('opacity-[var(--vlaina-opacity-0)]');
    expect(screen.getByText('Board')).toHaveClass('opacity-[var(--vlaina-opacity-0)]');

    fireEvent.click(notesTab);

    expect(hoisted.uiState.setAppViewMode).toHaveBeenCalledWith('notes');
    expect(notesTab).toHaveAttribute('aria-selected', 'true');
    expect(notesTab).toHaveAttribute('tabindex', '0');
    expect(notesTab.className).toContain('text-[length:var(--vlaina-font-15)]');
    expect(notesTab.className).not.toContain('transition-colors');
    expect(notesTab).toHaveStyle({ color: 'var(--vlaina-sidebar-row-selected-text)' });
    expect(notesTab.style.width).toContain('calc(');
    expect(notesTab).toHaveClass(
      'min-w-max',
      'shrink-0',
    );
    expect(notesTab.firstElementChild).toHaveClass(
      'bg-[var(--vlaina-sidebar-row-selected-bg)]',
      'shadow-[var(--vlaina-shadow-selection-soft)]',
      'opacity-[var(--vlaina-opacity-100)]',
    );
    expect(screen.getByText('Notes')).toHaveClass('opacity-[var(--vlaina-opacity-100)]');
    expect(screen.getByText('Notes')).toHaveClass('motion-reduce:transition-none');
    expect(chatTab).toHaveAttribute('aria-selected', 'false');
    expect(chatTab).toHaveAttribute('tabindex', '-1');
    expect(chatTab).toHaveStyle({ width: 'var(--vlaina-size-44px)' });
    expect(chatTab).toHaveClass('min-w-[var(--vlaina-size-32px)]', 'shrink');
    expect(chatTab.firstElementChild).toHaveClass('opacity-[var(--vlaina-opacity-0)]');
  });

  it('preserves the previous widths for one frame before squeezing to an external view change', () => {
    let revealFrame: FrameRequestCallback | null = null;
    const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        revealFrame = callback;
        return 1;
      });
    const cancelAnimationFrame = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);

    try {
      const view = render(<AppViewModeSwitch />);
      const notesTab = screen.getByRole('tab', { name: 'Notes' });
      const chatTab = screen.getByRole('tab', { name: 'Chat' });

      hoisted.uiState.appViewMode = 'notes';
      view.rerender(<AppViewModeSwitch />);

      expect(chatTab).toHaveAttribute('aria-selected', 'true');
      expect(chatTab.style.width).toContain('calc(');
      expect(notesTab).toHaveStyle({ width: 'var(--vlaina-size-44px)' });

      act(() => revealFrame?.(0));

      expect(notesTab).toHaveAttribute('aria-selected', 'true');
      expect(notesTab.style.width).toContain('calc(');
      expect(chatTab).toHaveStyle({ width: 'var(--vlaina-size-44px)' });
    } finally {
      requestAnimationFrame.mockRestore();
      cancelAnimationFrame.mockRestore();
    }
  });

  it('activates and focuses view tabs with roving navigation keys', () => {
    render(<AppViewModeSwitch />);
    const notesTab = screen.getByRole('tab', { name: 'Notes' });
    const graphTab = screen.getByRole('tab', { name: 'Graph' });
    const boardTab = screen.getByRole('tab', { name: 'Board' });
    const chatTab = screen.getByRole('tab', { name: 'Chat' });

    act(() => chatTab.focus());
    fireEvent.keyDown(chatTab, { key: 'ArrowRight' });
    expect(notesTab).toHaveFocus();
    expect(notesTab).toHaveAttribute('tabindex', '0');
    expect(hoisted.uiState.setAppViewMode).toHaveBeenLastCalledWith('notes');

    fireEvent.keyDown(notesTab, { key: 'ArrowRight' });
    expect(graphTab).toHaveFocus();
    expect(graphTab).toHaveAttribute('tabindex', '0');
    expect(hoisted.uiState.setAppViewMode).toHaveBeenLastCalledWith('graph');

    fireEvent.keyDown(graphTab, { key: 'End' });
    expect(chatTab).toHaveFocus();
    expect(hoisted.uiState.setAppViewMode).toHaveBeenLastCalledWith('chat');

    fireEvent.keyDown(chatTab, { key: 'Home' });
    expect(notesTab).toHaveFocus();
    expect(hoisted.uiState.setAppViewMode).toHaveBeenLastCalledWith('notes');

    fireEvent.keyDown(notesTab, { key: 'ArrowLeft' });
    expect(chatTab).toHaveFocus();
    expect(hoisted.uiState.setAppViewMode).toHaveBeenLastCalledWith('chat');
    expect(boardTab).toHaveAttribute('tabindex', '-1');
  });

  it('moves focus to the matching switch in the newly visible pane', () => {
    const view = render(
      <>
        <div aria-hidden="false">
          <AppViewModeSwitch />
        </div>
        <div aria-hidden="true">
          <AppViewModeSwitch />
        </div>
      </>,
    );
    const visibleNotesTab = screen.getAllByRole('tab', { name: 'Notes', hidden: true })[0];
    act(() => {
      visibleNotesTab.focus();
      fireEvent.click(visibleNotesTab);
    });

    act(() => {
      hoisted.uiState.appViewMode = 'notes';
      view.rerender(
        <>
          <div aria-hidden="true">
            <AppViewModeSwitch />
          </div>
          <div aria-hidden="false">
            <AppViewModeSwitch />
          </div>
        </>,
      );
    });

    const newlyVisibleNotesTab = screen.getAllByRole('tab', { name: 'Notes', hidden: true })[1];
    expect(newlyVisibleNotesTab).toHaveFocus();
  });
});

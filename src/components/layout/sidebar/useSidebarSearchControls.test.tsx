import { act, render, screen } from '@testing-library/react';
import { useEffect, useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useSidebarSearchControls } from './useSidebarSearchControls';

function setScrollableMetrics(
  element: HTMLDivElement,
  metrics: { scrollTop?: number },
) {
  let currentScrollTop = metrics.scrollTop ?? 0;

  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    get: () => currentScrollTop,
    set: (value: number) => {
      currentScrollTop = value;
    },
  });
}

function SidebarSearchControlsHarness({
  enabled = true,
  isOpen,
  query,
  onOpen,
  onClose,
  scrollTop = 0,
}: {
  enabled?: boolean;
  isOpen: boolean;
  query: string;
  onOpen: () => void;
  onClose: () => void;
  scrollTop?: number;
}) {
  const interactionScopeRef = useRef<HTMLDivElement | null>(null);
  const { inputRef, scrollRootRef } = useSidebarSearchControls({
    enabled,
    isOpen,
    query,
    onOpen,
    onClose,
    interactionScopeRef,
  });

  useEffect(() => {
    const element = scrollRootRef.current;
    if (!element) {
      return;
    }

    setScrollableMetrics(element, { scrollTop });
  }, [scrollRootRef, scrollTop]);

  return (
    <>
      <div ref={interactionScopeRef} data-testid="interaction-scope">
        <input ref={inputRef} aria-label="search-input" />
        <button type="button" data-testid="scope-button">
          result
        </button>
        <textarea aria-label="rename-input" />
        <div ref={scrollRootRef} data-testid="scroll-root" />
      </div>
      <textarea aria-label="outside-editor" />
    </>
  );
}

describe('useSidebarSearchControls', () => {
  it('prevents the close wheel from propagating into the scroll area when the empty search drawer closes', () => {
    const onOpen = vi.fn();
    const onClose = vi.fn();

    render(
      <SidebarSearchControlsHarness
        isOpen
        query=""
        onOpen={onOpen}
        onClose={onClose}
      />,
    );

    const interactionScope = screen.getByTestId('interaction-scope');
    const wheelEvent = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: 100,
    });

    act(() => {
      interactionScope.dispatchEvent(wheelEvent);
    });

    expect(wheelEvent.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('blurs the focused search input immediately when downward wheel closes the empty drawer', () => {
    const onOpen = vi.fn();
    const onClose = vi.fn();

    render(
      <SidebarSearchControlsHarness
        isOpen
        query=""
        onOpen={onOpen}
        onClose={onClose}
      />,
    );

    const input = screen.getByLabelText('search-input');
    input.focus();
    expect(document.activeElement).toBe(input);

    const interactionScope = screen.getByTestId('interaction-scope');
    const wheelEvent = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: 100,
    });

    act(() => {
      interactionScope.dispatchEvent(wheelEvent);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).not.toBe(input);
  });

  it('blurs the focused search input when the drawer is closed by state', () => {
    const onOpen = vi.fn();
    const onClose = vi.fn();

    const { rerender } = render(
      <SidebarSearchControlsHarness
        isOpen
        query=""
        onOpen={onOpen}
        onClose={onClose}
      />,
    );

    const input = screen.getByLabelText('search-input');
    input.focus();
    expect(document.activeElement).toBe(input);

    rerender(
      <SidebarSearchControlsHarness
        isOpen={false}
        query=""
        onOpen={onOpen}
        onClose={onClose}
      />,
    );

    expect(document.activeElement).not.toBe(input);
  });

  it('returns focus to the opener when the drawer closes', () => {
    const onOpen = vi.fn();
    const onClose = vi.fn();

    const { rerender } = render(
      <SidebarSearchControlsHarness
        isOpen={false}
        query=""
        onOpen={onOpen}
        onClose={onClose}
      />,
    );
    const opener = screen.getByTestId('scope-button');
    opener.focus();

    rerender(
      <SidebarSearchControlsHarness
        isOpen
        query="alpha"
        onOpen={onOpen}
        onClose={onClose}
      />,
    );
    rerender(
      <SidebarSearchControlsHarness
        isOpen={false}
        query=""
        onOpen={onOpen}
        onClose={onClose}
      />,
    );

    expect(document.activeElement).toBe(opener);
  });

  it('does not restore focus into a pane that became inactive', () => {
    const onOpen = vi.fn();
    const onClose = vi.fn();

    const { rerender } = render(
      <SidebarSearchControlsHarness
        isOpen={false}
        query=""
        onOpen={onOpen}
        onClose={onClose}
      />,
    );
    const opener = screen.getByTestId('scope-button');
    opener.focus();
    rerender(
      <SidebarSearchControlsHarness
        isOpen
        query="alpha"
        onOpen={onOpen}
        onClose={onClose}
      />,
    );
    screen.getByLabelText('outside-editor').focus();
    rerender(
      <SidebarSearchControlsHarness
        enabled={false}
        isOpen={false}
        query=""
        onOpen={onOpen}
        onClose={onClose}
      />,
    );

    expect(document.activeElement).not.toBe(opener);
  });

  it('closes the open search drawer on Escape from non-editable sidebar focus', () => {
    const onOpen = vi.fn();
    const onClose = vi.fn();

    render(
      <SidebarSearchControlsHarness
        isOpen
        query="alpha"
        onOpen={onOpen}
        onClose={onClose}
      />,
    );

    const scopeButton = screen.getByTestId('scope-button');
    const keyEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Escape',
    });

    act(() => {
      scopeButton.dispatchEvent(keyEvent);
    });

    expect(keyEvent.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('does not close the open search drawer while IME composition is active', () => {
    const onOpen = vi.fn();
    const onClose = vi.fn();

    render(
      <SidebarSearchControlsHarness
        isOpen
        query="hao"
        onOpen={onOpen}
        onClose={onClose}
      />,
    );

    const scopeButton = screen.getByTestId('scope-button');
    const keyEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Escape',
    });
    Object.defineProperty(keyEvent, 'isComposing', { value: true });

    act(() => {
      scopeButton.dispatchEvent(keyEvent);
    });

    expect(keyEvent.defaultPrevented).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('leaves Escape inside another editable sidebar target alone', () => {
    const onOpen = vi.fn();
    const onClose = vi.fn();

    render(
      <SidebarSearchControlsHarness
        isOpen
        query="alpha"
        onOpen={onOpen}
        onClose={onClose}
      />,
    );

    const renameInput = screen.getByLabelText('rename-input');
    const keyEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Escape',
    });

    act(() => {
      renameInput.dispatchEvent(keyEvent);
    });

    expect(keyEvent.defaultPrevented).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('closes the open search drawer on Escape after focus leaves the sidebar', () => {
    const onOpen = vi.fn();
    const onClose = vi.fn();

    render(
      <SidebarSearchControlsHarness
        isOpen
        query="alpha"
        onOpen={onOpen}
        onClose={onClose}
      />,
    );

    const keyEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Escape',
    });

    act(() => {
      document.body.dispatchEvent(keyEvent);
    });

    expect(keyEvent.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('closes the open search drawer on Escape from an editable target outside the sidebar', () => {
    const onOpen = vi.fn();
    const onClose = vi.fn();

    render(
      <SidebarSearchControlsHarness
        isOpen
        query="alpha"
        onOpen={onOpen}
        onClose={onClose}
      />,
    );

    const outsideEditor = screen.getByLabelText('outside-editor');
    const keyEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Escape',
    });

    act(() => {
      outsideEditor.dispatchEvent(keyEvent);
    });

    expect(keyEvent.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('closes the open search drawer on Escape even if another handler already prevented default', () => {
    const onOpen = vi.fn();
    const onClose = vi.fn();

    render(
      <SidebarSearchControlsHarness
        isOpen
        query="alpha"
        onOpen={onOpen}
        onClose={onClose}
      />,
    );

    const outsideEditor = screen.getByLabelText('outside-editor');
    const keyEvent = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Escape',
    });
    keyEvent.preventDefault();

    act(() => {
      outsideEditor.dispatchEvent(keyEvent);
    });

    expect(keyEvent.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('does not steal Escape from a focused dialog outside the sidebar', () => {
    const onOpen = vi.fn();
    const onClose = vi.fn();
    const dialog = document.createElement('div');
    const dialogButton = document.createElement('button');
    dialog.setAttribute('role', 'dialog');
    dialogButton.type = 'button';
    dialog.appendChild(dialogButton);
    document.body.appendChild(dialog);

    try {
      render(
        <SidebarSearchControlsHarness
          isOpen
          query="alpha"
          onOpen={onOpen}
          onClose={onClose}
        />,
      );

      dialogButton.focus();
      const keyEvent = new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'Escape',
      });

      act(() => {
        dialogButton.dispatchEvent(keyEvent);
      });

      expect(keyEvent.defaultPrevented).toBe(false);
      expect(onClose).not.toHaveBeenCalled();
      expect(onOpen).not.toHaveBeenCalled();
    } finally {
      dialog.remove();
    }
  });

  it('still closes the empty search drawer on downward wheel even after results were scrolled', () => {
    const onOpen = vi.fn();
    const onClose = vi.fn();

    render(
      <SidebarSearchControlsHarness
        isOpen
        query=""
        onOpen={onOpen}
        onClose={onClose}
        scrollTop={48}
      />,
    );

    const interactionScope = screen.getByTestId('interaction-scope');
    const wheelEvent = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: 100,
    });

    act(() => {
      interactionScope.dispatchEvent(wheelEvent);
    });

    expect(wheelEvent.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('prevents the open wheel from propagating once the overscroll threshold is reached', () => {
    const onOpen = vi.fn();
    const onClose = vi.fn();

    render(
      <SidebarSearchControlsHarness
        isOpen={false}
        query=""
        onOpen={onOpen}
        onClose={onClose}
      />,
    );

    const interactionScope = screen.getByTestId('interaction-scope');
    const wheelEvent = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: -100,
    });

    act(() => {
      interactionScope.dispatchEvent(wheelEvent);
    });

    expect(wheelEvent.defaultPrevented).toBe(true);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });
});

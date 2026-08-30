import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useMenuDismiss } from './useMenuDismiss';

function MenuDismissHarness({ onClose }: { onClose: () => void }) {
  useMenuDismiss({ isOpen: true, onClose });
  return <div data-sidebar-context-menu-layer="true" />;
}

describe('useMenuDismiss', () => {
  it('keeps the menu open for an unmarked Escape during IME composition', () => {
    const onClose = vi.fn();
    render(<MenuDismissHarness onClose={onClose} />);

    fireEvent.compositionStart(document);
    const composingEscape = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
      isComposing: false,
    });
    document.dispatchEvent(composingEscape);

    expect(composingEscape.defaultPrevented).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on Escape after IME composition ends', () => {
    const onClose = vi.fn();
    render(<MenuDismissHarness onClose={onClose} />);

    fireEvent.compositionStart(document);
    fireEvent.compositionEnd(document);
    const escape = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(escape);

    expect(escape.defaultPrevented).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

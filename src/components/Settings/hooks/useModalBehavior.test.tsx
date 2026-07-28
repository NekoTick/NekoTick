import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useModalBehavior } from './useModalBehavior';

describe('useModalBehavior', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.style.overflow = '';
    document.body.replaceChildren();
  });

  it('traps focus inside the modal and restores the previous focus and body overflow', () => {
    vi.useFakeTimers();
    document.body.style.overflow = 'clip';
    const opener = document.createElement('button');
    const modal = document.createElement('div');
    const first = document.createElement('button');
    const last = document.createElement('button');
    modal.tabIndex = -1;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('data-settings-modal', 'true');
    modal.append(first, last);
    document.body.append(opener, modal);
    opener.focus();

    const { unmount } = renderHook(() => useModalBehavior({
      open: true,
      onClose: vi.fn(),
      modalRef: { current: modal },
    }));
    act(() => vi.runAllTimers());

    expect(document.activeElement).toBe(modal);
    expect(document.body.style.overflow).toBe('hidden');

    modal.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }));
    expect(document.activeElement).toBe(last);

    first.focus();
    first.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }));
    expect(document.activeElement).toBe(last);

    last.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    }));
    expect(document.activeElement).toBe(first);

    unmount();
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe('clip');
  });

  it('leaves Escape handling to a nested dialog', () => {
    const onClose = vi.fn();
    const nestedDialog = document.createElement('div');
    const nestedButton = document.createElement('button');
    nestedDialog.setAttribute('role', 'dialog');
    nestedDialog.appendChild(nestedButton);
    document.body.appendChild(nestedDialog);

    renderHook(() => useModalBehavior({ open: true, onClose }));
    nestedButton.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    }));

    expect(onClose).not.toHaveBeenCalled();
    nestedDialog.remove();
  });

  it('does not close when a child control consumes Escape', () => {
    const onClose = vi.fn();
    const childControl = document.createElement('input');
    childControl.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
      }
    });
    document.body.appendChild(childControl);

    renderHook(() => useModalBehavior({ open: true, onClose }));
    childControl.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    }));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not close or cancel editing while IME composition is active', () => {
    const onClose = vi.fn();
    const onCancelEdit = vi.fn();

    renderHook(() => useModalBehavior({
      open: true,
      onClose,
      isEditing: true,
      onCancelEdit,
    }));

    const event = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, 'isComposing', { value: true });
    window.dispatchEvent(event);

    expect(onClose).not.toHaveBeenCalled();
    expect(onCancelEdit).not.toHaveBeenCalled();
  });
});

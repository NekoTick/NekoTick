import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MobileLayer } from './MobileLayer';

vi.mock('@/components/ui/icons', () => ({ Icon: () => null }));
vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

function renderDrawer(onClose = vi.fn()) {
  render(
    <MobileLayer open title="Navigation" variant="drawer" onClose={onClose}>
      <button type="button">First</button>
      <button type="button">Last</button>
    </MobileLayer>,
  );
  return { dialog: screen.getByRole('dialog', { name: 'Navigation' }), onClose };
}

function makeVisible(element: HTMLElement) {
  Object.defineProperty(element, 'getClientRects', {
    configurable: true,
    value: () => [element.getBoundingClientRect()],
  });
}

describe('MobileLayer', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('closes a drawer only for a clearly horizontal left swipe', () => {
    const { dialog, onClose } = renderDrawer();

    fireEvent.pointerDown(dialog, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 220,
      clientY: 100,
    });
    fireEvent.pointerUp(dialog, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 130,
      clientY: 220,
    });
    fireEvent.pointerDown(dialog, {
      pointerId: 2,
      pointerType: 'touch',
      clientX: 220,
      clientY: 100,
    });
    fireEvent.pointerUp(dialog, {
      pointerId: 2,
      pointerType: 'touch',
      clientX: 130,
      clientY: 180,
    });

    expect(onClose).not.toHaveBeenCalled();

    fireEvent.pointerDown(dialog, {
      pointerId: 3,
      pointerType: 'touch',
      clientX: 220,
      clientY: 100,
    });
    fireEvent.pointerUp(dialog, {
      pointerId: 3,
      pointerType: 'touch',
      clientX: 120,
      clientY: 120,
    });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('clears a pending drawer swipe when the pointer is cancelled', () => {
    const { dialog, onClose } = renderDrawer();

    fireEvent.pointerDown(dialog, {
      pointerId: 7,
      pointerType: 'touch',
      clientX: 220,
      clientY: 100,
    });
    fireEvent.pointerCancel(dialog, { pointerId: 7, pointerType: 'touch' });
    fireEvent.pointerUp(dialog, {
      pointerId: 7,
      pointerType: 'touch',
      clientX: 100,
      clientY: 100,
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes when the backdrop is pressed', () => {
    const { dialog, onClose } = renderDrawer();
    const backdrop = dialog.parentElement;

    expect(backdrop).not.toBeNull();
    fireEvent.pointerDown(backdrop!);

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('closes the visible layer with Escape', () => {
    const { dialog, onClose } = renderDrawer();
    makeVisible(dialog);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('traps focus and restores the previously focused element after closing', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const onClose = vi.fn();
    const { rerender } = render(
      <MobileLayer open title="Navigation" variant="drawer" onClose={onClose}>
        <button type="button">First</button>
        <button type="button">Last</button>
      </MobileLayer>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Navigation' });
    const first = screen.getByRole('button', { name: 'First' });
    const last = screen.getByRole('button', { name: 'Last' });
    for (const button of [first, last]) {
      Object.defineProperty(button, 'offsetParent', {
        configurable: true,
        value: dialog,
      });
    }

    first.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);

    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    rerender(
      <MobileLayer open={false} title="Navigation" variant="drawer" onClose={onClose}>
        <button type="button">First</button>
        <button type="button">Last</button>
      </MobileLayer>,
    );

    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});

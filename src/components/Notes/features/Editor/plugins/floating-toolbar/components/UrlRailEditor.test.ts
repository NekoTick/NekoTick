import { describe, expect, it, vi } from 'vitest';
import { renderUrlRailEditor } from './UrlRailEditor';

describe('renderUrlRailEditor', () => {
  it('does not submit or cancel while an IME composition keydown is active', () => {
    const container = document.createElement('div');
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    const input = renderUrlRailEditor(container, {
      value: 'https://example.test',
      placeholder: 'URL...',
      hint: 'Press Enter to apply link',
      onSubmit,
      onCancel,
    });

    input.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      isComposing: true,
    }));
    input.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      isComposing: true,
    }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('does not submit while composition is active even if keydown is not marked composing', () => {
    const container = document.createElement('div');
    const onSubmit = vi.fn();
    const input = renderUrlRailEditor(container, {
      value: 'https://example.test',
      placeholder: 'URL...',
      hint: 'Press Enter to apply link',
      onSubmit,
      onCancel: vi.fn(),
    });

    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    }));

    expect(onSubmit).not.toHaveBeenCalled();

    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    }));

    expect(onSubmit).toHaveBeenCalledWith('https://example.test');
  });

  it('still submits ordinary Enter after composition has ended', () => {
    const container = document.createElement('div');
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    const input = renderUrlRailEditor(container, {
      value: 'https://example.test',
      placeholder: 'URL...',
      hint: 'Press Enter to apply link',
      onSubmit,
      onCancel,
    });

    input.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    }));

    expect(onSubmit).toHaveBeenCalledWith('https://example.test');
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('blocks image clipboard companion text without blocking ordinary URLs', () => {
    const container = document.createElement('div');
    const input = renderUrlRailEditor(container, {
      value: 'https://example.test/original',
      placeholder: 'URL...',
      hint: 'Press Enter to apply link',
      onSubmit: vi.fn(),
      onCancel: vi.fn(),
    });
    const file = new File(['image'], 'rail.png', { type: 'image/png' });
    const imageEvent = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(imageEvent, 'clipboardData', {
      value: {
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
        files: [file],
        getData: () => 'https://example.test/companion',
      },
    });
    const urlEvent = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(urlEvent, 'clipboardData', {
      value: {
        items: [],
        files: [],
        getData: () => 'https://example.test/ordinary',
      },
    });

    input.dispatchEvent(imageEvent);
    input.dispatchEvent(urlEvent);

    expect(imageEvent.defaultPrevented).toBe(true);
    expect(urlEvent.defaultPrevented).toBe(false);
    expect(input.value).toBe('https://example.test/original');
  });
});

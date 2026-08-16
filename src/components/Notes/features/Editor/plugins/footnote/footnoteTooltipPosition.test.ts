import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  installFootnoteTooltipPositioning,
  syncFootnoteTooltipPosition,
} from './footnoteTooltipPosition';

describe('footnote tooltip positioning', () => {
  const originalRequestAnimationFrame = window.requestAnimationFrame;
  const originalCancelAnimationFrame = window.cancelAnimationFrame;
  let callbacks = new Map<number, FrameRequestCallback>();
  let nextFrameId = 0;

  beforeEach(() => {
    callbacks = new Map();
    nextFrameId = 0;
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      const id = ++nextFrameId;
      callbacks.set(id, callback);
      return id;
    }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = ((id: number) => {
      callbacks.delete(id);
    }) as typeof window.cancelAnimationFrame;
  });

  afterEach(() => {
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
    document.body.replaceChildren();
  });

  it('coalesces active tooltip repositioning during scroll', () => {
    const editor = document.createElement('div');
    const reference = document.createElement('sup');
    reference.className = 'footnote-ref';
    reference.dataset.id = 'note';
    editor.append(reference);
    document.body.append(editor);
    vi.spyOn(reference, 'getBoundingClientRect').mockReturnValue({
      x: 10,
      y: 20,
      left: 10,
      top: 20,
      right: 20,
      bottom: 30,
      width: 10,
      height: 10,
      toJSON: () => ({}),
    });

    const positioning = installFootnoteTooltipPositioning(editor);
    reference.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(reference.getBoundingClientRect).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('scroll'));
    expect(callbacks.size).toBe(1);
    callbacks.forEach((callback) => callback(16));
    expect(reference.getBoundingClientRect).toHaveBeenCalledTimes(2);

    positioning.destroy();
  });

  it('stops scheduling after the pointer leaves the reference', () => {
    const editor = document.createElement('div');
    const reference = document.createElement('sup');
    reference.className = 'footnote-ref';
    reference.dataset.id = 'note';
    editor.append(reference);
    document.body.append(editor);
    vi.spyOn(reference, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 10,
      bottom: 10,
      width: 10,
      height: 10,
      toJSON: () => ({}),
    });

    const positioning = installFootnoteTooltipPositioning(editor);
    reference.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    reference.dispatchEvent(new MouseEvent('mouseout', {
      bubbles: true,
      relatedTarget: document.body,
    }));
    window.dispatchEvent(new Event('scroll'));

    expect(callbacks.size).toBe(0);
    positioning.destroy();
  });

  it('does not position zero-sized references', () => {
    const reference = document.createElement('sup');
    vi.spyOn(reference, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      toJSON: () => ({}),
    });

    syncFootnoteTooltipPosition(reference);

    expect(reference.className).toBe('');
  });
});

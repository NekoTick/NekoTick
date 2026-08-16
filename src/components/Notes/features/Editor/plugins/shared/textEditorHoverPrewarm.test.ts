import { afterEach, describe, expect, it, vi } from 'vitest';
import { themeUiFeedbackTokens } from '@/styles/themeTokens';
import { createTextEditorHoverPrewarm } from './textEditorHoverPrewarm';

describe('textEditorHoverPrewarm', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('warms after a stable hover and cancels when the pointer leaves the target', () => {
    vi.useFakeTimers();
    const editorDom = document.createElement('div');
    const target = document.createElement('div');
    target.dataset.prewarmTarget = 'true';
    const inner = document.createElement('span');
    target.append(inner);
    document.body.append(editorDom);
    editorDom.append(target);
    const cleanup = vi.fn();
    const prewarm = vi.fn(() => cleanup);
    const controller = createTextEditorHoverPrewarm({
      editorDom,
      findTarget: (eventTarget) => eventTarget instanceof Element
        ? eventTarget.closest<HTMLElement>('[data-prewarm-target="true"]')
        : null,
      prewarm,
    });

    inner.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    vi.advanceTimersByTime(themeUiFeedbackTokens.editorPreviewPrewarmDelayMs - 1);
    expect(prewarm).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(prewarm).toHaveBeenCalledTimes(1);

    inner.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: target }));
    expect(cleanup).not.toHaveBeenCalled();
    target.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    expect(cleanup).toHaveBeenCalledTimes(1);
    controller.destroy();
  });

  it('does not warm when the pointer leaves before the hover delay', () => {
    vi.useFakeTimers();
    const editorDom = document.createElement('div');
    const target = document.createElement('div');
    editorDom.append(target);
    document.body.append(editorDom);
    const prewarm = vi.fn();
    const controller = createTextEditorHoverPrewarm({
      editorDom,
      findTarget: (eventTarget) => eventTarget === target ? target : null,
      prewarm,
    });

    target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    target.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    vi.runAllTimers();

    expect(prewarm).not.toHaveBeenCalled();
    controller.destroy();
  });
});

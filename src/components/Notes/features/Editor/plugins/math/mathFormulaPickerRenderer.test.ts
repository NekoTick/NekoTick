import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMathFormulaPickerRenderer } from './mathFormulaPickerRenderer';

describe('mathFormulaPickerRenderer', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it('observes search result chunks instead of every formula button', () => {
    const observe = vi.fn();
    vi.stubGlobal('IntersectionObserver', class {
      observe = observe;
      unobserve() {}
      disconnect() {}
    });
    const results = document.createElement('div');
    const chunk = document.createElement('div');
    chunk.className = 'math-formula-picker-result-chunk';
    results.append(chunk);
    const preview = document.createElement('div');
    const renderer = createMathFormulaPickerRenderer({
      results,
      preview,
      getPreviewLatex: () => '',
    });

    for (let index = 0; index < 40; index += 1) {
      const button = document.createElement('button');
      button.className = 'math-formula-picker-item';
      renderer.prepareButton(button, `x_${index}`);
      chunk.append(button);
    }
    renderer.observeUnrendered(results);

    expect(observe).toHaveBeenCalledTimes(1);
    expect(observe).toHaveBeenCalledWith(chunk);
    renderer.destroy();
  });

  it('drops pending chunk formulas when the chunk leaves the viewport', () => {
    let observerCallback: IntersectionObserverCallback | undefined;
    const observe = vi.fn();
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback) {
        observerCallback = callback;
      }
      observe = observe;
      unobserve() {}
      disconnect() {}
    });
    let renderFrame: FrameRequestCallback | undefined;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      renderFrame = callback;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const results = document.createElement('div');
    const chunk = document.createElement('div');
    chunk.className = 'math-formula-picker-result-chunk';
    const button = document.createElement('button');
    button.className = 'math-formula-picker-item';
    chunk.append(button);
    results.append(chunk);
    document.body.append(results);
    const renderer = createMathFormulaPickerRenderer({
      results,
      preview: document.createElement('div'),
      getPreviewLatex: () => '',
    });
    renderer.prepareButton(button, 'x_{viewport_drop}');
    renderer.observeUnrendered(results);

    observerCallback?.([{ target: chunk, isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    observerCallback?.([{ target: chunk, isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver);
    renderFrame?.(0);

    expect(button.dataset.formulaRendered).toBe('false');
    expect(button.querySelector('.katex')).toBeNull();
    renderer.destroy();
  });

  it('keeps prepared category formulas queued when result rendering resets', () => {
    let renderFrame: FrameRequestCallback | undefined;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      renderFrame = callback;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const categories = document.createElement('div');
    const formula = document.createElement('span');
    categories.append(formula);
    document.body.append(categories);
    const renderer = createMathFormulaPickerRenderer({
      results: document.createElement('div'),
      preview: document.createElement('div'),
      getPreviewLatex: () => '',
    });

    renderer.prepareButton(formula, 'x_{category_queue}');
    renderer.renderPreparedGradually(categories);

    expect(formula.dataset.formulaRendered).toBe('false');
    expect(formula.querySelector('.katex')).toBeNull();
    renderer.reset();
    renderFrame?.(0);
    expect(formula.dataset.formulaRendered).toBe('true');
    expect(formula.querySelector('.katex')).not.toBeNull();
    renderer.destroy();
  });

  it('restores a cached formula without queueing another render', () => {
    const container = document.createElement('div');
    const firstFormula = document.createElement('button');
    firstFormula.className = 'math-formula-picker-item';
    container.append(firstFormula);
    document.body.append(container);
    const renderer = createMathFormulaPickerRenderer({
      results: document.createElement('div'),
      preview: document.createElement('div'),
      getPreviewLatex: () => '',
    });

    renderer.prepareButton(firstFormula, 'x_{cache_restore}');
    renderer.renderAllNow(container);
    const restoredFormula = document.createElement('button');
    renderer.prepareButton(restoredFormula, 'x_{cache_restore}');

    expect(restoredFormula.dataset.formulaRendered).toBe('true');
    expect(restoredFormula.querySelector('.katex')).not.toBeNull();
    renderer.destroy();
  });
});

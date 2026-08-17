import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMathFormulaPickerRenderer } from './mathFormulaPickerRenderer';

describe('mathFormulaPickerRenderer', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it('keeps prepared category formulas queued for gradual rendering', () => {
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
      preview: document.createElement('div'),
      getPreviewLatex: () => '',
    });

    renderer.prepareButton(formula, 'x_{category_queue}');
    renderer.renderPreparedGradually(categories);

    expect(formula.dataset.formulaRendered).toBe('false');
    expect(formula.querySelector('.katex')).toBeNull();
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

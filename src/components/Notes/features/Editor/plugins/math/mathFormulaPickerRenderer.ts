import {
  renderMathFormulaPickerButtonFormula,
  renderMathFormulaPickerFormula,
} from './mathFormulaPickerDom';

const FORMULA_RENDER_FRAME_BUDGET_MS = 4;
const FORMULA_ITEM_SELECTOR = '.math-formula-picker-item[data-formula-rendered="false"]';
const FORMULA_RESULT_CHUNK_SELECTOR = '.math-formula-picker-result-chunk';

export function createMathFormulaPickerRenderer(args: {
  results: HTMLElement;
  preview: HTMLElement;
  getPreviewLatex: () => string;
}) {
  const { results, preview, getPreviewLatex } = args;
  const pendingFormulaRenders = new Map<HTMLElement, string>();
  const formulaDefinitions = new WeakMap<HTMLElement, string>();
  let formulaRenderFrame: number | undefined;
  let previewRenderFrame: number | undefined;

  const formulaObserver = typeof IntersectionObserver === 'undefined'
    ? undefined
    : new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const target = entry.target as HTMLElement;
        const elements = target.matches(FORMULA_ITEM_SELECTOR)
          ? [target]
          : Array.from(target.querySelectorAll<HTMLElement>(FORMULA_ITEM_SELECTOR));
        elements.forEach((element) => {
          const formula = formulaDefinitions.get(element);
          if (!entry.isIntersecting) {
            pendingFormulaRenders.delete(element);
          } else if (formula) {
            pendingFormulaRenders.set(element, formula);
          }
        });
      });
      scheduleFormulaRenders();
    }, {
      root: results,
      rootMargin: '25% 0px',
    });

  const flushFormulaRenders = () => {
    formulaRenderFrame = undefined;
    const frameStart = performance.now();
    for (const [element, formula] of pendingFormulaRenders) {
      pendingFormulaRenders.delete(element);
      if (element.isConnected) {
        renderMathFormulaPickerButtonFormula(element, formula);
        element.dataset.formulaRendered = 'true';
      }
      formulaObserver?.unobserve(element);
      if (performance.now() - frameStart >= FORMULA_RENDER_FRAME_BUDGET_MS) break;
    }
    scheduleFormulaRenders();
  };

  function scheduleFormulaRenders() {
    if (!pendingFormulaRenders.size || formulaRenderFrame !== undefined) return;
    formulaRenderFrame = requestAnimationFrame(flushFormulaRenders);
  }

  const prepareButton = (element: HTMLElement, latex: string) => {
    element.dataset.formulaRendered = 'false';
    formulaDefinitions.set(element, latex);
  };

  const renderAllNow = (container: HTMLElement) => {
    container.querySelectorAll<HTMLElement>(FORMULA_ITEM_SELECTOR).forEach((element) => {
      const formula = formulaDefinitions.get(element);
      if (!formula) return;
      pendingFormulaRenders.delete(element);
      renderMathFormulaPickerButtonFormula(element, formula);
      element.dataset.formulaRendered = 'true';
    });
  };

  const observeUnrendered = (container: HTMLElement) => {
    formulaObserver?.disconnect();
    const chunks = container.querySelectorAll<HTMLElement>(FORMULA_RESULT_CHUNK_SELECTOR);
    const elements = chunks.length
      ? chunks
      : container.querySelectorAll<HTMLElement>(FORMULA_ITEM_SELECTOR);
    elements.forEach((element) => {
      if (formulaObserver) {
        formulaObserver.observe(element);
      } else if (element.matches(FORMULA_ITEM_SELECTOR)) {
        const formula = formulaDefinitions.get(element);
        if (formula) pendingFormulaRenders.set(element, formula);
      } else {
        element.querySelectorAll<HTMLElement>(FORMULA_ITEM_SELECTOR).forEach((button) => {
          const formula = formulaDefinitions.get(button);
          if (formula) pendingFormulaRenders.set(button, formula);
        });
      }
    });
    if (!formulaObserver) scheduleFormulaRenders();
  };

  const reset = () => {
    formulaObserver?.disconnect();
    pendingFormulaRenders.clear();
    if (formulaRenderFrame !== undefined) cancelAnimationFrame(formulaRenderFrame);
    formulaRenderFrame = undefined;
  };

  const renderPreviewNow = () => {
    previewRenderFrame = undefined;
    renderMathFormulaPickerFormula(preview, getPreviewLatex());
  };

  const schedulePreview = () => {
    if (previewRenderFrame !== undefined) return;
    previewRenderFrame = requestAnimationFrame(renderPreviewNow);
  };

  const destroy = () => {
    reset();
    formulaObserver?.disconnect();
    if (previewRenderFrame !== undefined) cancelAnimationFrame(previewRenderFrame);
    previewRenderFrame = undefined;
  };

  return {
    destroy,
    observeUnrendered,
    prepareButton,
    renderAllNow,
    renderPreviewNow,
    reset,
    schedulePreview,
  };
}

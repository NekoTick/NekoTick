import {
  renderMathFormulaPickerButtonFormula,
  renderMathFormulaPickerFormula,
  restoreCachedMathFormulaPickerButtonFormula,
} from './mathFormulaPickerDom';
import { createMathFormulaRenderQueue } from './mathFormulaRenderQueue';

const FORMULA_ITEM_SELECTOR = '.math-formula-picker-item[data-formula-rendered="false"]';
const PREPARED_FORMULA_SELECTOR = '[data-formula-rendered="false"]';
const FORMULA_RESULT_CHUNK_SELECTOR = '.math-formula-picker-result-chunk';

export function createMathFormulaPickerRenderer(args: {
  results: HTMLElement;
  preview: HTMLElement;
  getPreviewLatex: () => string;
}) {
  const { results, preview, getPreviewLatex } = args;
  const formulaDefinitions = new WeakMap<HTMLElement, string>();
  let previewRenderFrame: number | undefined;
  let formulaObserver: IntersectionObserver | undefined;
  const renderFormula = (element: HTMLElement, formula: string) => {
    renderMathFormulaPickerButtonFormula(element, formula);
    element.dataset.formulaRendered = 'true';
  };
  const visibleFormulaRenders = createMathFormulaRenderQueue({
    onSettled: (element) => formulaObserver?.unobserve(element),
    render: renderFormula,
  });
  const preparedFormulaRenders = createMathFormulaRenderQueue({ render: renderFormula });

  formulaObserver = typeof IntersectionObserver === 'undefined'
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
            visibleFormulaRenders.remove(element);
          } else if (formula) {
            visibleFormulaRenders.add(element, formula);
          }
        });
      });
    }, {
      root: results,
      rootMargin: '25% 0px',
    });

  const prepareButton = (element: HTMLElement, latex: string) => {
    formulaDefinitions.set(element, latex);
    if (restoreCachedMathFormulaPickerButtonFormula(element, latex)) {
      element.dataset.formulaRendered = 'true';
      return;
    }
    element.dataset.formulaRendered = 'false';
  };

  const renderPreparedGradually = (container: HTMLElement) => {
    container.querySelectorAll<HTMLElement>(PREPARED_FORMULA_SELECTOR).forEach((element) => {
      const formula = formulaDefinitions.get(element);
      if (formula) preparedFormulaRenders.add(element, formula);
    });
  };

  const renderAllNow = (container: HTMLElement) => {
    container.querySelectorAll<HTMLElement>(FORMULA_ITEM_SELECTOR).forEach((element) => {
      const formula = formulaDefinitions.get(element);
      if (!formula) return;
      visibleFormulaRenders.remove(element);
      preparedFormulaRenders.remove(element);
      renderFormula(element, formula);
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
        if (formula) visibleFormulaRenders.add(element, formula);
      } else {
        element.querySelectorAll<HTMLElement>(FORMULA_ITEM_SELECTOR).forEach((button) => {
          const formula = formulaDefinitions.get(button);
          if (formula) visibleFormulaRenders.add(button, formula);
        });
      }
    });
  };

  const reset = () => {
    formulaObserver?.disconnect();
    visibleFormulaRenders.clear();
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
    preparedFormulaRenders.clear();
    formulaObserver?.disconnect();
    if (previewRenderFrame !== undefined) cancelAnimationFrame(previewRenderFrame);
    previewRenderFrame = undefined;
  };

  return {
    destroy,
    observeUnrendered,
    prepareButton,
    renderAllNow,
    renderPreparedGradually,
    renderPreviewNow,
    reset,
    schedulePreview,
  };
}

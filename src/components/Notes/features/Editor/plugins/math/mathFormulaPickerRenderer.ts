import {
  renderMathFormulaPickerButtonFormula,
  renderMathFormulaPickerFormula,
  restoreCachedMathFormulaPickerButtonFormula,
} from './mathFormulaPickerDom';
import { createMathFormulaRenderQueue } from './mathFormulaRenderQueue';

const FORMULA_ITEM_SELECTOR = '.math-formula-picker-item[data-formula-rendered="false"]';
const PREPARED_FORMULA_SELECTOR = '[data-formula-rendered="false"]';

export function createMathFormulaPickerRenderer(args: {
  preview: HTMLElement;
  getPreviewLatex: () => string;
}) {
  const { preview, getPreviewLatex } = args;
  const formulaDefinitions = new WeakMap<HTMLElement, string>();
  let previewRenderFrame: number | undefined;
  const renderFormula = (element: HTMLElement, formula: string) => {
    renderMathFormulaPickerButtonFormula(element, formula);
    element.dataset.formulaRendered = 'true';
  };
  const preparedFormulaRenders = createMathFormulaRenderQueue({ render: renderFormula });

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
      preparedFormulaRenders.remove(element);
      renderFormula(element, formula);
    });
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
    preparedFormulaRenders.clear();
    if (previewRenderFrame !== undefined) cancelAnimationFrame(previewRenderFrame);
    previewRenderFrame = undefined;
  };

  return {
    destroy,
    prepareButton,
    renderAllNow,
    renderPreparedGradually,
    renderPreviewNow,
    schedulePreview,
  };
}

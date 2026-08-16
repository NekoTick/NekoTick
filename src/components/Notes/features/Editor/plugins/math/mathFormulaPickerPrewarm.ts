import { mathFormulaCategories } from './mathFormulaCatalog';
import { prewarmMathFormulaPickerButtonFormula } from './mathFormulaPickerDom';
import { FORMULA_RENDER_FRAME_BUDGET_MS } from './mathFormulaRenderQueue';

export function prewarmMathFormulaPicker() {
  let categoryIndex = 0;
  let renderFrame: number | undefined;

  const renderNext = () => {
    renderFrame = undefined;
    const frameStart = performance.now();
    while (categoryIndex < mathFormulaCategories.length) {
      prewarmMathFormulaPickerButtonFormula(mathFormulaCategories[categoryIndex].label);
      categoryIndex += 1;
      if (performance.now() - frameStart >= FORMULA_RENDER_FRAME_BUDGET_MS) break;
    }
    if (categoryIndex < mathFormulaCategories.length) {
      renderFrame = requestAnimationFrame(renderNext);
    }
  };

  renderFrame = requestAnimationFrame(renderNext);
  return () => {
    if (renderFrame !== undefined) cancelAnimationFrame(renderFrame);
    renderFrame = undefined;
  };
}

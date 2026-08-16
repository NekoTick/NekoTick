import { afterEach, describe, expect, it, vi } from 'vitest';
import { mathFormulaCategories } from './mathFormulaCatalog';

const mocks = vi.hoisted(() => ({
  prewarmFormula: vi.fn(),
}));

vi.mock('./mathFormulaPickerDom', () => ({
  prewarmMathFormulaPickerButtonFormula: mocks.prewarmFormula,
}));

import { prewarmMathFormulaPicker } from './mathFormulaPickerPrewarm';

describe('mathFormulaPickerPrewarm', () => {
  afterEach(() => {
    mocks.prewarmFormula.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('fills the category cache within the shared frame budget', () => {
    let renderFrame: FrameRequestCallback | undefined;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      renderFrame = callback;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.spyOn(performance, 'now').mockReturnValue(0);

    const cancel = prewarmMathFormulaPicker();
    expect(mocks.prewarmFormula).not.toHaveBeenCalled();
    renderFrame?.(0);

    expect(mocks.prewarmFormula).toHaveBeenCalledTimes(mathFormulaCategories.length);
    cancel();
  });

  it('cancels a pending frame before any formulas are rendered', () => {
    const cancelAnimationFrame = vi.fn();
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 7));
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame);

    const cancel = prewarmMathFormulaPicker();
    cancel();

    expect(cancelAnimationFrame).toHaveBeenCalledWith(7);
    expect(mocks.prewarmFormula).not.toHaveBeenCalled();
  });
});

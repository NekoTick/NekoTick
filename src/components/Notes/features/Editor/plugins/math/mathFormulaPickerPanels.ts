import type { MathFormulaCategory, MathFormulaItem } from './mathFormulaCatalog';
import { localizeMathFormulaName } from './mathFormulaPickerCopy';

export function createMathFormulaPickerPanelCache(
  createFormulaButton: (formula: MathFormulaItem) => HTMLElement,
) {
  const panels = new Map<string, HTMLElement>();

  return (category: MathFormulaCategory) => {
    const cached = panels.get(category.id);
    if (cached) return cached;

    const panel = document.createElement('div');
    panel.className = 'math-formula-picker-category-panel';
    const fragment = document.createDocumentFragment();
    category.groups.forEach((formulaGroup) => {
      const section = document.createElement('section');
      section.className = 'math-formula-picker-group';
      const label = document.createElement('h3');
      label.className = 'math-formula-picker-group-label';
      label.textContent = localizeMathFormulaName(formulaGroup);
      const grid = document.createElement('div');
      grid.className = 'math-formula-picker-grid';
      formulaGroup.items.forEach((formula) => grid.append(createFormulaButton(formula)));
      section.append(label, grid);
      fragment.append(section);
    });
    panel.append(fragment);
    panels.set(category.id, panel);
    return panel;
  };
}

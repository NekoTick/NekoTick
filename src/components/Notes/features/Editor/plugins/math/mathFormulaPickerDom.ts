import { themeIconTokens } from '@/styles/themeTokens';
import {
  mathFormulaCategories,
  type MathFormulaItem,
} from './mathFormulaCatalog';
import { renderLatexUncached } from './katex';
import { localizeMathFormulaName } from './mathFormulaPickerCopy';

const MAX_FORMULA_RENDER_CACHE_ENTRIES = 768;
const FORMULA_CATEGORY_ROW_SIZE = 12;
const FORMULA_SEARCH_CHUNK_SIZE = 40;
type FormulaRenderCacheEntry = { html: string; error: boolean };
const formulaRenderCache = new Map<string, FormulaRenderCacheEntry>();

export function createMathFormulaPickerButton(className: string, label: string) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.setAttribute('aria-label', label);
  return button;
}

export function createMathFormulaSearchIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', `${themeIconTokens.sizeCompact}`);
  svg.setAttribute('height', `${themeIconTokens.sizeCompact}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'm21 21-4.3-4.3m1.3-5.2a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('stroke-width', '2');
  svg.append(path);
  return svg;
}

export function renderMathFormulaPickerCategories(args: {
  categories: HTMLElement;
  results: HTMLElement;
  onOpen: (categoryId: string) => void;
  prepareFormula: (element: HTMLElement, latex: string) => void;
}) {
  const { categories, results, onOpen, prepareFormula } = args;
  categories.replaceChildren();
  let row: HTMLElement | undefined;

  mathFormulaCategories.forEach((category, index) => {
    if (index % FORMULA_CATEGORY_ROW_SIZE === 0) {
      row = document.createElement('div');
      row.className = 'math-formula-picker-category-row';
      categories.append(row);
    }

    const nameText = localizeMathFormulaName(category);
    const button = createMathFormulaPickerButton('math-formula-picker-category', nameText);
    button.dataset.categoryId = category.id;
    button.dataset.active = 'false';
    button.setAttribute('aria-expanded', 'false');

    const formula = document.createElement('span');
    formula.className = 'math-formula-picker-category-formula';
    formula.textContent = category.label;
    prepareFormula(formula, category.label);
    const name = document.createElement('span');
    name.className = 'math-formula-picker-category-name';
    name.textContent = nameText;
    button.append(formula, name);

    const open = () => onOpen(category.id);
    button.addEventListener('mouseenter', open);
    button.addEventListener('click', open);
    row?.append(button);
  });

  categories.append(results);
}

export function createMathFormulaSearchResults(
  formulaItems: MathFormulaItem[],
  createButton: (formula: MathFormulaItem) => HTMLElement,
) {
  const fragment = document.createDocumentFragment();
  formulaItems.forEach((formula, index) => {
    if (index % FORMULA_SEARCH_CHUNK_SIZE === 0) {
      const chunk = document.createElement('div');
      chunk.className = 'math-formula-picker-result-chunk';
      fragment.append(chunk);
    }
    (fragment.lastElementChild as HTMLElement).append(createButton(formula));
  });
  return fragment;
}

function readCachedFormulaRender(cacheKey: string) {
  const result = formulaRenderCache.get(cacheKey);
  if (result) {
    formulaRenderCache.delete(cacheKey);
    formulaRenderCache.set(cacheKey, result);
  }
  return result;
}

function applyFormulaRender(element: HTMLElement, result: FormulaRenderCacheEntry) {
  element.innerHTML = result.html;
  element.classList.toggle('math-formula-picker-render-error', result.error);
  return result;
}

function formulaRenderCacheKey(latex: string, displayMode: boolean, htmlOnly: boolean) {
  return `${displayMode ? 'display:' : 'inline:'}${htmlOnly ? 'html:' : ''}${latex}`;
}

function resolveMathFormulaPickerFormulaOutput(
  latex: string,
  displayMode = false,
  htmlOnly = false,
) {
  const cacheKey = formulaRenderCacheKey(latex, displayMode, htmlOnly);
  let result = readCachedFormulaRender(cacheKey);
  if (!result) {
    const rendered = renderLatexUncached(latex, displayMode, htmlOnly ? 'html' : 'htmlAndMathml');
    result = { html: rendered.html, error: Boolean(rendered.error) };
    formulaRenderCache.set(cacheKey, result);
    while (formulaRenderCache.size > MAX_FORMULA_RENDER_CACHE_ENTRIES) {
      const firstKey = formulaRenderCache.keys().next().value;
      if (typeof firstKey === 'string') formulaRenderCache.delete(firstKey);
      else break;
    }
  }
  return result;
}

function renderMathFormulaPickerFormulaOutput(
  element: HTMLElement,
  latex: string,
  displayMode = false,
  htmlOnly = false,
) {
  return applyFormulaRender(
    element,
    resolveMathFormulaPickerFormulaOutput(latex, displayMode, htmlOnly),
  );
}

export function prewarmMathFormulaPickerButtonFormula(latex: string) {
  resolveMathFormulaPickerFormulaOutput(latex, false, true);
}

export function restoreCachedMathFormulaPickerButtonFormula(
  element: HTMLElement,
  latex: string,
) {
  const result = readCachedFormulaRender(formulaRenderCacheKey(latex, false, true));
  if (!result) return false;
  applyFormulaRender(element, result);
  return true;
}

export function renderMathFormulaPickerFormula(
  element: HTMLElement,
  latex: string,
  displayMode = false,
) {
  return renderMathFormulaPickerFormulaOutput(element, latex, displayMode);
}

export function renderMathFormulaPickerButtonFormula(
  element: HTMLElement,
  latex: string,
) {
  return renderMathFormulaPickerFormulaOutput(element, latex, false, true);
}

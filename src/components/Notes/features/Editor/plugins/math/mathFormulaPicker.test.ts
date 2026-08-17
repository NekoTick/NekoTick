import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTextEditorPopupElements } from '../shared/textEditorPopupDom';
import { mathFormulaCategories, mathFormulaItems } from './mathFormulaCatalog';
import {
  configureMathFormulaPicker,
} from './mathFormulaPicker';

const PROTOTYPE_ONLY_LATEX = [
  '\\ ', '\\colon', "{}''", 'a^\\ast', 'a^\\star', 'a_0',
  '\\begin{rcases} {} & {} \\\\ {} & {} \\end{rcases}',
  '\\begin{alignedat}{2} {}&={} & {}&={} \\end{alignedat}',
  '\\begin{subarray}{c} {} \\\\ {} \\end{subarray}',
  '{ {} \\atop {} }', '\\mathnormal{}', '\\pmb{}',
  '\\mathbb{N}', '\\mathbb{Z}', '\\mathbb{Q}', '\\mathbb{C}',
  '\\displaystyle', '\\textstyle', '\\scriptstyle', '\\scriptscriptstyle',
];

describe('mathFormulaPicker', () => {
  afterEach(() => {
    document.documentElement.lang = '';
    document.body.replaceChildren();
  });

  it('keeps every prototype category available in the catalog', () => {
    expect(mathFormulaCategories.filter((category) => category.kind === 'symbol')).toHaveLength(13);
    expect(mathFormulaCategories.filter((category) => category.kind === 'template')).toHaveLength(10);
    expect(mathFormulaItems.length).toBeGreaterThan(400);
  });

  it('keeps prototype-only LaTeX syntax available in the catalog', () => {
    const catalogLatex = mathFormulaItems.map((item) => item.latex);
    expect(catalogLatex).toEqual(expect.arrayContaining(PROTOTYPE_ONLY_LATEX));
  });

  it('shows LaTeX categories without a search field', () => {
    document.documentElement.lang = 'zh-CN';
    const elements = createTextEditorPopupElements();
    configureMathFormulaPicker(elements, vi.fn());
    document.body.append(elements.card);

    expect(document.querySelector('.math-formula-picker-heading')).toHaveTextContent('LaTeX');
    expect(document.querySelector('.math-formula-picker-mode')).toBeNull();
    expect(document.querySelector('.math-formula-picker-search-input')).toBeNull();
    expect(document.querySelector('.math-formula-picker-shortcuts')).toBeInTheDocument();
    expect(document.querySelectorAll('.math-formula-picker-category')).toHaveLength(23);
    expect(document.querySelectorAll(
      '.math-formula-picker-category-formula[data-formula-rendered="false"]',
    )).toHaveLength(23);
    expect(document.querySelector('.math-formula-picker-results')).not.toBeVisible();
  });

  it('opens a formula popover when hovering a category', () => {
    const elements = createTextEditorPopupElements();
    configureMathFormulaPicker(elements, vi.fn());
    document.body.append(elements.card);

    const category = document.querySelector<HTMLButtonElement>('.math-formula-picker-category')!;
    category.dispatchEvent(new MouseEvent('mouseenter'));

    expect(category).toHaveAttribute('aria-expanded', 'true');
    expect(document.querySelector('.math-formula-picker-results')).toBeVisible();
  });

  it('closes category results promptly after the pointer leaves', () => {
    vi.useFakeTimers();
    try {
      const elements = createTextEditorPopupElements();
      configureMathFormulaPicker(elements, vi.fn());
      document.body.append(elements.card);

      const categories = document.querySelector<HTMLElement>('.math-formula-picker-categories')!;
      const category = categories.querySelector<HTMLButtonElement>('.math-formula-picker-category')!;
      const results = document.querySelector<HTMLElement>('.math-formula-picker-results')!;
      category.dispatchEvent(new MouseEvent('mouseenter'));
      categories.dispatchEvent(new MouseEvent('mouseleave'));

      vi.advanceTimersByTime(49);
      expect(results).toBeVisible();
      vi.advanceTimersByTime(1);
      expect(results).not.toBeVisible();
    } finally {
      vi.useRealTimers();
    }
  });

  it('places category results directly below the active category row', () => {
    const elements = createTextEditorPopupElements();
    configureMathFormulaPicker(elements, vi.fn());
    document.body.append(elements.card);

    const rows = document.querySelectorAll<HTMLElement>('.math-formula-picker-category-row');
    const firstRowCategory = rows[0].querySelector<HTMLButtonElement>('.math-formula-picker-category')!;
    const secondRowCategory = rows[1].querySelector<HTMLButtonElement>('.math-formula-picker-category')!;
    const results = document.querySelector<HTMLElement>('.math-formula-picker-results')!;

    firstRowCategory.dispatchEvent(new MouseEvent('mouseenter'));
    expect(rows[0].nextElementSibling).toBe(results);
    expect(results.nextElementSibling).toBe(rows[1]);

    secondRowCategory.dispatchEvent(new MouseEvent('mouseenter'));
    expect(rows[1].nextElementSibling).toBe(results);
    expect(document.querySelectorAll('.math-formula-picker-category')).toHaveLength(23);
  });

  it('prepares the next category panel before showing it', () => {
    const elements = createTextEditorPopupElements();
    configureMathFormulaPicker(elements, vi.fn());
    document.body.append(elements.card);

    const categoryButtons = document.querySelectorAll<HTMLButtonElement>('.math-formula-picker-category');
    const results = document.querySelector<HTMLElement>('.math-formula-picker-results')!;
    categoryButtons[0].dispatchEvent(new MouseEvent('mouseenter'));
    const previousPanel = results.firstElementChild;
    const shownStates: Array<{
      categoryId: string | undefined;
      panel: Element | null;
      unrenderedCount: number;
    }> = [];
    const hiddenDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'hidden')!;

    Object.defineProperty(results, 'hidden', {
      configurable: true,
      get: () => hiddenDescriptor.get!.call(results),
      set(value: boolean) {
        if (!value) {
          shownStates.push({
            categoryId: results.dataset.categoryId,
            panel: results.firstElementChild,
            unrenderedCount: results.querySelectorAll('[data-formula-rendered="false"]').length,
          });
        }
        hiddenDescriptor.set!.call(results, value);
      },
    });

    categoryButtons[1].dispatchEvent(new MouseEvent('mouseenter'));

    expect(shownStates).toEqual([{
      categoryId: categoryButtons[1].dataset.categoryId,
      panel: results.firstElementChild,
      unrenderedCount: 0,
    }]);
    expect(shownStates[0].panel).not.toBe(previousPanel);
  });

  it('keeps formulas selectable from both category rows', () => {
    const elements = createTextEditorPopupElements();
    const notifyInput = vi.fn();
    configureMathFormulaPicker(elements, notifyInput);
    document.body.append(elements.card);

    const rows = document.querySelectorAll<HTMLElement>('.math-formula-picker-category-row');
    rows[0].querySelector<HTMLButtonElement>('.math-formula-picker-category')!
      .dispatchEvent(new MouseEvent('mouseenter'));
    document.querySelector<HTMLButtonElement>('.math-formula-picker-item')!.click();

    rows[1].querySelector<HTMLButtonElement>('.math-formula-picker-category')!
      .dispatchEvent(new MouseEvent('mouseenter'));
    document.querySelector<HTMLButtonElement>('.math-formula-picker-item')!.click();

    expect(elements.textarea.value).not.toBe('');
    expect(notifyInput).toHaveBeenCalledTimes(2);
  });

  it('renders picker buttons without duplicate MathML markup', async () => {
    const elements = createTextEditorPopupElements();
    configureMathFormulaPicker(elements, vi.fn());
    document.body.append(elements.card);

    const category = document.querySelector<HTMLButtonElement>('.math-formula-picker-category')!;
    category.dispatchEvent(new MouseEvent('mouseenter'));
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const formula = document.querySelector<HTMLElement>('.math-formula-picker-item')!;
    expect(formula.querySelector('.katex-html')).not.toBeNull();
    expect(formula.querySelector('.katex-mathml')).toBeNull();
    expect(formula).toHaveAccessibleName();
  });

  it('reuses a category panel when it is opened again', () => {
    const elements = createTextEditorPopupElements();
    configureMathFormulaPicker(elements, vi.fn());
    document.body.append(elements.card);

    const category = document.querySelector<HTMLButtonElement>('.math-formula-picker-category')!;
    category.dispatchEvent(new MouseEvent('mouseenter'));
    const firstPanel = document.querySelector('.math-formula-picker-category-panel');

    elements.textarea.focus();
    category.dispatchEvent(new MouseEvent('mouseenter'));

    expect(document.querySelector('.math-formula-picker-category-panel')).toBe(firstPanel);
  });

  it('restores cached category formulas immediately in the next picker', async () => {
    const firstElements = createTextEditorPopupElements();
    const firstCleanup = configureMathFormulaPicker(firstElements, vi.fn());
    document.body.append(firstElements.card);
    await vi.waitFor(() => {
      expect(document.querySelectorAll(
        '.math-formula-picker-category-formula[data-formula-rendered="true"]',
      )).toHaveLength(mathFormulaCategories.length);
    });
    firstCleanup();
    firstElements.card.remove();

    const secondElements = createTextEditorPopupElements();
    configureMathFormulaPicker(secondElements, vi.fn());
    document.body.append(secondElements.card);

    expect(document.querySelectorAll(
      '.math-formula-picker-category-formula[data-formula-rendered="true"]',
    )).toHaveLength(mathFormulaCategories.length);
    expect(document.querySelectorAll(
      '.math-formula-picker-category-formula[data-formula-rendered="false"]',
    )).toHaveLength(0);
  });

  it('renders the input and live preview in an editor grid', () => {
    const elements = createTextEditorPopupElements();
    configureMathFormulaPicker(elements, vi.fn());
    document.body.append(elements.card);

    const picker = document.querySelector<HTMLElement>('.math-formula-picker')!;
    expect(picker.querySelector('.math-formula-picker-editor-grid')).toContainElement(elements.textarea);
    expect(picker.querySelector('.math-formula-picker-preview')).toBeInTheDocument();
    expect(picker.querySelector('.math-formula-picker-pane-label')).toHaveTextContent('Input');
  });

  it('updates the rendered preview as LaTeX changes', async () => {
    const elements = createTextEditorPopupElements();
    configureMathFormulaPicker(elements, vi.fn());
    document.body.append(elements.card);

    elements.textarea.value = 'x^2';
    elements.textarea.dispatchEvent(new Event('input'));
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(document.querySelector('.math-formula-picker-preview .katex')).not.toBeNull();
  });

});

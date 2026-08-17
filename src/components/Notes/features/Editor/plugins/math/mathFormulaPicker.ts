import { themeUiFeedbackTokens } from '@/styles/themeTokens';
import type { TextEditorPopupElements } from '../shared/textEditorPopupDom';
import { createTextEditorWorkspace } from '../shared/textEditorWorkspaceDom';
import {
  mathFormulaCategories,
  type MathFormulaItem,
} from './mathFormulaCatalog';
import { getMathFormulaPickerCopy } from './mathFormulaPickerCopy';
import {
  createMathFormulaPickerButton,
  renderMathFormulaPickerCategories,
} from './mathFormulaPickerDom';
import {
  insertMathFormulaSnippet,
  jumpToMathFormulaPlaceholder,
} from './mathFormulaPickerInput';
import { createMathFormulaPickerPanelCache } from './mathFormulaPickerPanels';
import { createMathFormulaPickerRenderer } from './mathFormulaPickerRenderer';

export { insertMathFormulaSnippet } from './mathFormulaPickerInput';

export function configureMathFormulaPicker(
  elements: TextEditorPopupElements,
  notifyInput: () => void,
) {
  const { content, textarea } = elements;
  const copy = getMathFormulaPickerCopy();
  let activeCategoryId = mathFormulaCategories[0]?.id ?? '';
  let hoverCloseTimer: ReturnType<typeof setTimeout> | undefined;
  const formulaItemsByButton = new WeakMap<HTMLElement, MathFormulaItem>();

  const {
    workspace,
    header,
    inputPane,
    preview,
  } = createTextEditorWorkspace({
    elements,
    ariaLabel: 'LaTeX',
    classPrefix: 'math-formula-picker',
    heading: 'LaTeX',
    inputLabel: copy.input,
    previewLabel: copy.preview,
  });

  const shortcuts = document.createElement('section');
  shortcuts.className = 'math-formula-picker-shortcuts';
  shortcuts.setAttribute('aria-label', copy.categories);

  const categories = document.createElement('div');
  categories.className = 'math-formula-picker-categories';
  categories.setAttribute('aria-label', copy.categories);

  const results = document.createElement('div');
  results.className = 'math-formula-picker-results';
  results.hidden = true;
  shortcuts.append(categories);

  const tools = document.createElement('div');
  tools.className = 'math-formula-picker-tools';
  const clearButton = createMathFormulaPickerButton('math-formula-picker-tool', copy.clear);
  const lineBreakButton = createMathFormulaPickerButton('math-formula-picker-tool', copy.insertLineBreak);
  clearButton.textContent = copy.clear;
  lineBreakButton.textContent = copy.insertLineBreak;
  tools.append(clearButton, lineBreakButton);
  inputPane.append(tools);

  const formulaRenderer = createMathFormulaPickerRenderer({
    preview,
    getPreviewLatex: () => textarea.value,
  });

  const syncCategoryState = () => {
    categories.querySelectorAll<HTMLButtonElement>('.math-formula-picker-category')
      .forEach((button) => {
        const isActive = !results.hidden && button.dataset.categoryId === activeCategoryId;
        button.dataset.active = String(isActive);
        button.setAttribute('aria-expanded', String(isActive));
      });
  };

  const cancelHoverClose = () => {
    clearTimeout(hoverCloseTimer);
  };

  const closeResults = () => {
    cancelHoverClose();
    results.hidden = true;
    syncCategoryState();
  };

  const scheduleHoverClose = () => {
    cancelHoverClose();
    hoverCloseTimer = setTimeout(
      closeResults,
      themeUiFeedbackTokens.mathFormulaPickerHoverCloseDelayMs,
    );
  };

  const insertFormula = (formula: MathFormulaItem) => {
    insertMathFormulaSnippet(textarea, formula.latex);
    closeResults();
    formulaRenderer.schedulePreview();
    notifyInput();
  };

  results.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLElement>('.math-formula-picker-item');
    const formula = button ? formulaItemsByButton.get(button) : undefined;
    if (formula) insertFormula(formula);
  });

  const createFormulaButton = (formula: MathFormulaItem) => {
    const button = createMathFormulaPickerButton('math-formula-picker-item', formula.latex);
    button.textContent = formula.preview ?? formula.latex;
    formulaItemsByButton.set(button, formula);
    formulaRenderer.prepareButton(button, formula.preview ?? formula.latex);
    return button;
  };

  const getCategoryPanel = createMathFormulaPickerPanelCache(createFormulaButton);

  const renderActiveCategory = () => {
    const active = mathFormulaCategories.find((category) => category.id === activeCategoryId);
    if (!active) return;
    if (!results.hidden && results.dataset.categoryId === active.id) return;
    results.hidden = true;
    const activeButton = categories.querySelector<HTMLElement>(`[data-category-id="${active.id}"]`);
    activeButton?.closest('.math-formula-picker-category-row')?.after(results);
    results.dataset.layout = 'groups';
    results.dataset.categoryId = active.id;
    results.dataset.formulaKind = active.kind;
    const panel = getCategoryPanel(active);
    formulaRenderer.renderAllNow(panel);
    results.replaceChildren(panel);
    results.hidden = false;
    syncCategoryState();
  };

  categories.addEventListener('mouseleave', scheduleHoverClose);
  results.addEventListener('mouseenter', cancelHoverClose);
  results.addEventListener('mouseleave', scheduleHoverClose);
  clearButton.addEventListener('click', () => {
    textarea.value = '';
    textarea.focus();
    formulaRenderer.schedulePreview();
    notifyInput();
  });
  lineBreakButton.addEventListener('click', () => insertFormula({ latex: '\\\\\n' }));
  textarea.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    event.preventDefault();
    if (!jumpToMathFormulaPlaceholder(textarea, event.shiftKey)) {
      insertMathFormulaSnippet(textarea, '  ');
      formulaRenderer.schedulePreview();
      notifyInput();
    }
  });
  textarea.addEventListener('focus', closeResults);
  textarea.addEventListener('input', formulaRenderer.schedulePreview);

  header.after(shortcuts);
  content.prepend(workspace);
  renderMathFormulaPickerCategories({
    categories,
    results,
    prepareFormula: formulaRenderer.prepareButton,
    onOpen(categoryId) {
      cancelHoverClose();
      activeCategoryId = categoryId;
      renderActiveCategory();
    },
  });
  formulaRenderer.renderPreviewNow();
  formulaRenderer.renderPreparedGradually(categories);

  return () => {
    cancelHoverClose();
    formulaRenderer.destroy();
  };
}

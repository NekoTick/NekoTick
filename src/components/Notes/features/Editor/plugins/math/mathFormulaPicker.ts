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
  createMathFormulaSearchIcon,
  createMathFormulaSearchResults,
  renderMathFormulaPickerCategories,
} from './mathFormulaPickerDom';
import {
  insertMathFormulaSnippet,
  jumpToMathFormulaPlaceholder,
} from './mathFormulaPickerInput';
import { createMathFormulaPickerPanelCache } from './mathFormulaPickerPanels';
import { createMathFormulaPickerRenderer } from './mathFormulaPickerRenderer';
import { searchMathFormulaItems } from './mathFormulaPickerSearch';

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
  let searchRenderFrame: number | undefined;

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

  const searchField = document.createElement('div');
  searchField.className = 'math-formula-picker-search-field';
  searchField.append(createMathFormulaSearchIcon());
  const search = document.createElement('input');
  search.className = 'math-formula-picker-search-input';
  search.type = 'search';
  search.autocomplete = 'off';
  search.placeholder = copy.search;
  search.setAttribute('aria-label', copy.search);
  searchField.append(search);
  header.append(searchField);

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
    results,
    preview,
    getPreviewLatex: () => textarea.value,
  });

  const cancelSearchRender = () => {
    if (searchRenderFrame !== undefined) cancelAnimationFrame(searchRenderFrame);
    searchRenderFrame = undefined;
  };

  const syncCategoryState = () => {
    categories.querySelectorAll<HTMLButtonElement>('.math-formula-picker-category')
      .forEach((button) => {
        const isActive = !results.hidden && !search.value.trim()
          && button.dataset.categoryId === activeCategoryId;
        button.dataset.active = String(isActive);
        button.setAttribute('aria-expanded', String(isActive));
      });
  };

  const cancelHoverClose = () => {
    clearTimeout(hoverCloseTimer);
  };

  const closeResults = () => {
    cancelHoverClose();
    cancelSearchRender();
    formulaRenderer.reset();
    results.hidden = true;
    syncCategoryState();
  };

  const scheduleHoverClose = () => {
    if (search.value.trim()) return;
    cancelHoverClose();
    hoverCloseTimer = setTimeout(
      closeResults,
      themeUiFeedbackTokens.mathFormulaPickerHoverCloseDelayMs,
    );
  };

  const insertFormula = (formula: MathFormulaItem) => {
    insertMathFormulaSnippet(textarea, formula.latex);
    search.value = '';
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

  const renderItems = (formulaItems: MathFormulaItem[]) => {
    results.hidden = true;
    formulaRenderer.reset();
    categories.append(results);
    results.dataset.layout = 'grid';
    delete results.dataset.formulaKind;
    delete results.dataset.categoryId;
    results.replaceChildren();
    if (!formulaItems.length) {
      const empty = document.createElement('p');
      empty.className = 'math-formula-picker-empty';
      empty.textContent = copy.noResults;
      results.append(empty);
    } else {
      results.append(createMathFormulaSearchResults(formulaItems, createFormulaButton));
      formulaRenderer.observeUnrendered(results);
    }
    results.hidden = false;
    syncCategoryState();
  };

  const renderActiveCategory = () => {
    const active = mathFormulaCategories.find((category) => category.id === activeCategoryId);
    if (!active) return;
    if (!results.hidden && results.dataset.categoryId === active.id && !search.value.trim()) return;
    results.hidden = true;
    formulaRenderer.reset();
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

  search.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    search.value = '';
    closeResults();
    textarea.focus();
  });
  search.addEventListener('input', () => {
    if (!search.value.trim()) {
      cancelSearchRender();
      closeResults();
      return;
    }
    if (searchRenderFrame !== undefined) return;
    searchRenderFrame = requestAnimationFrame(() => {
      searchRenderFrame = undefined;
      const query = search.value.trim();
      if (query) renderItems(searchMathFormulaItems(query));
    });
  });
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
      cancelSearchRender();
      activeCategoryId = categoryId;
      search.value = '';
      renderActiveCategory();
    },
  });
  formulaRenderer.renderPreviewNow();
  formulaRenderer.renderPreparedGradually(categories);

  return () => {
    cancelHoverClose();
    cancelSearchRender();
    formulaRenderer.destroy();
  };
}

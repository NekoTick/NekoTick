import { translate } from '@/lib/i18n';
import type { TextEditorPopupElements } from '../shared/textEditorPopupDom';
import {
  mathFormulaCategories,
  type MathFormulaCategory,
  type MathFormulaItem,
} from './mathFormulaCatalog';
import {
  getMathFormulaPickerCopy,
  localizeMathFormulaName,
} from './mathFormulaPickerCopy';
import {
  createMathFormulaPickerButton,
  createMathFormulaSearchIcon,
  renderMathFormulaPickerFormula,
} from './mathFormulaPickerDom';
import { searchMathFormulaItems } from './mathFormulaPickerSearch';

export function insertMathFormulaSnippet(textarea: HTMLTextAreaElement, snippet: string) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = textarea.value.slice(start, end);
  const inserted = selected && snippet.includes('{}')
    ? snippet.replace('{}', `{${selected}}`)
    : snippet;

  textarea.setRangeText(inserted, start, end, 'end');
  const firstPlaceholder = inserted.indexOf('{}');
  const cursor = firstPlaceholder >= 0
    ? start + firstPlaceholder + 1
    : start + inserted.length;
  textarea.setSelectionRange(cursor, cursor);
  textarea.focus();
}

function jumpToPlaceholder(textarea: HTMLTextAreaElement, backwards: boolean) {
  const cursor = textarea.selectionStart;
  const placeholders = Array.from(textarea.value.matchAll(/\{\s*\}/g), (match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
  const target = backwards
    ? placeholders.filter((placeholder) => placeholder.end < cursor).at(-1)
    : placeholders.find((placeholder) => placeholder.start >= cursor);
  if (!target) return false;
  textarea.setSelectionRange(target.start + 1, target.end - 1);
  return true;
}

export function configureMathFormulaPicker(
  elements: TextEditorPopupElements,
  notifyInput: () => void,
) {
  const { content, textarea } = elements;
  const copy = getMathFormulaPickerCopy();
  let mode: MathFormulaCategory['kind'] = 'symbol';
  let activeCategoryId = mathFormulaCategories.find((category) => category.kind === mode)?.id ?? '';

  const workspace = document.createElement('section');
  workspace.className = 'math-formula-picker';
  workspace.setAttribute('aria-label', translate('editor.slash.equation'));

  const header = document.createElement('div');
  header.className = 'math-formula-picker-header';
  const heading = document.createElement('span');
  heading.className = 'math-formula-picker-heading';
  heading.textContent = translate('editor.slash.equation');
  const modes = document.createElement('div');
  modes.className = 'math-formula-picker-modes';
  modes.setAttribute('role', 'tablist');
  const symbolMode = createMathFormulaPickerButton('math-formula-picker-mode', copy.symbols);
  const templateMode = createMathFormulaPickerButton('math-formula-picker-mode', copy.templates);
  symbolMode.textContent = copy.symbols;
  templateMode.textContent = copy.templates;
  symbolMode.setAttribute('role', 'tab');
  templateMode.setAttribute('role', 'tab');
  modes.append(symbolMode, templateMode);
  header.append(heading, modes);

  const searchRow = document.createElement('div');
  searchRow.className = 'math-formula-picker-search-row';
  const searchTrigger = createMathFormulaPickerButton('math-formula-picker-search-trigger', copy.search);
  searchTrigger.append(createMathFormulaSearchIcon());
  const searchField = document.createElement('div');
  searchField.className = 'math-formula-picker-search-field';
  searchField.hidden = true;
  searchField.append(createMathFormulaSearchIcon());
  const search = document.createElement('input');
  search.className = 'math-formula-picker-search-input';
  search.type = 'search';
  search.autocomplete = 'off';
  search.placeholder = copy.search;
  search.setAttribute('aria-label', copy.search);
  const searchClose = createMathFormulaPickerButton('math-formula-picker-search-close', copy.closeSearch);
  searchClose.textContent = '\u00d7';
  searchField.append(search, searchClose);
  searchRow.append(searchTrigger, searchField);

  const categories = document.createElement('div');
  categories.className = 'math-formula-picker-categories';
  categories.setAttribute('aria-label', copy.categories);

  const results = document.createElement('div');
  results.className = 'math-formula-picker-results';

  const tools = document.createElement('div');
  tools.className = 'math-formula-picker-tools';
  const clearButton = createMathFormulaPickerButton('math-formula-picker-tool', copy.clear);
  const lineBreakButton = createMathFormulaPickerButton('math-formula-picker-tool', copy.insertLineBreak);
  clearButton.textContent = copy.clear;
  lineBreakButton.textContent = copy.insertLineBreak;
  tools.append(clearButton, lineBreakButton);

  const insertFormula = (formula: MathFormulaItem) => {
    insertMathFormulaSnippet(textarea, formula.latex);
    notifyInput();
  };

  const renderItems = (formulaItems: MathFormulaItem[]) => {
    results.dataset.layout = 'grid';
    results.replaceChildren();
    if (!formulaItems.length) {
      const empty = document.createElement('p');
      empty.className = 'math-formula-picker-empty';
      empty.textContent = copy.noResults;
      results.append(empty);
      return;
    }
    formulaItems.forEach((formula) => {
      const button = createMathFormulaPickerButton('math-formula-picker-item', formula.latex);
      renderMathFormulaPickerFormula(button, formula.preview ?? formula.latex);
      button.addEventListener('click', () => insertFormula(formula));
      results.append(button);
    });
  };

  const renderActiveCategory = () => {
    const active = mathFormulaCategories.find((category) => category.id === activeCategoryId);
    if (!active) return;
    results.dataset.layout = 'groups';
    results.replaceChildren();
    active.groups.forEach((formulaGroup) => {
      const section = document.createElement('section');
      section.className = 'math-formula-picker-group';
      const label = document.createElement('h3');
      label.className = 'math-formula-picker-group-label';
      label.textContent = localizeMathFormulaName(formulaGroup);
      const grid = document.createElement('div');
      grid.className = 'math-formula-picker-grid';
      formulaGroup.items.forEach((formula) => {
        const button = createMathFormulaPickerButton('math-formula-picker-item', formula.latex);
        renderMathFormulaPickerFormula(button, formula.preview ?? formula.latex);
        button.addEventListener('click', () => insertFormula(formula));
        grid.append(button);
      });
      section.append(label, grid);
      results.append(section);
    });
  };

  const renderCategories = () => {
    categories.replaceChildren();
    mathFormulaCategories.filter((category) => category.kind === mode).forEach((category) => {
      const button = createMathFormulaPickerButton('math-formula-picker-category', localizeMathFormulaName(category));
      button.dataset.active = String(category.id === activeCategoryId);
      const formula = document.createElement('span');
      formula.className = 'math-formula-picker-category-formula';
      renderMathFormulaPickerFormula(formula, category.label);
      const name = document.createElement('span');
      name.className = 'math-formula-picker-category-name';
      name.textContent = localizeMathFormulaName(category);
      button.append(formula, name);
      button.addEventListener('click', () => {
        activeCategoryId = category.id;
        search.value = '';
        renderCategories();
        renderActiveCategory();
      });
      categories.append(button);
    });
    symbolMode.setAttribute('aria-selected', String(mode === 'symbol'));
    templateMode.setAttribute('aria-selected', String(mode === 'template'));
  };

  const setMode = (nextMode: MathFormulaCategory['kind']) => {
    mode = nextMode;
    activeCategoryId = mathFormulaCategories.find((category) => category.kind === mode)?.id ?? '';
    search.value = '';
    renderCategories();
    renderActiveCategory();
  };

  symbolMode.addEventListener('click', () => setMode('symbol'));
  templateMode.addEventListener('click', () => setMode('template'));
  searchTrigger.addEventListener('click', () => {
    searchField.hidden = false;
    searchTrigger.hidden = true;
    search.focus();
  });
  searchClose.addEventListener('click', () => {
    search.value = '';
    searchField.hidden = true;
    searchTrigger.hidden = false;
    renderActiveCategory();
    searchTrigger.focus();
  });
  search.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    searchClose.click();
  });
  search.addEventListener('input', () => {
    if (!search.value.trim()) {
      renderActiveCategory();
      return;
    }
    renderItems(searchMathFormulaItems(search.value));
  });
  clearButton.addEventListener('click', () => {
    textarea.value = '';
    textarea.focus();
    notifyInput();
  });
  lineBreakButton.addEventListener('click', () => insertFormula({ latex: '\\\\\n' }));
  textarea.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    event.preventDefault();
    if (!jumpToPlaceholder(textarea, event.shiftKey)) {
      insertMathFormulaSnippet(textarea, '  ');
      notifyInput();
    }
  });

  workspace.append(textarea, tools, header, searchRow, categories, results);
  content.prepend(workspace);
  renderCategories();
  renderActiveCategory();
}

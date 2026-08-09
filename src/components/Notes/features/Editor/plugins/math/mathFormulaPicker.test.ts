import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTextEditorPopupElements } from '../shared/textEditorPopupDom';
import { mathFormulaCategories, mathFormulaItems } from './mathFormulaCatalog';
import {
  configureMathFormulaPicker,
  insertMathFormulaSnippet,
} from './mathFormulaPicker';

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

  it('renders localized symbol and template category controls', () => {
    document.documentElement.lang = 'zh-CN';
    const elements = createTextEditorPopupElements();
    configureMathFormulaPicker(elements, vi.fn());
    document.body.append(elements.card);

    expect(document.querySelectorAll('.math-formula-picker-category')).toHaveLength(13);
    expect(document.querySelector('.math-formula-picker-heading')).toHaveTextContent('Equation');

    document.querySelector<HTMLButtonElement>('[aria-label="公式模板"]')!.click();

    expect(document.querySelectorAll('.math-formula-picker-category')).toHaveLength(10);
    expect(document.querySelector<HTMLButtonElement>('[aria-label="核心公式"]')).not.toBeNull();
  });

  it('keeps formula search collapsed until requested', () => {
    document.documentElement.lang = 'zh-CN';
    const elements = createTextEditorPopupElements();
    configureMathFormulaPicker(elements, vi.fn());
    document.body.append(elements.card);

    const trigger = document.querySelector<HTMLButtonElement>('.math-formula-picker-search-trigger')!;
    const field = document.querySelector<HTMLElement>('.math-formula-picker-search-field')!;
    const input = document.querySelector<HTMLInputElement>('.math-formula-picker-search-input')!;
    const close = document.querySelector<HTMLButtonElement>('.math-formula-picker-search-close')!;

    expect(field.hidden).toBe(true);
    trigger.click();
    expect(field.hidden).toBe(false);
    expect(trigger.hidden).toBe(true);
    expect(document.activeElement).toBe(input);

    close.click();
    expect(field.hidden).toBe(true);
    expect(trigger.hidden).toBe(false);
  });

  it('keeps the formula input above the quick insert controls', () => {
    const elements = createTextEditorPopupElements();
    configureMathFormulaPicker(elements, vi.fn());
    document.body.append(elements.card);

    const picker = document.querySelector<HTMLElement>('.math-formula-picker')!;
    expect(picker.firstElementChild).toBe(elements.textarea);
    expect(picker.children[1]).toHaveClass('math-formula-picker-tools');
  });

  it('searches the complete catalog and inserts a selected formula snippet', () => {
    document.documentElement.lang = 'en';
    const elements = createTextEditorPopupElements();
    const notifyInput = vi.fn();
    configureMathFormulaPicker(elements, notifyInput);
    document.body.append(elements.card);

    const search = document.querySelector<HTMLInputElement>('.math-formula-picker-search-input')!;
    search.value = '\\sqrt[4]';
    search.dispatchEvent(new Event('input'));
    const result = Array.from(document.querySelectorAll<HTMLButtonElement>('.math-formula-picker-item'))
      .find((button) => button.getAttribute('aria-label') === '\\sqrt[4]{}');
    expect(result).not.toBeNull();

    elements.textarea.value = 'x';
    elements.textarea.setSelectionRange(0, 1);
    result.click();

    expect(elements.textarea.value).toBe('\\sqrt[4]{x}');
    expect(notifyInput).toHaveBeenCalledTimes(1);
    expect(elements.textarea.closest('.math-formula-picker')).not.toBeNull();
  });

  it('matches common Chinese formula search terms', () => {
    document.documentElement.lang = 'zh-CN';
    const elements = createTextEditorPopupElements();
    configureMathFormulaPicker(elements, vi.fn());
    document.body.append(elements.card);

    const search = document.querySelector<HTMLInputElement>('.math-formula-picker-search-input')!;
    search.value = '勾股定理';
    search.dispatchEvent(new Event('input'));

    expect(Array.from(document.querySelectorAll<HTMLButtonElement>('.math-formula-picker-item'))
      .some((button) => button.getAttribute('aria-label') === 'a^2+b^2=c^2')).toBe(true);
  });

  it('places the caret in the next empty group after wrapping a selection', () => {
    const textarea = document.createElement('textarea');
    textarea.value = 'selected';
    textarea.setSelectionRange(0, textarea.value.length);

    insertMathFormulaSnippet(textarea, '\\frac{}{}');

    expect(textarea.value).toBe('\\frac{selected}{}');
    expect(textarea.selectionStart).toBe(textarea.value.indexOf('{}') + 1);
    expect(textarea.selectionEnd).toBe(textarea.selectionStart);
  });
});

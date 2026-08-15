import { describe, expect, it } from 'vitest';
import {
  insertMathFormulaSnippet,
  jumpToMathFormulaPlaceholder,
} from './mathFormulaPickerInput';

describe('mathFormulaPickerInput', () => {
  it('places the caret in the next empty group after wrapping a selection', () => {
    const textarea = document.createElement('textarea');
    textarea.value = 'selected';
    textarea.setSelectionRange(0, textarea.value.length);

    insertMathFormulaSnippet(textarea, '\\frac{}{}');

    expect(textarea.value).toBe('\\frac{selected}{}');
    expect(textarea.selectionStart).toBe(textarea.value.indexOf('{}') + 1);
    expect(textarea.selectionEnd).toBe(textarea.selectionStart);
  });

  it('moves between empty formula placeholders', () => {
    const textarea = document.createElement('textarea');
    textarea.value = '\\frac{}{}+x';
    textarea.setSelectionRange(0, 0);

    expect(jumpToMathFormulaPlaceholder(textarea, false)).toBe(true);
    expect(textarea.selectionStart).toBe(textarea.value.indexOf('{}') + 1);
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    expect(jumpToMathFormulaPlaceholder(textarea, true)).toBe(true);
    expect(textarea.selectionStart).toBe(textarea.value.lastIndexOf('{}') + 1);
  });
});

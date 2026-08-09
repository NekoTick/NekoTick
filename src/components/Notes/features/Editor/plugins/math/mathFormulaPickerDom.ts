import { themeIconTokens } from '@/styles/themeTokens';
import { renderLatex } from './katex';

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

export function renderMathFormulaPickerFormula(
  element: HTMLElement,
  latex: string,
  displayMode = false,
) {
  const result = renderLatex(latex, displayMode);
  element.innerHTML = result.html;
  element.classList.toggle('math-formula-picker-render-error', Boolean(result.error));
  return result;
}

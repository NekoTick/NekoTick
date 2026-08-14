import katex from 'katex';
import 'katex/contrib/mhchem';
import { translate } from '@/lib/i18n';
import { createKatexRenderOptions } from './katexOptions';
import { removeKatexSourceAnnotationsFromHtml } from './katexSourceSanitizer';

export const MAX_LATEX_CHARS = 10000;
const MAX_RENDER_CACHE_ENTRIES = 500;
const successfulRenderCache = new Map<string, RenderResult>();
type MathRenderOutput = 'htmlAndMathml' | 'html';

function escapeHtmlText(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderMathErrorHtml() {
  return `<span class="math-error">${escapeHtmlText(translate('editor.errorEquation'))}</span>`;
}

export interface MathRenderErrorDetails {
  rawMessage: string;
  summary: string;
  position: number | null;
  line: number | null;
  column: number | null;
  locationLabel: string | null;
  context: string | null;
  pointer: string | null;
}

export interface RenderResult {
  html: string;
  error: string | null;
  errorDetails: MathRenderErrorDetails | null;
}

function createRenderCacheKey(
  latex: string,
  displayMode: boolean,
  output: MathRenderOutput,
) {
  return `${displayMode ? 'block' : 'inline'}\u0000${output}\u0000${latex}`;
}

function readCachedRenderResult(
  latex: string,
  displayMode: boolean,
  output: MathRenderOutput,
) {
  const key = createRenderCacheKey(latex, displayMode, output);
  const cached = successfulRenderCache.get(key);
  if (!cached) return null;

  successfulRenderCache.delete(key);
  successfulRenderCache.set(key, cached);
  return cached;
}

function cacheSuccessfulRenderResult(
  latex: string,
  displayMode: boolean,
  output: MathRenderOutput,
  result: RenderResult,
) {
  if (result.error !== null) return result;

  successfulRenderCache.set(createRenderCacheKey(latex, displayMode, output), result);
  while (successfulRenderCache.size > MAX_RENDER_CACHE_ENTRIES) {
    const oldestKey = successfulRenderCache.keys().next().value;
    if (typeof oldestKey !== 'string') break;
    successfulRenderCache.delete(oldestKey);
  }
  return result;
}

function extractKatexErrorSummary(message: string) {
  const normalized = message.replace(/^KaTeX parse error:\s*/i, '');
  const positionIndex = normalized.indexOf(' at position ');
  return (positionIndex >= 0 ? normalized.slice(0, positionIndex) : normalized).trim();
}

function resolveErrorLocation(latex: string, position: number | null) {
  if (!latex || position == null) {
    return { line: null, column: null, lineText: null };
  }

  const zeroBasedIndex = Math.max(0, Math.min(latex.length - 1, position - 1));
  let line = 1;
  let column = 1;
  let lineStart = 0;

  for (let index = 0; index < zeroBasedIndex; index += 1) {
    const char = latex[index];
    if (char === '\r') {
      if (latex[index + 1] === '\n') continue;
      line += 1;
      column = 1;
      lineStart = index + 1;
    } else if (char === '\n') {
      line += 1;
      column = 1;
      lineStart = index + 1;
    } else {
      column += 1;
    }
  }

  let lineEnd = latex.length;
  for (let index = lineStart; index < latex.length; index += 1) {
    if (latex[index] === '\r' || latex[index] === '\n') {
      lineEnd = index;
      break;
    }
  }

  return { line, column, lineText: latex.slice(lineStart, lineEnd) };
}

export function parseMathRenderError(
  message: string,
  latex: string,
): MathRenderErrorDetails {
  const positionMatch = message.match(/ at position (\d+)/i);
  const position = positionMatch ? Number.parseInt(positionMatch[1], 10) : null;
  const summary = extractKatexErrorSummary(message);
  const location = resolveErrorLocation(latex, position);
  const gutter = location.line == null ? null : `${location.line} | `;
  const context = gutter == null || location.lineText == null
    ? null
    : `${gutter}${location.lineText}`;
  const pointer = gutter == null || location.column == null
    ? null
    : `${' '.repeat(gutter.length + location.column - 1)}^`;

  return {
    rawMessage: message,
    summary,
    position,
    line: location.line,
    column: location.column,
    locationLabel: location.line == null || location.column == null
      ? null
      : `Line ${location.line}, column ${location.column}`,
    context,
    pointer,
  };
}

function oversizedRenderResult(): RenderResult {
  const message = 'Equation is too large to render';
  return {
    html: renderMathErrorHtml(),
    error: message,
    errorDetails: {
      rawMessage: message,
      summary: message,
      position: null,
      line: null,
      column: null,
      locationLabel: null,
      context: null,
      pointer: null,
    },
  };
}

export function renderLatexUncached(
  latex: string,
  displayMode: boolean,
  output: MathRenderOutput = 'htmlAndMathml',
): RenderResult {
  if (!latex.trim()) {
    return {
      html: '<span class="math-empty" aria-hidden="true">\u200b</span>',
      error: null,
      errorDetails: null,
    };
  }
  if (latex.length > MAX_LATEX_CHARS) return oversizedRenderResult();

  try {
    const html = removeKatexSourceAnnotationsFromHtml(katex.renderToString(latex, {
      ...createKatexRenderOptions(),
      displayMode,
      output,
      throwOnError: true,
    }));
    return {
      html,
      error: null,
      errorDetails: null,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorDetails = parseMathRenderError(errorMessage, latex);
    return {
      html: renderMathErrorHtml(),
      error: errorDetails.summary,
      errorDetails,
    };
  }
}

export function renderLatex(
  latex: string,
  displayMode: boolean,
  output: MathRenderOutput = 'htmlAndMathml',
): RenderResult {
  const cached = readCachedRenderResult(latex, displayMode, output);
  if (cached) return cached;

  return cacheSuccessfulRenderResult(
    latex,
    displayMode,
    output,
    renderLatexUncached(latex, displayMode, output),
  );
}

export function isValidLatex(latex: string): boolean {
  if (!latex.trim()) return true;
  if (latex.length > MAX_LATEX_CHARS) return false;

  try {
    katex.renderToString(latex, {
      ...createKatexRenderOptions(),
      displayMode: true,
      throwOnError: true,
    });
    return true;
  } catch {
    return false;
  }
}

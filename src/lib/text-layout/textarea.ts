import {
  layout,
  measureNaturalWidth,
  prepare,
  prepareWithSegments,
  walkLineRanges,
  type PrepareOptions,
  type PreparedText,
  type PreparedTextWithSegments,
} from './pretext/layout';
import { APP_SANS_FONT_FAMILY } from '@/lib/typography/fontFamilies';

export interface TextLayoutMetrics {
  font: string;
  lineHeight: number;
}

export interface ElementTextLayoutMetrics extends TextLayoutMetrics {
  fontSize: number;
  paddingBlock: number;
}

export interface TextBlockMeasureOptions extends TextLayoutMetrics {
  maxHeight?: number;
  minHeight?: number;
  prepareOptions?: PrepareOptions;
}

export interface TextWrapStats {
  lineCount: number;
  maxLineWidth: number;
}

const PREPARED_CACHE_LIMIT = 500;
export const PREPARED_TEXT_CACHE_CHAR_BUDGET = 64 * 1024;
const DEFAULT_FONT_FAMILY = APP_SANS_FONT_FAMILY;
const DEFAULT_FONT_SIZE = 15;
const DEFAULT_LINE_HEIGHT_RATIO = 1.6;

class PreparedTextCache<T> {
  private entries = new Map<string, { prepared: T; textLength: number }>();
  private textChars = 0;

  get(cacheKey: string): T | undefined {
    const entry = this.entries.get(cacheKey);
    if (!entry) {
      return undefined;
    }

    this.entries.delete(cacheKey);
    this.entries.set(cacheKey, entry);
    return entry.prepared;
  }

  set(cacheKey: string, prepared: T, textLength: number): void {
    if (textLength > PREPARED_TEXT_CACHE_CHAR_BUDGET) {
      return;
    }

    const existing = this.entries.get(cacheKey);
    if (existing) {
      this.textChars -= existing.textLength;
      this.entries.delete(cacheKey);
    }
    while (
      this.entries.size >= PREPARED_CACHE_LIMIT
      || this.textChars + textLength > PREPARED_TEXT_CACHE_CHAR_BUDGET
    ) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }
      const oldest = this.entries.get(oldestKey);
      if (oldest) {
        this.textChars -= oldest.textLength;
      }
      this.entries.delete(oldestKey);
    }

    this.entries.set(cacheKey, { prepared, textLength });
    this.textChars += textLength;
  }

  clear(): void {
    this.entries.clear();
    this.textChars = 0;
  }

  getStats(): { entries: number; textChars: number } {
    return { entries: this.entries.size, textChars: this.textChars };
  }
}

const preparedCache = new PreparedTextCache<PreparedText>();
const preparedSegmentsCache = new PreparedTextCache<PreparedTextWithSegments>();

export function clearPreparedTextCachesForTests(): void {
  preparedCache.clear();
  preparedSegmentsCache.clear();
}

export function getPreparedTextCacheStatsForTests() {
  return {
    prepared: preparedCache.getStats(),
    preparedSegments: preparedSegmentsCache.getStats(),
  };
}

function getPreparedText(
  text: string,
  font: string,
  options: PrepareOptions | undefined,
): PreparedText {
  if (text.length > PREPARED_TEXT_CACHE_CHAR_BUDGET) {
    return prepare(text, font, options);
  }
  const whiteSpace = options?.whiteSpace ?? 'normal';
  const wordBreak = options?.wordBreak ?? 'normal';
  const letterSpacing = options?.letterSpacing ?? 0;
  const cacheKey = `${font}\u0000${whiteSpace}\u0000${wordBreak}\u0000${letterSpacing}\u0000${text}`;
  const cached = preparedCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const prepared = prepare(text, font, options);
  preparedCache.set(cacheKey, prepared, text.length);
  return prepared;
}

function getPreparedTextWithSegments(
  text: string,
  font: string,
  options: PrepareOptions | undefined,
): PreparedTextWithSegments {
  if (text.length > PREPARED_TEXT_CACHE_CHAR_BUDGET) {
    return prepareWithSegments(text, font, options);
  }
  const whiteSpace = options?.whiteSpace ?? 'normal';
  const wordBreak = options?.wordBreak ?? 'normal';
  const letterSpacing = options?.letterSpacing ?? 0;
  const cacheKey = `${font}\u0000${whiteSpace}\u0000${wordBreak}\u0000${letterSpacing}\u0000${text}`;
  const cached = preparedSegmentsCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const prepared = prepareWithSegments(text, font, options);
  preparedSegmentsCache.set(cacheKey, prepared, text.length);
  return prepared;
}

function clampHeight(height: number, minHeight?: number, maxHeight?: number): number {
  const min = minHeight ?? 0;
  const max = maxHeight ?? Number.POSITIVE_INFINITY;
  return Math.max(min, Math.min(max, height));
}

function parsePixelValue(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function resolveElementTextLayoutMetrics(element: HTMLElement): ElementTextLayoutMetrics {
  const styles = window.getComputedStyle(element);
  const fontSize = parsePixelValue(styles.fontSize) ?? DEFAULT_FONT_SIZE;
  const lineHeight =
    parsePixelValue(styles.lineHeight) ?? Math.round(fontSize * DEFAULT_LINE_HEIGHT_RATIO);
  const paddingTop = parsePixelValue(styles.paddingTop) ?? 0;
  const paddingBottom = parsePixelValue(styles.paddingBottom) ?? 0;
  const fontStyle = styles.fontStyle || 'normal';
  const fontWeight = styles.fontWeight || '400';
  const fontSizeToken = `${fontSize}px`;
  const fontFamily = styles.fontFamily || DEFAULT_FONT_FAMILY;

  return {
    font: `${fontStyle} ${fontWeight} ${fontSizeToken} ${fontFamily}`,
    fontSize,
    lineHeight,
    paddingBlock: paddingTop + paddingBottom,
  };
}

export function measureTextareaContentHeight(
  text: string,
  width: number,
  options: TextBlockMeasureOptions,
): number {
  const hasTrailingEmptyLine = text.endsWith('\n');
  const measuredHeight = measureTextBlockHeight(text, width, {
    ...options,
    prepareOptions: {
      whiteSpace: 'pre-wrap',
      ...options.prepareOptions,
    },
  });

  if (!hasTrailingEmptyLine) {
    return measuredHeight;
  }

  const lineHeight = Math.max(1, options.lineHeight);
  return clampHeight(
    measuredHeight + lineHeight,
    options.minHeight,
    options.maxHeight,
  );
}

export function measureTextBlockHeight(
  text: string,
  width: number,
  options: TextBlockMeasureOptions,
): number {
  const safeWidth = Math.max(1, Math.floor(width));
  const safeLineHeight = Math.max(1, options.lineHeight);
  const prepared = getPreparedText(text, options.font, {
    ...options.prepareOptions,
  });
  const result = layout(prepared, safeWidth, safeLineHeight);
  const intrinsicHeight = Math.max(result.lineCount, 1) * safeLineHeight;
  return clampHeight(Math.ceil(intrinsicHeight), options.minHeight, options.maxHeight);
}

export function measureTextLineCount(
  text: string,
  width: number,
  options: TextBlockMeasureOptions,
): number {
  const safeWidth = Math.max(1, Math.floor(width));
  const safeLineHeight = Math.max(1, options.lineHeight);
  const prepared = getPreparedText(text, options.font, {
    ...options.prepareOptions,
  });
  return layout(prepared, safeWidth, safeLineHeight).lineCount;
}

export function measureTextWrapStats(
  text: string,
  width: number,
  options: Pick<TextBlockMeasureOptions, 'font' | 'prepareOptions'>,
): TextWrapStats {
  const safeWidth = Math.max(1, Math.floor(width));
  const prepared = getPreparedTextWithSegments(text, options.font, {
    ...options.prepareOptions,
  });
  let maxLineWidth = 0;
  const lineCount = walkLineRanges(prepared, safeWidth, (line) => {
    if (line.width > maxLineWidth) {
      maxLineWidth = line.width;
    }
  });

  return { lineCount, maxLineWidth };
}

export function measureTextNaturalWidth(
  text: string,
  {
    font,
    prepareOptions,
  }: Pick<TextBlockMeasureOptions, 'font' | 'prepareOptions'>,
): number {
  const prepared = getPreparedTextWithSegments(text, font, {
    ...prepareOptions,
  });
  return Math.max(0, Math.ceil(measureNaturalWidth(prepared)));
}

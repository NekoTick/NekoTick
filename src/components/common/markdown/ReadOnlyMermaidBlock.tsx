import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import {
  generateMermaidId,
  MAX_MERMAID_CODE_CHARS,
  mermaidRenderErrorMarkup,
  renderMermaid as renderMermaidMarkup,
} from './mermaidRenderer';
import { getMermaidDiagramType } from './mermaidDiagramType';
import { sanitizeMermaidMarkup } from './mermaidSanitizer';
import { containsExternalSvgStyleElementReference } from '@/lib/markdown/svgResourceReferences';
import { decodeCssEscapesForUrl } from '@/lib/markdown/theme-compatibility/cssUrls/cssEscapes';

const READONLY_MERMAID_RENDER_CACHE_LIMIT = 80;
export const MAX_PENDING_READONLY_MERMAID_RENDERS = 80;
const readOnlyMermaidMarkupCache = new Map<string, string>();
const readOnlyMermaidRenderPromiseCache = new Map<string, Promise<string>>();
const REMOTE_MERMAID_SCHEME_PATTERN = /(?:https?|file|ftp|blob):/i;
const PROTOCOL_RELATIVE_MERMAID_URL_PATTERN = /(?:^|[\s"'([{=,:])\/\/(?:[A-Za-z0-9]|\[)/m;

function decodeAsciiCodePoint(value: string, radix: number): string {
  const codePoint = Number.parseInt(value, radix);
  return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x7f
    ? String.fromCharCode(codePoint)
    : '';
}

function normalizeMermaidResourceScanText(code: string): string {
  const decodedCode = code
    .replace(/\\u\{([0-9a-f]{1,6})\}/gi, (_match, value: string) => decodeAsciiCodePoint(value, 16))
    .replace(/\\u([0-9a-f]{4})/gi, (_match, value: string) => decodeAsciiCodePoint(value, 16))
    .replace(/\\x([0-9a-f]{2})/gi, (_match, value: string) => decodeAsciiCodePoint(value, 16))
    .replace(/&#x([0-9a-f]{1,6});?/gi, (_match, value: string) => decodeAsciiCodePoint(value, 16))
    .replace(/&#([0-9]{1,7});?/g, (_match, value: string) => decodeAsciiCodePoint(value, 10))
    .replace(/&colon;/gi, ':')
    .replace(/&sol;/gi, '/');

  return decodeCssEscapesForUrl(decodedCode)
    .replace(/[\u0000-\u0020\u007f]/g, '');
}

function containsRemoteMermaidResource(code: string): boolean {
  const normalized = normalizeMermaidResourceScanText(code);
  return REMOTE_MERMAID_SCHEME_PATTERN.test(normalized)
    || PROTOCOL_RELATIVE_MERMAID_URL_PATTERN.test(normalized)
    || containsExternalSvgStyleElementReference(normalized);
}

function getReadOnlyMermaidCacheKey(code: string, language: string) {
  return `${language}\0${code}`;
}

function readCachedReadOnlyMermaidMarkup(cacheKey: string) {
  const cached = readOnlyMermaidMarkupCache.get(cacheKey);
  if (cached == null) {
    return null;
  }

  readOnlyMermaidMarkupCache.delete(cacheKey);
  readOnlyMermaidMarkupCache.set(cacheKey, cached);
  return cached;
}

function cacheReadOnlyMermaidMarkup(cacheKey: string, markup: string) {
  readOnlyMermaidMarkupCache.set(cacheKey, markup);
  while (readOnlyMermaidMarkupCache.size > READONLY_MERMAID_RENDER_CACHE_LIMIT) {
    const oldestKey = readOnlyMermaidMarkupCache.keys().next().value;
    if (typeof oldestKey !== 'string') {
      break;
    }
    readOnlyMermaidMarkupCache.delete(oldestKey);
  }
  return markup;
}

export function clearReadOnlyMermaidRenderCaches() {
  readOnlyMermaidMarkupCache.clear();
  readOnlyMermaidRenderPromiseCache.clear();
}

export function getPendingReadOnlyMermaidRenderCount() {
  return readOnlyMermaidRenderPromiseCache.size;
}

export async function resolveReadOnlyMermaidMarkup(code: string, language = '') {
  if (code.length > MAX_MERMAID_CODE_CHARS || containsRemoteMermaidResource(code)) {
    return sanitizeMermaidMarkup(mermaidRenderErrorMarkup());
  }

  const cacheKey = getReadOnlyMermaidCacheKey(code, language);
  const cached = readCachedReadOnlyMermaidMarkup(cacheKey);
  if (cached != null) {
    return cached;
  }

  const existingPromise = readOnlyMermaidRenderPromiseCache.get(cacheKey);
  if (existingPromise) {
    return existingPromise;
  }
  if (readOnlyMermaidRenderPromiseCache.size >= MAX_PENDING_READONLY_MERMAID_RENDERS) {
    return sanitizeMermaidMarkup(mermaidRenderErrorMarkup());
  }

  const promise = renderReadOnlyMermaid(code)
    .then((markup) => cacheReadOnlyMermaidMarkup(cacheKey, markup))
    .finally(() => {
      readOnlyMermaidRenderPromiseCache.delete(cacheKey);
    });
  readOnlyMermaidRenderPromiseCache.set(cacheKey, promise);
  return promise;
}

async function renderReadOnlyMermaid(code: string) {
  try {
    const markup = await renderMermaidMarkup(code, generateMermaidId());
    return sanitizeMermaidMarkup(markup);
  } catch {
    return sanitizeMermaidMarkup(mermaidRenderErrorMarkup());
  }
}

interface ReadOnlyMermaidBlockProps {
  code: string;
}

export function ReadOnlyMermaidBlock({ code }: ReadOnlyMermaidBlockProps) {
  const { language, t } = useI18n();
  const normalizedCode = useMemo(() => code.trim(), [code]);
  const diagramType = useMemo(() => getMermaidDiagramType(normalizedCode), [normalizedCode]);
  const [markup, setMarkup] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setMarkup(null);
    setFailed(false);
    if (!normalizedCode) {
      return;
    }

    void resolveReadOnlyMermaidMarkup(normalizedCode, language).then((nextMarkup) => {
      if (cancelled) return;
      if (!nextMarkup) {
        setFailed(true);
        return;
      }
      setMarkup(nextMarkup);
    }).catch(() => {
      if (!cancelled) {
        setFailed(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [language, normalizedCode]);

  if (!normalizedCode) {
    return (
      <div
        className="mermaid-block mermaid-empty"
        data-type="mermaid"
        data-chat-selection-excluded="true"
        aria-hidden="true"
      >
        {'\u200b'}
      </div>
    );
  }

  if (failed) {
    return (
      <div
        className="mermaid-block mermaid-error"
        data-mermaid-diagram={diagramType ?? undefined}
        data-type="mermaid"
        data-chat-selection-excluded="true"
      >
        {t('editor.mermaidRenderError')}
      </div>
    );
  }

  if (!markup) {
    return (
      <div
        className="mermaid-block"
        data-mermaid-diagram={diagramType ?? undefined}
        data-type="mermaid"
        data-chat-selection-excluded="true"
      >
        <div className="mermaid-placeholder">{t('editor.mermaidPlaceholder')}</div>
      </div>
    );
  }

  return (
    <div
      className="mermaid-block"
      data-mermaid-diagram={diagramType ?? undefined}
      data-type="mermaid"
      data-chat-selection-excluded="true"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}

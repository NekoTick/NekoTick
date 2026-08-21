import { useEffect, useMemo, useRef, useState } from 'react';
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
import {
  clearMermaidMarkupCache,
  getPendingMermaidMarkupCount,
  releaseMermaidMarkupConsumer,
  resolveCachedMermaidMarkup,
} from './mermaidMarkupCache';
import {
  getActiveMermaidRenderCount,
  MAX_BACKGROUND_CONCURRENT_MERMAID_RENDERS,
  type MermaidRenderPriority,
  waitForMermaidInteractionIdle,
} from './mermaidRenderScheduler';
import { themeLazyLoadTokens } from '@/styles/themeTokens';

const READONLY_MERMAID_RENDER_GROUP = 'readonly';
export const MAX_CONCURRENT_READONLY_MERMAID_RENDERS =
  MAX_BACKGROUND_CONCURRENT_MERMAID_RENDERS;
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

export function clearReadOnlyMermaidRenderCaches() {
  clearMermaidMarkupCache();
}

export function getPendingReadOnlyMermaidRenderCount() {
  return getPendingMermaidMarkupCount();
}

export function getActiveReadOnlyMermaidRenderCount() {
  return getActiveMermaidRenderCount(READONLY_MERMAID_RENDER_GROUP);
}

export async function resolveReadOnlyMermaidMarkup(
  code: string,
  language = '',
  consumer?: object,
  priority: MermaidRenderPriority = 'background',
) {
  if (code.length > MAX_MERMAID_CODE_CHARS || containsRemoteMermaidResource(code)) {
    return sanitizeMermaidMarkup(mermaidRenderErrorMarkup());
  }

  const cacheKey = getReadOnlyMermaidCacheKey(code, language);
  return resolveCachedMermaidMarkup({
    cacheKey,
    consumer,
    group: READONLY_MERMAID_RENDER_GROUP,
    priority,
    render: () => renderReadOnlyMermaid(code, priority),
  });
}

async function renderReadOnlyMermaid(code: string, priority: MermaidRenderPriority) {
  try {
    const markup = await renderMermaidMarkup(code, generateMermaidId(), priority);
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
  const renderConsumer = useMemo(() => ({}), []);
  const blockRef = useRef<HTMLDivElement>(null);
  const canObserveViewport = typeof window !== 'undefined'
    && typeof IntersectionObserver !== 'undefined';
  const [renderPriority, setRenderPriority] = useState<MermaidRenderPriority>('background');
  const [isNearViewport, setIsNearViewport] = useState(() => !canObserveViewport);
  const [markup, setMarkup] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setMarkup(null);
    setFailed(false);
    setRenderPriority('background');
    setIsNearViewport(!canObserveViewport);
  }, [canObserveViewport, language, normalizedCode]);

  useEffect(() => {
    let cancelled = false;
    if (!normalizedCode || !isNearViewport || markup || failed) {
      return;
    }

    void resolveReadOnlyMermaidMarkup(
      normalizedCode,
      language,
      renderConsumer,
      renderPriority,
    ).then(async (nextMarkup) => {
      await waitForMermaidInteractionIdle(renderPriority);
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
      releaseMermaidMarkupConsumer(renderConsumer);
    };
  }, [failed, isNearViewport, language, markup, normalizedCode, renderConsumer, renderPriority]);

  useEffect(() => {
    const block = blockRef.current;
    if (
      !block
      || !normalizedCode
      || markup
      || failed
      || typeof IntersectionObserver === 'undefined'
    ) {
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      const entry = entries.find((candidate) => candidate.target === block) ?? entries.at(-1);
      const isIntersecting = entry?.isIntersecting ?? false;
      if (isIntersecting) setRenderPriority('interactive');
      setIsNearViewport(isIntersecting);
    }, {
      scrollMargin: themeLazyLoadTokens.mermaidPreloadMargin,
    });
    observer.observe(block);
    return () => observer.disconnect();
  }, [failed, markup, normalizedCode]);

  if (!normalizedCode) {
    return (
      <div
        ref={blockRef}
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
        ref={blockRef}
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
        ref={blockRef}
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
      ref={blockRef}
      className="mermaid-block"
      data-mermaid-diagram={diagramType ?? undefined}
      data-type="mermaid"
      data-chat-selection-excluded="true"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}

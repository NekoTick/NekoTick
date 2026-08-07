import { Icon } from '@/components/ui/icons';
import { raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';
import { sanitizeWebSearchSourceUrl } from '@/lib/ai/webSearch/statusMarkup';
import type { WebSearchStatus } from '@/lib/ai/webSearch/types';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { getExternalLinkProps } from '@/lib/navigation/externalLinks';
import { cn } from '@/lib/utils';
import { themeIconTokens } from '@/styles/themeTokens';

interface WebSearchStatusBlockProps {
  statuses: WebSearchStatus[];
  isWaitingForAnswer?: boolean;
}

type Translate = (key: MessageKey) => string;

const NO_RELEVANT_RESULTS_MESSAGE = 'No relevant results were found.';

const WEB_SEARCH_MESSAGE_KEYS: Record<string, MessageKey> = {
  [NO_RELEVANT_RESULTS_MESSAGE]: 'chat.webSearch.noRelevantResults',
  'Unable to read this page.': 'chat.webSearch.unableToReadPage',
  'This source is blocked by the web search source policy.': 'chat.webSearch.blockedSource',
  'The page blocked automated reading.': 'chat.webSearch.blockedPage',
  'The page did not expose enough readable content.': 'chat.webSearch.contentTooShort',
  'The page request timed out.': 'chat.webSearch.pageTimedOut',
  'The page could not be reached.': 'chat.webSearch.pageUnreachable',
  'The page returned an HTTP error.': 'chat.webSearch.pageHttpError',
  'Web search is temporarily unavailable.': 'chat.webSearch.unavailable',
  'The monthly web search quota has been used.': 'chat.webSearch.quotaExceeded',
  'The web search quota has been used.': 'chat.webSearch.quotaExceeded',
  'Only URLs returned by the current web search can be read.': 'chat.webSearch.blockedSource',
  'New searches are not allowed after page reading has started.': 'chat.webSearch.unavailable',
  'The search request budget was exhausted.': 'chat.webSearch.unavailable',
  'The page reading budget was exhausted.': 'chat.webSearch.unavailable',
  'The web search tool budget was exhausted.': 'chat.webSearch.unavailable',
  'Sensitive values cannot be sent to web search.': 'chat.webSearch.unavailable',
};

function phaseLabel(status: WebSearchStatus, t: Translate): string {
  if (status.phase === 'searching') return t('chat.webSearch.searching');
  if (status.phase === 'results') return t('chat.webSearch.results');
  if (status.phase === 'reading') return t('chat.webSearch.reading');
  if (status.phase === 'complete') return t('chat.webSearch.complete');
  return t('chat.webSearch');
}

function localizeWebSearchMessage(message: string, t: Translate): string {
  const key = WEB_SEARCH_MESSAGE_KEYS[message];
  return key ? t(key) : message;
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function uniqueSourceItems(
  results: NonNullable<WebSearchStatus['results']>,
  urls: string[],
): Array<{ url: string; label: string; detail?: string }> {
  const seen = new Set<string>();
  const items: Array<{ url: string; label: string; detail?: string }> = [];

  for (const result of results) {
    const url = sanitizeWebSearchSourceUrl(result.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    items.push({
      url,
      label: result.title?.trim() || hostLabel(url),
      detail: url,
    });
  }

  for (const rawUrl of urls) {
    const url = sanitizeWebSearchSourceUrl(rawUrl);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    items.push({ url, label: hostLabel(url), detail: url });
  }

  return items;
}

function sourceItemsFromStatuses(statuses: WebSearchStatus[]): Array<{ url: string; label: string; detail?: string }> {
  const titleByUrl = new Map<string, string>();

  for (const status of statuses) {
    for (const result of status.results ?? []) {
      if (!titleByUrl.has(result.url) && result.title?.trim()) {
        titleByUrl.set(result.url, result.title.trim());
      }
    }
  }

  const latestStatus = statuses[statuses.length - 1];
  const urls = latestStatus?.phase === 'results'
    ? (latestStatus.results ?? []).map((result) => result.url)
    : latestStatus?.phase === 'complete'
      ? statuses
          .filter((status) => status.phase === 'complete')
          .flatMap((status) => status.urls ?? [])
      : latestStatus?.urls ?? [];

  return uniqueSourceItems(
    urls.map((url) => ({
      url,
      title: titleByUrl.get(url) || hostLabel(url),
      snippet: '',
      publishedAt: null,
    })),
    urls,
  );
}

function shouldShowStatusMessage(status: WebSearchStatus): boolean {
  if (!status.message) return false;
  if (status.phase === 'error' && status.message === NO_RELEVANT_RESULTS_MESSAGE) return false;
  return true;
}

export function WebSearchStatusBlock({ statuses, isWaitingForAnswer = false }: WebSearchStatusBlockProps) {
  const { t } = useI18n();
  const status = statuses[statuses.length - 1];
  if (!status) return null;
  const isSearching = isWaitingForAnswer;
  const showStatusMessage = shouldShowStatusMessage(status);
  const sourceItems = sourceItemsFromStatuses(statuses);
  const failedSources = (status.failedSources ?? [])
    .map((source) => {
      const url = sanitizeWebSearchSourceUrl(source.url);
      return url ? { ...source, url } : null;
    })
    .filter((source): source is NonNullable<typeof source> => Boolean(source));
  const shouldShowFailedSources = sourceItems.length === 0 && failedSources.length > 0;

  return (
    <div
      data-chat-selection-excluded="true"
      className={cn(
        'mb-3 max-w-full select-none rounded-[var(--vlaina-ui-radius-group)] px-3 py-2 text-[var(--vlaina-font-xs)] text-[var(--vlaina-text-secondary)]',
        raisedPillSurfaceClass,
      )}
    >
      <div className="flex items-center gap-2 font-medium text-[var(--vlaina-text-primary)]">
        <span className="relative flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--vlaina-accent-light)] text-[var(--vlaina-accent)]">
          {isSearching && (
            <span
              aria-hidden="true"
              className="absolute inset-0 rounded-full border border-transparent border-t-[var(--vlaina-accent)] animate-spin"
            />
          )}
          <Icon name="file.public" size={themeIconTokens.sizeSm} />
        </span>
        <span>{phaseLabel(status, t)}</span>
        {status.query && <span className="min-w-0 truncate text-[var(--vlaina-text-tertiary)]">"{status.query}"</span>}
      </div>

      {showStatusMessage && (
        <div className="mt-1 text-[var(--vlaina-text-tertiary)]">{localizeWebSearchMessage(status.message ?? '', t)}</div>
      )}

      {sourceItems.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {sourceItems.slice(0, 6).map((source) => {
            return (
              <a
                key={source.url}
                {...getExternalLinkProps(source.url)}
                className="inline-flex h-7 max-w-[var(--vlaina-size-220px)] cursor-pointer items-center gap-1.5 rounded-full bg-[var(--vlaina-accent-light)] px-2.5 text-[var(--vlaina-font-xs)] font-medium !text-[var(--vlaina-accent-hover)] transition-opacity hover:opacity-[var(--vlaina-opacity-80)]"
              >
                <span className="min-w-0 truncate">{source.label}</span>
                {source.detail && source.detail !== source.label && (
                  <span className="sr-only">{source.detail}</span>
                )}
                <Icon name="nav.external" size={themeIconTokens.sizeXs} />
              </a>
            );
          })}
        </div>
      )}

      {shouldShowFailedSources && (
        <div className="mt-2 space-y-1 text-[var(--vlaina-text-tertiary)]">
          <div className="font-medium text-[var(--vlaina-text-secondary)]">{t('chat.skippedSources')}</div>
          {failedSources.slice(0, 4).map((source) => (
            <div key={source.url} className="flex min-w-0 gap-2">
              <span className="shrink-0">{localizeWebSearchMessage(source.message, t)}</span>
              <span className="min-w-0 truncate">{source.url}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

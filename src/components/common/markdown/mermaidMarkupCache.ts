import {
  scheduleMermaidRenderTask,
  type MermaidRenderPriority,
  type MermaidRenderTask,
} from './mermaidRenderScheduler';

const MERMAID_MARKUP_CACHE_LIMIT = 80;
const markupCache = new Map<string, string>();
type PendingMermaidMarkup = {
  consumers: Set<object>;
  hasUnscopedConsumer: boolean;
  promise: Promise<string>;
  task: MermaidRenderTask<string>;
};
const pendingMarkup = new Map<string, PendingMermaidMarkup>();
let cacheEpoch = 0;

function isErrorMarkup(markup: string) {
  return /class=(["'])[^"']*\bmermaid-error\b[^"']*\1/.test(markup);
}

export function readCachedMermaidMarkup(cacheKey: string) {
  const cached = markupCache.get(cacheKey);
  if (cached == null) return null;
  markupCache.delete(cacheKey);
  markupCache.set(cacheKey, cached);
  return cached;
}

function cacheMarkup(cacheKey: string, markup: string) {
  if (!markup || isErrorMarkup(markup)) return markup;
  markupCache.set(cacheKey, markup);
  while (markupCache.size > MERMAID_MARKUP_CACHE_LIMIT) {
    const oldestKey = markupCache.keys().next().value;
    if (typeof oldestKey !== 'string') break;
    markupCache.delete(oldestKey);
  }
  return markup;
}

export function resolveCachedMermaidMarkup(args: {
  cacheKey: string;
  consumer?: object;
  group: string;
  priority: MermaidRenderPriority;
  render: () => Promise<string>;
}) {
  const cached = readCachedMermaidMarkup(args.cacheKey);
  if (cached != null) return Promise.resolve(cached);

  const existing = pendingMarkup.get(args.cacheKey);
  if (existing) {
    if (args.consumer) existing.consumers.add(args.consumer);
    else existing.hasUnscopedConsumer = true;
    if (args.priority === 'interactive') existing.task.promote();
    return existing.promise;
  }

  const epoch = cacheEpoch;
  const task = scheduleMermaidRenderTask({
    cancelledValue: '',
    group: args.group,
    priority: args.priority,
    render: args.render,
  });
  let pending: PendingMermaidMarkup;
  const promise = task.promise
    .then((markup) => epoch === cacheEpoch ? cacheMarkup(args.cacheKey, markup) : markup)
    .finally(() => {
      if (pendingMarkup.get(args.cacheKey) === pending) {
        pendingMarkup.delete(args.cacheKey);
      }
    });
  pending = {
    consumers: new Set(args.consumer ? [args.consumer] : []),
    hasUnscopedConsumer: !args.consumer,
    promise,
    task,
  };
  pendingMarkup.set(args.cacheKey, pending);
  return promise;
}

export function releaseMermaidMarkupConsumer(consumer: object) {
  for (const [cacheKey, pending] of pendingMarkup) {
    if (!pending.consumers.delete(consumer)) continue;
    if (
      !pending.hasUnscopedConsumer
      && pending.consumers.size === 0
      && pending.task.cancel()
    ) {
      pendingMarkup.delete(cacheKey);
    }
  }
}

export function clearMermaidMarkupCache() {
  cacheEpoch += 1;
  markupCache.clear();
  for (const pending of pendingMarkup.values()) pending.task.cancel();
  pendingMarkup.clear();
}

export function getPendingMermaidMarkupCount() {
  return pendingMarkup.size;
}

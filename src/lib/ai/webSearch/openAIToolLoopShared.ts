import type { ChatCompletionRequest } from '@/lib/ai/types';
import { sanitizeWebSearchSourceUrl, sanitizeWebSearchStatus } from './statusMarkup';
import { stripThinkingContent } from '@/lib/ai/stripThinkingContent';
import { buildWebSearchCapabilityAnswer } from './intent';
import type { WebSearchStatus } from './types';
import type { OpenAIWireMessage } from './openAIToolTypes';
import { MAX_NO_RESULT_SEARCH_ATTEMPTS } from './openAIToolLoopTypes';

export function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw new DOMException('The web search request was cancelled.', 'AbortError');
}

export function emitChunk(onChunk: (chunk: string) => void, signal: AbortSignal | undefined, chunk: string): void {
  throwIfAborted(signal);
  onChunk(chunk);
  throwIfAborted(signal);
}

export function emitApiTranscript(
  onApiTranscript: ((messages: OpenAIWireMessage[]) => void) | undefined,
  signal: AbortSignal | undefined,
  messages: OpenAIWireMessage[],
): void {
  throwIfAborted(signal);
  onApiTranscript?.(messages);
  throwIfAborted(signal);
}

export function emitWebSearchStatus(
  onStatus: ((status: WebSearchStatus) => void) | undefined,
  signal: AbortSignal | undefined,
  status: WebSearchStatus,
): void {
  throwIfAborted(signal);
  const safeStatus = sanitizeWebSearchStatus(status);
  if (safeStatus) {
    onStatus?.(safeStatus);
  }
  throwIfAborted(signal);
}

export function appendSuccessfulReadSources(target: string[], status: WebSearchStatus): void {
  if (!hasSuccessfulRead(status)) return;
  for (const url of status.urls ?? []) {
    const safeUrl = sanitizeWebSearchSourceUrl(url);
    if (!safeUrl) continue;
    if (!target.includes(safeUrl)) target.push(safeUrl);
  }
}

export function withSourceLinks(content: string, sourceUrls: string[]): string {
  const urls = sourceUrls.slice(0, 5);
  const missingUrls = urls.filter((url) => !content.includes(url));
  if (missingUrls.length === 0) return content;
  return `${content.trimEnd()}\n\nSources:\n${missingUrls.map((url) => `- ${url}`).join('\n')}`;
}

export function buildFinalAssistantTranscriptMessage(content: string, reasoningContent?: string): OpenAIWireMessage {
  const message: OpenAIWireMessage = {
    role: 'assistant',
    content,
  };
  if (reasoningContent) {
    message.reasoning_content = reasoningContent;
  }
  return message;
}

export function resolveFinalAssistantApiContent(result: {
  content: string;
  assistantContent?: string;
}, sourceUrls: string[]): string {
  return withSourceLinks(result.assistantContent ?? result.content, sourceUrls);
}

export function hasSuccessfulRead(status: WebSearchStatus): boolean {
  if (status.phase !== 'complete') return false;
  if (typeof status.metrics?.successCount === 'number') {
    return status.metrics.successCount > 0;
  }
  return (status.urls?.length ?? 0) > 0;
}

export function shouldRequirePageRead(
  status: WebSearchStatus | null,
  latestResultsHaveSuccessfulRead: boolean,
  forcedReadExhausted: boolean,
): boolean {
  return status?.phase === 'results'
    && !latestResultsHaveSuccessfulRead
    && !forcedReadExhausted
    && (status.results?.length ?? 0) > 0;
}

export function buildReadReminderMessage(): OpenAIWireMessage {
  return {
    role: 'system',
    content: 'Read one result page before answering.',
  };
}

export function buildVisibleAnswerReminderMessage(): OpenAIWireMessage {
  return {
    role: 'system',
    content: 'Answer now. No tools. Cite URLs.',
  };
}

export function hasVisibleAnswerContent(content: string): boolean {
  return stripThinkingContent(content).trim().length > 0;
}

export function throwIfMissingVisibleAnswer(content: string): void {
  if (hasVisibleAnswerContent(content)) return;
  throw new Error('The model completed web search but returned no visible answer.');
}

export function hasAnySearchResults(statusHistory: WebSearchStatus[]): boolean {
  return statusHistory.some((status) => status.phase === 'results' && (status.results?.length ?? 0) > 0);
}

export function countNoResultSearchAttempts(statusHistory: WebSearchStatus[]): number {
  return statusHistory.filter((status) =>
    status.phase === 'error' &&
    typeof status.metrics?.resultCount === 'number' &&
    status.metrics.resultCount === 0
  ).length;
}

export function shouldStopNoResultSearchLoop(statusHistory: WebSearchStatus[]): boolean {
  return !hasAnySearchResults(statusHistory) && countNoResultSearchAttempts(statusHistory) >= MAX_NO_RESULT_SEARCH_ATTEMPTS;
}

export function buildNoSearchResultsAnswer(body: ChatCompletionRequest): string {
  const userText = getLatestUserText(body);
  const isChinese = /[\u3400-\u9fff]/.test(userText);
  return isChinese
    ? '我这边没有找到可用的联网搜索结果，所以不能可靠确认这个问题的最新信息。你可以换一个更具体的名称、官网名或英文关键词再试。'
    : 'I could not find usable web results, so I cannot reliably verify the latest information for this request. Try a more specific name, official site, or English keyword.';
}

export function finishNoResultSearchLocally({
  body,
  onChunk,
  onApiTranscript,
  signal,
}: {
  body: ChatCompletionRequest;
  onChunk: (chunk: string) => void;
  onApiTranscript?: (messages: OpenAIWireMessage[]) => void;
  signal?: AbortSignal;
}): string {
  const content = buildNoSearchResultsAnswer(body);
  emitApiTranscript(onApiTranscript, signal, [buildFinalAssistantTranscriptMessage(content)]);
  emitChunk(onChunk, signal, content);
  return content;
}

export function finishUnavailableSearchLocally({
  body,
  onChunk,
  onApiTranscript,
  signal,
}: {
  body: ChatCompletionRequest;
  onChunk: (chunk: string) => void;
  onApiTranscript?: (messages: OpenAIWireMessage[]) => void;
  signal?: AbortSignal;
}): string {
  const userText = getLatestUserText(body);
  const content = /[\u3400-\u9fff]/.test(userText)
    ? '联网搜索服务暂时不可用，请稍后再试。'
    : 'Web search is temporarily unavailable. Please try again later.';
  emitApiTranscript(onApiTranscript, signal, [buildFinalAssistantTranscriptMessage(content)]);
  emitChunk(onChunk, signal, content);
  return content;
}

export function finishWebSearchCapabilityLocally({
  body,
  onChunk,
  onApiTranscript,
  signal,
}: {
  body: ChatCompletionRequest;
  onChunk: (chunk: string) => void;
  onApiTranscript?: (messages: OpenAIWireMessage[]) => void;
  signal?: AbortSignal;
}): string {
  const content = buildWebSearchCapabilityAnswer(getLatestUserText(body));
  emitApiTranscript(onApiTranscript, signal, [buildFinalAssistantTranscriptMessage(content)]);
  emitChunk(onChunk, signal, content);
  return content;
}

export function withoutTools(body: ChatCompletionRequest): ChatCompletionRequest {
  const { tools: _tools, tool_choice: _toolChoice, ...rest } = body;
  return rest;
}

export function extractWireMessageText(content: OpenAIWireMessage['content']): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((part): part is Extract<NonNullable<OpenAIWireMessage['content']>[number], { type: 'text' }> =>
      typeof part === 'object' && part !== null && part.type === 'text')
    .map((part) => part.text)
    .join('\n\n');
}

export function getLatestUserText(body: ChatCompletionRequest): string {
  for (let index = body.messages.length - 1; index >= 0; index -= 1) {
    const message = body.messages[index] as OpenAIWireMessage;
    if (message.role !== 'user') continue;
    const text = extractWireMessageText(message.content).trim();
    if (text) return text;
  }
  return '';
}

import { sanitizeWebSearchSourceUrl } from './statusMarkup';
import { WEB_SEARCH_TOOL_NAMES } from './toolDefinitions';
import { runWebSearchToolCall, type WebSearchToolRunnerOptions } from './toolRunner';
import type { WebSearchStatus } from './types';
import type { OpenAIToolCall, OpenAIWireMessage } from './openAIToolTypes';
import { buildReadReminderMessage } from './openAIToolLoopShared';
import {
  buildToolCallDedupeKey,
  parseToolArguments,
} from './openAIToolLoopToolArgs';
import { MAX_WEB_SEARCH_TOOL_CALL_CONCURRENCY } from './openAIToolLoopTypes';

export function collectUniqueSearchResultUrls(
  status: WebSearchStatus,
  options: {
    limit?: number;
    exclude?: Set<string>;
  } = {},
): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const result of status.results ?? []) {
    if (options.limit !== undefined && urls.length >= options.limit) break;
    const url = sanitizeWebSearchSourceUrl(result.url);
    if (!url || seen.has(url) || options.exclude?.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

export function getPrefetchReadUrls(status: WebSearchStatus): string[] {
  return collectUniqueSearchResultUrls(status, { limit: 3 });
}

export function buildForcedReadToolCall(
  status: WebSearchStatus,
  loopIndex: number,
  attemptedUrls: Set<string>,
): OpenAIToolCall | null {
  const urls = collectUniqueSearchResultUrls(status, {
    exclude: attemptedUrls,
    limit: 3,
  });

  if (urls.length === 0) {
    return null;
  }

  return {
    id: `forced_read_${loopIndex}`,
    type: 'function',
    function: {
      name: WEB_SEARCH_TOOL_NAMES.readBatch,
      arguments: JSON.stringify({ urls }),
    },
  };
}

export function getReadableResultUrls(status: WebSearchStatus): string[] {
  return collectUniqueSearchResultUrls(status);
}

export function buildAssistantToolMessage(result: {
  content: string;
  assistantContent?: string;
  reasoningContent?: string;
  toolCalls: OpenAIToolCall[];
}): OpenAIWireMessage {
  const message: OpenAIWireMessage = {
    role: 'assistant',
    content: (result.assistantContent ?? result.content) || '',
    tool_calls: result.toolCalls,
  };
  if (result.reasoningContent) {
    message.reasoning_content = result.reasoningContent;
  }
  return message;
}

export async function runToolCallsWithConcurrency(
  toolCalls: OpenAIToolCall[],
  options: WebSearchToolRunnerOptions,
): Promise<OpenAIWireMessage[]> {
  const contentByKey = new Map<string, Promise<string>>();
  const contents = new Array<string>(toolCalls.length);
  let nextIndex = 0;
  const hasOneToolType = new Set(toolCalls.map((toolCall) => toolCall.function.name)).size <= 1;
  const workerCount = hasOneToolType
    ? Math.min(MAX_WEB_SEARCH_TOOL_CALL_CONCURRENCY, toolCalls.length)
    : Math.min(1, toolCalls.length);

  const runNext = async (): Promise<void> => {
    const index = nextIndex;
    nextIndex += 1;
    if (index >= toolCalls.length) return;
    const toolCall = toolCalls[index];
    const key = buildToolCallDedupeKey(toolCall);
    let content = contentByKey.get(key);
    if (!content) {
      content = runWebSearchToolCall(toolCall.function, options);
      contentByKey.set(key, content);
    }
    contents[index] = await content;
    await runNext();
  };

  await Promise.all(Array.from({ length: workerCount }, () => runNext()));

  return toolCalls.map((toolCall, index) => ({
    role: 'tool',
    tool_call_id: toolCall.id,
    name: toolCall.function.name,
    content: contents[index],
  }));
}

export async function appendForcedReadMessages(
  messages: OpenAIWireMessage[],
  status: WebSearchStatus,
  loopIndex: number,
  options: WebSearchToolRunnerOptions,
  attemptedUrls: Set<string>,
): Promise<{
  messages: OpenAIWireMessage[];
  addedMessages: OpenAIWireMessage[];
  attemptedUrls: string[];
  exhausted: boolean;
}> {
  const toolCall = buildForcedReadToolCall(status, loopIndex, attemptedUrls);

  if (!toolCall) {
    const addedMessages = [buildReadReminderMessage()];
    return {
      messages: [...messages, ...addedMessages],
      addedMessages,
      attemptedUrls: [],
      exhausted: true,
    };
  }

  const args = parseToolArguments(toolCall.function.arguments);
  const urls = Array.isArray(args.urls)
    ? args.urls.filter((url): url is string => typeof url === 'string' && url.trim().length > 0).slice(0, 3)
    : [];
  for (const url of urls) attemptedUrls.add(url);
  const toolResult = await runWebSearchToolCall(toolCall.function, options);
  const allReadableUrls = getReadableResultUrls(status);
  const addedMessages: OpenAIWireMessage[] = [
    {
      role: 'assistant',
      content: '',
      tool_calls: [toolCall],
    },
    {
      role: 'tool',
      tool_call_id: toolCall.id,
      name: toolCall.function.name,
      content: toolResult,
    },
  ];
  return {
    messages: [
      ...messages,
      ...addedMessages,
    ],
    addedMessages,
    attemptedUrls: urls,
    exhausted: allReadableUrls.every((url) => attemptedUrls.has(url)),
  };
}

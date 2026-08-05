import type { ChatCompletionRequest } from '@/lib/ai/types';
import { stripThinkingContent } from '@/lib/ai/stripThinkingContent';
import { addChatDebugLog } from '@/lib/debug/chatDebugLog';
import { classifyWebSearchIntent } from './intent';
import { extractOpenAIMessageFromJson } from './openAIToolParsing';
import type { JsonTextProtocolOptions } from './openAIToolLoopTypes';
import type { OpenAIWireMessage } from './openAIToolTypes';
import {
  buildFinalAssistantTranscriptMessage,
  emitApiTranscript,
  emitChunk,
  finishWebSearchCapabilityLocally,
  finishNoResultSearchLocally,
  finishUnavailableSearchLocally,
  getLatestUserText,
  hasAnySearchResults,
  throwIfAborted,
  throwIfMissingVisibleAnswer,
  withSourceLinks,
  withoutTools,
} from './openAIToolLoopShared';
import {
  buildTextProtocolDecisionMessage,
  containsTextProtocolSearchRequest,
  resolveTextProtocolSearchRequest,
  stripTextProtocolDecisionContent,
} from './openAIToolLoopTextProtocolParsing';
import { buildTextProtocolSearchMessages } from './openAIToolLoopTextProtocolSearch';

export async function runOpenAIWebSearchJsonTextProtocolRequest({
  body,
  onChunk,
  onStatus,
  onApiTranscript,
  requestJson,
  client,
  signal,
}: JsonTextProtocolOptions): Promise<string> {
  throwIfAborted(signal);
  const latestUserText = getLatestUserText(body);
  const localIntent = classifyWebSearchIntent(latestUserText);
  if (localIntent.action === 'answer-capability') {
    return finishWebSearchCapabilityLocally({ body, onChunk, onApiTranscript, signal });
  }

  let searchRequest: { query: string; reason?: string } | null = localIntent.action === 'prefetch'
    ? { query: localIntent.query, reason: localIntent.reason }
    : null;

  if (searchRequest) {
    addChatDebugLog('web-search-text-protocol', 'json local intent requested search', {
      query: searchRequest.query,
      reason: searchRequest.reason ?? '',
    });
  } else {
    addChatDebugLog('web-search-text-protocol', 'json decision request started', {
      messages: body.messages.length,
      latestUserText: latestUserText.slice(0, 240),
    });
    const decisionMessages = [
      buildTextProtocolDecisionMessage(),
      ...body.messages as OpenAIWireMessage[],
    ];
    const decisionPayload = await requestJson({
      ...withoutTools(body),
      stream: false,
      messages: decisionMessages as ChatCompletionRequest['messages'],
    });
    throwIfAborted(signal);
    const decision = extractOpenAIMessageFromJson(decisionPayload);
    searchRequest = resolveTextProtocolSearchRequest(decision.content, latestUserText);

    if (!searchRequest) {
      const directContent = containsTextProtocolSearchRequest(decision.content)
        ? stripTextProtocolDecisionContent(decision.content)
        : decision.content;
      throwIfMissingVisibleAnswer(directContent);
      addChatDebugLog('web-search-text-protocol', 'json decision answered directly', {
        visibleChars: stripThinkingContent(directContent).length,
      });
      emitChunk(onChunk, signal, directContent);
      emitApiTranscript(onApiTranscript, signal, [
        buildFinalAssistantTranscriptMessage(directContent, decision.reasoningContent),
      ]);
      return directContent;
    }
  }

  addChatDebugLog('web-search-text-protocol', 'json decision requested search', {
    query: searchRequest.query,
    reason: searchRequest.reason ?? '',
  });
  const {
    messages,
    searchUnavailable,
    statusHistory,
    sourceUrls,
  } = await buildTextProtocolSearchMessages({ body, query: searchRequest.query, client, onStatus, signal });

  if (searchUnavailable) {
    return finishUnavailableSearchLocally({ body, onChunk, onApiTranscript, signal });
  }

  if (!hasAnySearchResults(statusHistory)) {
    return finishNoResultSearchLocally({ body, onChunk, onApiTranscript, signal });
  }

  const answerPayload = await requestJson({
    ...withoutTools(body),
    stream: false,
    messages: messages as ChatCompletionRequest['messages'],
  });
  throwIfAborted(signal);
  const answer = extractOpenAIMessageFromJson(answerPayload);
  const finalApiContent = withSourceLinks(answer.content, sourceUrls);
  throwIfMissingVisibleAnswer(finalApiContent);
  addChatDebugLog('web-search-text-protocol', 'json search answer completed', {
    statuses: statusHistory.map((status) => status.phase),
    sources: sourceUrls,
    finalChars: finalApiContent.length,
  });
  emitChunk(onChunk, signal, finalApiContent);
  emitApiTranscript(onApiTranscript, signal, [
    buildFinalAssistantTranscriptMessage(finalApiContent, answer.reasoningContent),
  ]);
  return finalApiContent;
}

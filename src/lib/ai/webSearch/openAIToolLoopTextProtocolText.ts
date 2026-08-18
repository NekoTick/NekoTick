import type { ChatCompletionRequest } from '@/lib/ai/types';
import { stripThinkingContent } from '@/lib/ai/stripThinkingContent';
import { addChatDebugLog } from '@/lib/debug/chatDebugLog';
import { classifyWebSearchIntent } from './intent';
import type { TextRequestProtocolOptions } from './openAIToolLoopTypes';
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
  createTextProtocolDecisionStreamGate,
  resolveTextProtocolSearchRequest,
  stripTextProtocolDecisionContent,
} from './openAIToolLoopTextProtocolParsing';
import { buildTextProtocolSearchMessages } from './openAIToolLoopTextProtocolSearch';

export async function runOpenAIWebSearchTextProtocolTextRequest({
  body,
  onChunk,
  onStatus,
  onApiTranscript,
  requestText,
  client,
  signal,
}: TextRequestProtocolOptions): Promise<string> {
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
    addChatDebugLog('web-search-text-protocol', 'text local intent requested search', {
      query: searchRequest.query,
      reason: searchRequest.reason ?? '',
    });
  } else {
    addChatDebugLog('web-search-text-protocol', 'text decision request started', {
      messages: body.messages.length,
      latestUserText: latestUserText.slice(0, 240),
    });
    const decisionMessages = [
      buildTextProtocolDecisionMessage(),
      ...body.messages as OpenAIWireMessage[],
    ];
    const decisionGate = createTextProtocolDecisionStreamGate((content) => {
      emitChunk(onChunk, signal, content);
    });
    const decisionContent = await requestText({
      ...withoutTools(body),
      messages: decisionMessages as ChatCompletionRequest['messages'],
    }, decisionGate.push);
    throwIfAborted(signal);
    decisionGate.push(decisionContent);
    searchRequest = resolveTextProtocolSearchRequest(decisionContent, latestUserText);

    if (!searchRequest) {
      const directContent = containsTextProtocolSearchRequest(decisionContent)
        ? stripTextProtocolDecisionContent(decisionContent)
        : decisionContent;
      throwIfMissingVisibleAnswer(directContent);
      addChatDebugLog('web-search-text-protocol', 'text decision answered directly', {
        visibleChars: stripThinkingContent(directContent).length,
      });
      decisionGate.emitDirectContent(directContent);
      emitApiTranscript(onApiTranscript, signal, [
        buildFinalAssistantTranscriptMessage(stripThinkingContent(directContent)),
      ]);
      return directContent;
    }
  }

  addChatDebugLog('web-search-text-protocol', 'text decision requested search', {
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

  const answerContent = await requestText({
    ...withoutTools(body),
    messages: messages as ChatCompletionRequest['messages'],
  }, (content) => {
    emitChunk(onChunk, signal, content);
  });
  throwIfAborted(signal);
  const finalApiContent = withSourceLinks(stripThinkingContent(answerContent), sourceUrls);
  throwIfMissingVisibleAnswer(finalApiContent);
  addChatDebugLog('web-search-text-protocol', 'text search answer completed', {
    statuses: statusHistory.map((status) => status.phase),
    sources: sourceUrls,
    finalChars: finalApiContent.length,
  });
  emitChunk(onChunk, signal, finalApiContent);
  emitApiTranscript(onApiTranscript, signal, [
    buildFinalAssistantTranscriptMessage(finalApiContent),
  ]);
  return finalApiContent;
}

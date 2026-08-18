import type { ChatCompletionRequest } from '@/lib/ai/types';
import { stripThinkingContent } from '@/lib/ai/stripThinkingContent';
import { addChatDebugLog } from '@/lib/debug/chatDebugLog';
import { classifyWebSearchIntent } from './intent';
import { consumeOpenAIStreamWithTools } from './openAIStreamWithTools';
import type { StreamingTextProtocolOptions } from './openAIToolLoopTypes';
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

export async function runOpenAIWebSearchTextProtocolRequest({
  body,
  onChunk,
  onStatus,
  onApiTranscript,
  request,
  client,
  signal,
}: StreamingTextProtocolOptions): Promise<string> {
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
    addChatDebugLog('web-search-text-protocol', 'stream local intent requested search', {
      query: searchRequest.query,
      reason: searchRequest.reason ?? '',
    });
  } else {
    addChatDebugLog('web-search-text-protocol', 'stream decision request started', {
      messages: body.messages.length,
      latestUserText: latestUserText.slice(0, 240),
    });
    const decisionMessages = [
      buildTextProtocolDecisionMessage(),
      ...body.messages as OpenAIWireMessage[],
    ];
    const decisionResponse = await request({
      ...withoutTools(body),
      messages: decisionMessages as ChatCompletionRequest['messages'],
    });
    const decisionGate = createTextProtocolDecisionStreamGate((content) => {
      emitChunk(onChunk, signal, content);
    });
    const decision = await consumeOpenAIStreamWithTools(decisionResponse, decisionGate.push, { signal });
    throwIfAborted(signal);
    decisionGate.push(decision.content);
    searchRequest = resolveTextProtocolSearchRequest(
      decision.assistantContent || decision.content,
      latestUserText,
    );

    if (!searchRequest) {
      const directContent = containsTextProtocolSearchRequest(decision.assistantContent || decision.content)
        ? stripTextProtocolDecisionContent(decision.content)
        : decision.content;
      throwIfMissingVisibleAnswer(directContent);
      addChatDebugLog('web-search-text-protocol', 'stream decision answered directly', {
        visibleChars: stripThinkingContent(directContent).length,
      });
      decisionGate.emitDirectContent(directContent);
      emitApiTranscript(onApiTranscript, signal, [
        buildFinalAssistantTranscriptMessage(decision.assistantContent || directContent, decision.reasoningContent),
      ]);
      return directContent;
    }
  }

  addChatDebugLog('web-search-text-protocol', 'stream decision requested search', {
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

  let latestContent = '';
  const emitContent = (content: string) => {
    latestContent = content;
    emitChunk(onChunk, signal, latestContent);
  };

  const answerResponse = await request({
    ...withoutTools(body),
    messages: messages as ChatCompletionRequest['messages'],
  });
  const answer = await consumeOpenAIStreamWithTools(answerResponse, emitContent, { signal });
  throwIfAborted(signal);
  const finalApiContent = withSourceLinks(answer.assistantContent || answer.content, sourceUrls);
  throwIfMissingVisibleAnswer(finalApiContent);
  addChatDebugLog('web-search-text-protocol', 'stream search answer completed', {
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

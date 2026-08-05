import type { ChatCompletionRequest } from '@/lib/ai/types';
import { addChatDebugLog } from '@/lib/debug/chatDebugLog';
import { classifyWebSearchIntent } from './intent';
import { buildWebSearchTools } from './toolDefinitions';
import { sanitizeWebSearchStatus } from './statusMarkup';
import { appendWebSearchSystemInstruction, extractOpenAIMessageFromJson } from './openAIToolParsing';
import type { JsonToolLoopOptions } from './openAIToolLoopTypes';
import type { WebSearchStatus } from './types';
import type { OpenAIWireMessage } from './openAIToolTypes';
import {
  appendSuccessfulReadSources, buildFinalAssistantTranscriptMessage, buildVisibleAnswerReminderMessage,
  countNoResultSearchAttempts, emitApiTranscript, emitChunk, emitWebSearchStatus, finishNoResultSearchLocally,
  finishWebSearchCapabilityLocally, getLatestUserText, hasAnySearchResults, hasSuccessfulRead,
  hasVisibleAnswerContent, resolveFinalAssistantApiContent, shouldRequirePageRead, shouldStopNoResultSearchLoop,
  throwIfAborted, throwIfMissingVisibleAnswer, withSourceLinks, withoutTools,
} from './openAIToolLoopShared';
import {
  boundedToolNameForLog, buildCachedReadToolMessages, cacheReadContentForToolMessages, getReadToolUrls,
  hasOnlyAlreadyReadToolCalls, hasOnlySearchToolCalls,
} from './openAIToolLoopToolArgs';
import { appendForcedReadMessages, buildAssistantToolMessage, runToolCallsSequentially } from './openAIToolLoopToolRuntime';
import { createWebSearchExecutionSession } from './executionSession';
import { buildNoToolRecoveryMessages, recoverJsonVisibleAnswer } from './openAIToolLoopRecovery';
import { MAX_WEB_SEARCH_TOOL_LOOPS } from './openAIToolLoopTypes';

export async function runOpenAIWebSearchJsonToolLoop({
  body,
  onChunk,
  requestJson,
  client,
  onStatus,
  onApiTranscript,
  signal,
  autoReadAfterSearch,
}: JsonToolLoopOptions): Promise<string> {
  throwIfAborted(signal);
  const session = createWebSearchExecutionSession();
  const localIntent = classifyWebSearchIntent(getLatestUserText(body));
  if (localIntent.action === 'answer-capability') {
    return finishWebSearchCapabilityLocally({ body, onChunk, onApiTranscript, signal });
  }
  let latestResultsStatus: WebSearchStatus | null = null;
  const statusHistory: WebSearchStatus[] = [];
  const sourceUrls: string[] = [];
  let latestContent = '';
  let latestReasoningContent = '';
  let latestResultsHaveSuccessfulRead = false;
  let forcedReadExhausted = false;
  let forcedReadAttemptedUrls = new Set<string>();
  let messages = appendWebSearchSystemInstruction(body.messages as OpenAIWireMessage[]);
  const responseTranscript: OpenAIWireMessage[] = [];
  let pendingPrefetchTranscript: OpenAIWireMessage[] = [];
  const readContentByUrl = new Map<string, string>();
  const emitStatus = (status: WebSearchStatus) => {
    const safeStatus = sanitizeWebSearchStatus(status);
    if (!safeStatus) return;
    if (safeStatus.phase === 'results' && (safeStatus.results?.length ?? 0) > 0) {
      latestResultsStatus = safeStatus;
      latestResultsHaveSuccessfulRead = false;
      forcedReadExhausted = false;
      forcedReadAttemptedUrls = new Set();
    }
    if (hasSuccessfulRead(safeStatus)) {
      latestResultsHaveSuccessfulRead = true;
    }
    statusHistory.push(safeStatus);
    appendSuccessfulReadSources(sourceUrls, safeStatus);
    emitWebSearchStatus(onStatus, signal, safeStatus);
  };

  if (localIntent.action === 'prefetch') {
    const toolCall = {
      id: 'prefetch_web_search',
      type: 'function' as const,
      function: {
        name: 'web_search',
        arguments: JSON.stringify({ query: localIntent.query }),
      },
    };
    const assistantMessage: OpenAIWireMessage = { role: 'assistant', content: '', tool_calls: [toolCall] };
    const toolMessages = await runToolCallsSequentially([toolCall], {
      client,
      onStatus: emitStatus,
      signal,
      autoReadAfterSearch: true,
      session,
    });
    messages = [...messages, assistantMessage, ...toolMessages];
    pendingPrefetchTranscript = [assistantMessage, ...toolMessages];
  }

  for (let loopIndex = 0; loopIndex < MAX_WEB_SEARCH_TOOL_LOOPS; loopIndex += 1) {
    throwIfAborted(signal);
    if (shouldStopNoResultSearchLoop(statusHistory)) {
      addChatDebugLog('web-search-loop', 'json no-result search cap reached', {
        loopIndex,
        attempts: countNoResultSearchAttempts(statusHistory),
      }, 'warn');
      return finishNoResultSearchLocally({
        body,
        onChunk,
        onApiTranscript,
        signal,
      });
    }
    const loopStartedAt = Date.now();
    addChatDebugLog('web-search-loop', 'json loop request started', {
      loopIndex,
      messages: messages.length,
      hasResults: Boolean(latestResultsStatus),
      successfulRead: latestResultsHaveSuccessfulRead,
    });
    const shouldUsePrefetchedEvidence = localIntent.action === 'prefetch' && latestResultsHaveSuccessfulRead;
    const shouldDisableToolsForFinalAnswer = shouldUsePrefetchedEvidence
      || autoReadAfterSearch === true && latestResultsHaveSuccessfulRead;
    const reminderMessage = buildVisibleAnswerReminderMessage();
    const requestMessages = shouldUsePrefetchedEvidence
      ? buildNoToolRecoveryMessages(body, messages, sourceUrls, reminderMessage)
      : shouldDisableToolsForFinalAnswer
        ? [...messages, reminderMessage]
        : messages;
    if (pendingPrefetchTranscript.length > 0) {
      if (!shouldUsePrefetchedEvidence) responseTranscript.push(...pendingPrefetchTranscript);
      pendingPrefetchTranscript = [];
    }
    const payload = await requestJson({
      ...(shouldDisableToolsForFinalAnswer ? withoutTools(body) : body),
      stream: false,
      messages: requestMessages as ChatCompletionRequest['messages'],
      ...(shouldDisableToolsForFinalAnswer ? {} : { tools: buildWebSearchTools() }),
    });
    throwIfAborted(signal);
    const result = extractOpenAIMessageFromJson(payload);
    latestContent = result.content;
    latestReasoningContent = result.reasoningContent;
    addChatDebugLog('web-search-loop', 'json loop response parsed', {
      loopIndex,
      durationMs: Date.now() - loopStartedAt,
      toolCalls: result.toolCalls.map((call) => boundedToolNameForLog(call.function.name)),
      visibleChars: result.content.length,
      reasoningChars: result.reasoningContent.length,
    });

    if (result.toolCalls.length === 0) {
      if (latestResultsStatus && shouldRequirePageRead(latestResultsStatus, latestResultsHaveSuccessfulRead, forcedReadExhausted)) {
        const forcedRead = await appendForcedReadMessages(
          messages,
          latestResultsStatus,
          loopIndex,
          { client, onStatus: emitStatus, signal, autoReadAfterSearch, session },
          forcedReadAttemptedUrls,
        );
        throwIfAborted(signal);
        addChatDebugLog('web-search-loop', 'forced page read appended', {
          loopIndex,
          attemptedUrls: forcedRead.attemptedUrls,
          exhausted: forcedRead.exhausted,
        });
        forcedReadExhausted = forcedRead.exhausted;
        messages = forcedRead.messages;
        responseTranscript.push(...forcedRead.addedMessages);
        latestContent = '';
        emitChunk(onChunk, signal, latestContent);
        continue;
      }
      if (!hasVisibleAnswerContent(latestContent) && loopIndex < MAX_WEB_SEARCH_TOOL_LOOPS - 1) {
        const reminderMessage = buildVisibleAnswerReminderMessage();
        addChatDebugLog('web-search-loop', 'visible answer reminder appended', {
          loopIndex,
          mode: 'json',
        }, 'warn');
        messages = [...messages, reminderMessage];
        responseTranscript.push(reminderMessage);
        latestContent = '';
        latestReasoningContent = '';
        emitChunk(onChunk, signal, latestContent);
        continue;
      }
      if (!hasVisibleAnswerContent(latestContent)) {
        return recoverJsonVisibleAnswer({
          body,
          messages,
          statusHistory,
          sourceUrls,
          requestJson,
          onChunk,
          onApiTranscript,
          responseTranscript,
          signal,
        });
      }
      throwIfMissingVisibleAnswer(latestContent);
      const finalAnswerContent = withSourceLinks(latestContent, sourceUrls);
      addChatDebugLog('web-search-loop', 'json loop completed', {
        loopIndex,
        sourceUrls,
        finalChars: finalAnswerContent.length,
      });
      const finalContent = finalAnswerContent;
      const finalApiContent = resolveFinalAssistantApiContent(result, sourceUrls);
      responseTranscript.push(buildFinalAssistantTranscriptMessage(finalApiContent, result.reasoningContent));
      emitApiTranscript(onApiTranscript, signal, responseTranscript);
      emitChunk(onChunk, signal, finalContent);
      return finalContent;
    }

    if (
      hasAnySearchResults(statusHistory) &&
      hasVisibleAnswerContent(latestContent) &&
      hasOnlySearchToolCalls(result.toolCalls)
    ) {
      const finalAnswerContent = withSourceLinks(latestContent, sourceUrls);
      addChatDebugLog('web-search-loop', 'json loop completed with visible answer despite redundant tool calls', {
        loopIndex,
        sourceUrls,
        skippedToolCalls: result.toolCalls.map((call) => boundedToolNameForLog(call.function.name)),
        finalChars: finalAnswerContent.length,
      }, 'warn');
      const finalContent = finalAnswerContent;
      const finalApiContent = resolveFinalAssistantApiContent(result, sourceUrls);
      responseTranscript.push(buildFinalAssistantTranscriptMessage(finalApiContent, result.reasoningContent));
      emitApiTranscript(onApiTranscript, signal, responseTranscript);
      emitChunk(onChunk, signal, finalContent);
      return finalContent;
    }

    const assistantToolMessage = buildAssistantToolMessage(result);
    if (hasOnlyAlreadyReadToolCalls(result.toolCalls, readContentByUrl)) {
      const toolMessages = buildCachedReadToolMessages(result.toolCalls, readContentByUrl);
      addChatDebugLog('web-search-loop', 'reused cached page read for redundant tool calls', {
        loopIndex,
        urls: result.toolCalls.flatMap(getReadToolUrls),
      });
      messages = [
        ...messages,
        assistantToolMessage,
        ...toolMessages,
      ];
      responseTranscript.push(assistantToolMessage, ...toolMessages);
      latestContent = '';
      emitChunk(onChunk, signal, latestContent);
      continue;
    }
    addChatDebugLog('web-search-loop', 'running tool calls', {
      loopIndex,
      toolCalls: result.toolCalls.map((call) => ({
        id: call.id,
        name: boundedToolNameForLog(call.function.name),
      })),
    });
    const toolMessages = await runToolCallsSequentially(result.toolCalls, {
      client,
      onStatus: emitStatus,
      signal,
      autoReadAfterSearch,
      session,
    });
    throwIfAborted(signal);
    cacheReadContentForToolMessages(readContentByUrl, result.toolCalls, toolMessages);
    messages = [
      ...messages,
      assistantToolMessage,
      ...toolMessages,
    ];
    responseTranscript.push(assistantToolMessage, ...toolMessages);
  }

  if (!hasVisibleAnswerContent(latestContent)) {
    addChatDebugLog('web-search-loop', 'json fallback recovery started', {
      loops: MAX_WEB_SEARCH_TOOL_LOOPS,
      sourceUrls,
    }, 'warn');
    return recoverJsonVisibleAnswer({
      body,
      messages,
      statusHistory,
      sourceUrls,
      requestJson,
      onChunk,
      onApiTranscript,
      responseTranscript,
      signal,
    });
  }
  throwIfMissingVisibleAnswer(latestContent);
  throwIfAborted(signal);
  const fallbackAnswerContent = withSourceLinks(latestContent, sourceUrls);
  responseTranscript.push(buildFinalAssistantTranscriptMessage(fallbackAnswerContent, latestReasoningContent));
  emitApiTranscript(onApiTranscript, signal, responseTranscript);
  const fallbackContent = fallbackAnswerContent;
  emitChunk(onChunk, signal, fallbackContent);
  return fallbackContent;
}

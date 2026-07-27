import { createAIError } from '@/lib/ai/errors';
import {
  createManagedProtocolChunkHandler,
  hasManagedProtocolMarkup,
  runManagedTextAgentToolLoop,
} from '@/lib/ai/computerUse/managedTextAgentToolLoop';
import { runOpenAIStreamingAgentToolLoop, runOpenAIStreamResultAgentToolLoop } from '@/lib/ai/computerUse/openAIAgentToolLoop';
import { requestManagedChatCompletionStream, requestManagedChatCompletionStreamWithTools } from '@/lib/ai/managedService';
import { AIErrorType, type ChatCompletionRequest, type ChatSendOptions } from '@/lib/ai/types';
import { translate } from '@/lib/i18n';
import { createHtmlRejectingChunkHandler } from './openaiRuntime';
import { requestOpenAIChatCompletionWithRetry } from './openaiRequests';

interface ComputerUseRequestOptions {
  body: ChatCompletionRequest;
  onChunk?: (chunk: string) => void;
  options: ChatSendOptions;
  signal?: AbortSignal;
}

export function runManagedComputerUseMessage({
  body,
  onChunk,
  options,
  signal,
}: ComputerUseRequestOptions): Promise<string> {
  let didHandleLocalTool = false;
  const onCommandStatus: NonNullable<ChatSendOptions['onComputerCommandStatus']> = (status) => {
    didHandleLocalTool = true;
    options.onComputerCommandStatus?.(status);
  };
  const onWebSearchStatus: NonNullable<ChatSendOptions['onWebSearchStatus']> = (status) => {
    didHandleLocalTool = true;
    options.onWebSearchStatus?.(status);
  };
  const nativeRequest = runOpenAIStreamResultAgentToolLoop({
    approvalContext: options.computerUseApprovalContext,
    body,
    defaultCwd: options.computerUseCwd,
    onChunk: onChunk || (() => {}),
    onApiTranscript: options.onApiTranscript,
    onCommandStatus,
    onWebSearchStatus,
    signal,
    webSearchEnabled: options.webSearchEnabled === true,
    requestResult: async (nextBody, nextOnChunk) => {
      const result = await requestManagedChatCompletionStreamWithTools({
        ...nextBody,
        stream: true,
      }, createHtmlRejectingChunkHandler(
        createManagedProtocolChunkHandler(nextOnChunk),
        signal,
      ), signal);
      const hasRawProtocol = hasManagedProtocolMarkup(result.content);
      if (
        hasManagedProtocolMarkup(result.assistantContent) ||
        hasManagedProtocolMarkup(result.reasoningContent) ||
        (hasRawProtocol && result.toolCalls.length === 0)
      ) {
        throw createAIError(AIErrorType.INVALID_REQUEST, translate('chat.computerUse.invalidProtocol'));
      }
      return result;
    },
  });
  return nativeRequest.catch(async (error: unknown) => {
    const errorCode = error && typeof error === 'object'
      ? String((error as { errorCode?: unknown }).errorCode || '').trim().toLowerCase()
      : '';
    const errorMessage = error instanceof Error ? error.message : '';
    const unsupportedToolCalling = errorCode === 'unsupported_tool_calling' ||
      errorMessage.includes('UNSUPPORTED_TOOL_CALLING');
    if (!unsupportedToolCalling || didHandleLocalTool) throw error;
    try {
      return await runManagedTextAgentToolLoop({
        approvalContext: options.computerUseApprovalContext,
        body,
        defaultCwd: options.computerUseCwd,
        onChunk: onChunk || (() => {}),
        onApiTranscript: options.onApiTranscript,
        onCommandStatus: options.onComputerCommandStatus,
        onWebSearchStatus: options.onWebSearchStatus,
        signal,
        webSearchEnabled: options.webSearchEnabled === true,
        requestText: (nextBody, nextOnChunk) => requestManagedChatCompletionStream({
          ...nextBody,
          stream: true,
        } as unknown as Record<string, unknown>, createHtmlRejectingChunkHandler(nextOnChunk, signal), signal),
      });
    } catch (fallbackError) {
      if (
        fallbackError && typeof fallbackError === 'object' &&
        (fallbackError as { message?: unknown }).message === translate('chat.computerUse.invalidProtocol')
      ) {
        throw createAIError(AIErrorType.INVALID_REQUEST, translate('chat.computerUse.unavailableForModel'));
      }
      throw fallbackError;
    }
  });
}

export function runOpenAIComputerUseMessage({
  body,
  headers,
  onChunk,
  options,
  retryDelayMs,
  timeoutMs,
  signal,
  url,
}: ComputerUseRequestOptions & {
  headers: Record<string, string>;
  retryDelayMs: number;
  timeoutMs: number;
  url: string;
}): Promise<string> {
  return runOpenAIStreamingAgentToolLoop({
    approvalContext: options.computerUseApprovalContext,
    body,
    defaultCwd: options.computerUseCwd,
    onChunk: onChunk || (() => {}),
    onApiTranscript: options.onApiTranscript,
    onCommandStatus: options.onComputerCommandStatus,
    onWebSearchStatus: options.onWebSearchStatus,
    signal,
    webSearchEnabled: options.webSearchEnabled === true,
    request: (nextBody) => requestOpenAIChatCompletionWithRetry({
      url,
      headers,
      body: nextBody,
      signal,
      scope: 'computer-operation-model',
      retryDelayMs,
      timeoutMs,
    }),
  });
}

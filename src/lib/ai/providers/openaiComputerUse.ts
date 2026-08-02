import { createAIError } from '@/lib/ai/errors';
import {
  createManagedProtocolChunkHandler,
  hasManagedProtocolMarkup,
} from '@/lib/ai/computerUse/managedTextAgentToolLoop';
import { runOpenAIStreamingAgentToolLoop, runOpenAIStreamResultAgentToolLoop } from '@/lib/ai/computerUse/openAIAgentToolLoop';
import { requestManagedChatCompletionStreamWithTools } from '@/lib/ai/managedService';
import { AIErrorType, type ChatCompletionRequest, type ChatSendOptions } from '@/lib/ai/types';
import { translate } from '@/lib/i18n';
import { createHtmlRejectingChunkHandler } from './openaiRuntime';
import { requestOpenAIChatCompletionOnce } from './openaiRequests';
import { isToolInputUnsupported } from './toolInputCompatibility';

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
  const nativeRequest = runOpenAIStreamResultAgentToolLoop({
    approvalContext: options.computerUseApprovalContext,
    body,
    defaultCwd: options.computerUseCwd,
    onChunk: onChunk || (() => {}),
    onApiTranscript: options.onApiTranscript,
    onCommandStatus: options.onComputerCommandStatus,
    onWebSearchStatus: options.onWebSearchStatus,
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
  return nativeRequest.catch((error: unknown) => {
    if (isToolInputUnsupported(error)) {
      throw createAIError(AIErrorType.INVALID_REQUEST, translate('chat.computerUse.unavailableForModel'));
    }
    throw error;
  });
}

export function runOpenAIComputerUseMessage({
  body,
  headers,
  onChunk,
  options,
  timeoutMs,
  signal,
  url,
}: ComputerUseRequestOptions & {
  headers: Record<string, string>;
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
    request: (nextBody) => requestOpenAIChatCompletionOnce({
      url,
      headers,
      body: nextBody,
      signal,
      timeoutMs,
    }),
  });
}

import { requestManager } from '@/lib/ai/requestManager';
import { resolveSessionIdAlias } from '@/lib/ai/sessionIdAliases';
import { escapeUntrustedErrorTags } from '@/lib/ai/errorTag';
import { createChunkScheduler, resolveAssistantContent } from './helpers';

export interface ChatErrorPayload {
  message: string;
  xml: string;
}

export type StreamedAssistantMessageStatus = 'completed' | 'aborted' | 'failed';

export interface StreamedAssistantMessageExecutionContext {
  isCurrentRequest: () => boolean;
  isActiveRequest: () => boolean;
}

export interface StreamedAssistantMessageSuccessContext {
  sessionId: string;
  resolvedSessionId: string;
}

interface RunStreamedAssistantMessageOptions {
  sessionId: string;
  assistantMessageId: string;
  controller?: AbortController;
  execute: (
    onChunk: (chunk: string) => void,
    signal: AbortSignal,
    context: StreamedAssistantMessageExecutionContext,
  ) => Promise<string>;
  updateMessage: (sessionId: string, messageId: string, content: string) => void;
  completeMessage: (sessionId: string, messageId: string) => void;
  setSessionLoading: (sessionId: string, loading: boolean) => void;
  setError: (error: string | null) => void;
  buildErrorPayload: (error: unknown) => ChatErrorPayload;
  handleError?: (error: unknown) => boolean;
  createEmptyResponseError?: () => Error;
  onSuccess?: (context: StreamedAssistantMessageSuccessContext) => void | Promise<void>;
}

export async function runStreamedAssistantMessage({
  sessionId,
  assistantMessageId,
  controller: providedController,
  execute,
  updateMessage,
  completeMessage,
  setSessionLoading,
  setError,
  buildErrorPayload,
  handleError,
  createEmptyResponseError,
  onSuccess,
}: RunStreamedAssistantMessageOptions): Promise<StreamedAssistantMessageStatus> {
  const controller = providedController ?? requestManager.start(sessionId);

  const isCurrentRequest = () => requestManager.isCurrent(sessionId, controller);
  const isCancelledRequest = () => controller.signal.aborted || !isCurrentRequest();
  const isActiveRequest = () => !controller.signal.aborted && isCurrentRequest();

  if (isActiveRequest()) {
    setSessionLoading(sessionId, true);
    setError(null);
  }

  let lastCommittedContent = '';
  let successContext: StreamedAssistantMessageSuccessContext | null = null;
  let didClearSessionLoading = false;
  const clearSessionLoadingIfCurrent = () => {
    if (didClearSessionLoading || !isCurrentRequest()) {
      return;
    }
    didClearSessionLoading = true;
    setSessionLoading(sessionId, false);
  };
  const streamScheduler = createChunkScheduler((nextContent) => {
    if (!isActiveRequest()) {
      return;
    }
    lastCommittedContent = nextContent;
    updateMessage(sessionId, assistantMessageId, nextContent);
  });

  let lastStreamedContent = '';
  let status: StreamedAssistantMessageStatus = 'completed';

  try {
    if (isCancelledRequest()) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const returnedContent = await execute((chunk) => {
      if (!isActiveRequest()) {
        return;
      }
      const safeChunk = escapeUntrustedErrorTags(chunk);
      lastStreamedContent = safeChunk;
      streamScheduler.push(safeChunk);
    }, controller.signal, { isCurrentRequest, isActiveRequest });

    if (isCancelledRequest()) {
      throw new DOMException('Aborted', 'AbortError');
    }

    clearSessionLoadingIfCurrent();
    streamScheduler.flushNow();
    resolveAssistantContent(escapeUntrustedErrorTags(returnedContent), lastStreamedContent, (content) => {
      lastStreamedContent = content;
      lastCommittedContent = content;
      updateMessage(sessionId, assistantMessageId, content);
    }, createEmptyResponseError);
    completeMessage(sessionId, assistantMessageId);
    successContext = {
      sessionId,
      resolvedSessionId: resolveSessionIdAlias(sessionId),
    };
  } catch (error) {
    clearSessionLoadingIfCurrent();
    streamScheduler.flushNow();

    if (isCancelledRequest()) {
      const contentToKeep = isCurrentRequest()
        ? lastStreamedContent || lastCommittedContent
        : lastCommittedContent;
      if (contentToKeep) {
        updateMessage(sessionId, assistantMessageId, contentToKeep);
      }
      completeMessage(sessionId, assistantMessageId);
      status = 'aborted';
    } else {
      if (handleError?.(error)) {
        status = 'failed';
        return status;
      }
      const { message, xml } = buildErrorPayload(error);
      setError(message);
      updateMessage(sessionId, assistantMessageId, xml);
      completeMessage(sessionId, assistantMessageId);
      status = 'failed';
    }
  } finally {
    streamScheduler.cancel();
    clearSessionLoadingIfCurrent();
    requestManager.finish(sessionId, controller);
  }

  if (status === 'completed' && onSuccess && successContext) {
    try {
      await onSuccess(successContext);
    } catch (error) {
    }
  }

  return status;
}

import { useCallback, useRef, useState } from 'react';
import { requestManager } from '@/lib/ai/requestManager';
import { resolveSessionIdAlias } from '@/lib/ai/sessionIdAliases';
import { useAIUIStore } from '@/stores/ai/chatState';
import { actions as aiActions } from '@/stores/useAIStore';
import {
  buildRecalledDraft,
  isManagedQuotaError,
  markManagedQuotaExhausted,
  type ActiveComposerRequest,
  type PendingRecalledComposerDraft,
  type RecalledComposerDraft,
} from './requestLifecycle';
import { deleteCreatedRequestContextAttachments } from './requestContextAttachmentCleanup';

interface ActiveComposerRequestOptions {
  setError: (error: string | null) => void;
  setSessionLoading: (sessionId: string, loading: boolean) => void;
}

export function useActiveComposerRequest({
  setError,
  setSessionLoading,
}: ActiveComposerRequestOptions) {
  const activeComposerRequestRef = useRef<ActiveComposerRequest | null>(null);
  const recalledDraftSequenceRef = useRef(0);
  const [recalledComposerDraft, setRecalledComposerDraft] = useState<PendingRecalledComposerDraft | null>(null);

  const clearActiveComposerRequest = useCallback((request: ActiveComposerRequest | null) => {
    if (request && activeComposerRequestRef.current !== request) {
      return;
    }
    activeComposerRequestRef.current = null;
  }, []);

  const publishRecalledComposerDraft = useCallback((draft: RecalledComposerDraft) => {
    recalledDraftSequenceRef.current += 1;
    setRecalledComposerDraft({
      ...draft,
      id: recalledDraftSequenceRef.current,
    });
  }, []);

  const clearRecalledComposerDraft = useCallback((id?: number) => {
    setRecalledComposerDraft((current) => {
      if (!current) {
        return null;
      }
      return id == null || current.id === id ? null : current;
    });
  }, []);

  const cleanupRetractedRequestContext = useCallback((request: ActiveComposerRequest) => {
    const filenames = request.createdContextAttachmentFilenames;
    request.createdContextAttachmentFilenames = [];
    void deleteCreatedRequestContextAttachments(filenames);
  }, []);

  const handleManagedQuotaErrorForComposer = useCallback((
    request: ActiveComposerRequest,
    error: unknown,
  ): boolean => {
    if (!isManagedQuotaError(error)) {
      return false;
    }

    markManagedQuotaExhausted();
    setError(null);
    const recalledFromStore = request.userMessageId
      ? aiActions.retractPendingUserRequest(
          request.sessionId,
          request.userMessageId,
          request.assistantMessageId,
        )
      : null;
    if (request.userMessageId && recalledFromStore === null) {
      if (request.assistantMessageId) {
        aiActions.completeMessage(request.sessionId, request.assistantMessageId);
      }
      clearActiveComposerRequest(request);
      return true;
    }

    const recalledDraft = buildRecalledDraft(request, recalledFromStore ?? undefined);
    if (recalledFromStore !== null) {
      cleanupRetractedRequestContext(request);
    }
    if (
      recalledFromStore !== null ||
      recalledDraft.message.trim() ||
      recalledDraft.attachments.length > 0 ||
      recalledDraft.noteMentions.length > 0
    ) {
      publishRecalledComposerDraft(recalledDraft);
    }
    clearActiveComposerRequest(request);
    return true;
  }, [cleanupRetractedRequestContext, clearActiveComposerRequest, publishRecalledComposerDraft, setError]);

  const handleManagedQuotaErrorForVersionRollback = useCallback((
    sessionId: string,
    messageId: string,
    previousVersionIndex: number,
    error: unknown,
  ): boolean => {
    if (!isManagedQuotaError(error)) {
      return false;
    }

    markManagedQuotaExhausted();
    setError(null);
    aiActions.switchMessageVersion(sessionId, messageId, Math.max(0, previousVersionIndex));
    return true;
  }, [setError]);

  const stop = useCallback(() => {
    const sessionId = useAIUIStore.getState().currentSessionId;
    if (!sessionId) {
      return;
    }
    const activeComposerRequest = activeComposerRequestRef.current;
    const shouldClearComposerRequest =
      !!activeComposerRequest &&
      resolveSessionIdAlias(activeComposerRequest.sessionId) === resolveSessionIdAlias(sessionId);
    requestManager.abort(sessionId);
    setSessionLoading(sessionId, false);
    if (shouldClearComposerRequest) {
      activeComposerRequestRef.current = null;
    }
  }, [setSessionLoading]);

  const stopAndRecallLastUserMessage = useCallback((fallbackMessage?: string): RecalledComposerDraft | null => {
    const sessionId = useAIUIStore.getState().currentSessionId;
    if (!sessionId) {
      return null;
    }

    const activeComposerRequest = activeComposerRequestRef.current;
    const resolvedComposerSessionId = activeComposerRequest
      ? resolveSessionIdAlias(activeComposerRequest.sessionId)
      : null;
    const isSameComposerSession =
      !!activeComposerRequest &&
      resolvedComposerSessionId === resolveSessionIdAlias(sessionId);
    const canRecallActiveRequest =
      isSameComposerSession &&
      requestManager.isCurrent(activeComposerRequest.sessionId, activeComposerRequest.controller);

    requestManager.abort(sessionId);
    setSessionLoading(sessionId, false);

    if (!canRecallActiveRequest || !activeComposerRequest) {
      if (isSameComposerSession) {
        clearActiveComposerRequest(activeComposerRequest);
      }
      return null;
    }

    const recalledFromStore = activeComposerRequest.userMessageId
      ? aiActions.retractPendingUserRequest(
          resolvedComposerSessionId || activeComposerRequest.sessionId,
          activeComposerRequest.userMessageId,
          activeComposerRequest.assistantMessageId,
        )
      : null;
    clearActiveComposerRequest(activeComposerRequest);

    const recalledDraft = buildRecalledDraft(activeComposerRequest, fallbackMessage);

    if (recalledFromStore !== null) {
      cleanupRetractedRequestContext(activeComposerRequest);
      return recalledDraft;
    }

    if (
      !activeComposerRequest.userMessageId &&
      (recalledDraft.message.trim() ||
        recalledDraft.attachments.length > 0 ||
        recalledDraft.noteMentions.length > 0)
    ) {
      return recalledDraft;
    }

    return null;
  }, [cleanupRetractedRequestContext, clearActiveComposerRequest, setSessionLoading]);

  return {
    activeComposerRequestRef,
    recalledComposerDraft,
    clearActiveComposerRequest,
    clearRecalledComposerDraft,
    handleManagedQuotaErrorForComposer,
    handleManagedQuotaErrorForVersionRollback,
    stop,
    stopAndRecallLastUserMessage,
  };
}

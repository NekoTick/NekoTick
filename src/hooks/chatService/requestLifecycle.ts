import { AIErrorType } from '@/lib/ai/types';
import { getUserFacingAIError } from '@/lib/ai/errors';
import { requestManager } from '@/lib/ai/requestManager';
import { isManagedProviderId } from '@/lib/ai/managedService';
import { isManagedBudgetExhausted } from '@/lib/ai/managedQuota';
import { applyManagedQuotaExhaustedSnapshot, useManagedAIStore } from '@/stores/useManagedAIStore';
import type { Attachment } from '@/lib/storage/attachmentStorage';
import type { NoteMentionReference } from '@/lib/ai/noteMentions';

export interface ActiveComposerRequest {
  sessionId: string;
  controller: AbortController;
  submittedText: string;
  submittedAttachments: Attachment[];
  submittedNoteMentions: NoteMentionReference[];
  createdContextAttachmentFilenames?: string[];
  userMessageId: string | null;
  assistantMessageId: string | null;
}

export interface RecalledComposerDraft {
  message: string;
  attachments: Attachment[];
  noteMentions: NoteMentionReference[];
}

export interface PendingRecalledComposerDraft extends RecalledComposerDraft {
  id: number;
}

export function createEmptyResponseError(providerId: string): Error {
  return new Error(isManagedProviderId(providerId) ? 'UPSTREAM_UNAVAILABLE' : 'The model returned an empty response.');
}

export function throwIfChatRequestAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  throw new DOMException('Aborted', 'AbortError');
}

export function isChatRequestCancelled(sessionId: string, controller: AbortController): boolean {
  return controller.signal.aborted || !requestManager.isCurrent(sessionId, controller);
}

export function canPersistAbortedRequestTranscript(
  sessionId: string,
  controller: AbortController,
): boolean {
  return controller.signal.aborted
    && requestManager.isLatest(controller)
    && !requestManager.isGenerating(sessionId);
}

export function finishPreStartedChatRequest(
  sessionId: string,
  controller: AbortController,
  setSessionLoading: (sessionId: string, loading: boolean) => void,
) {
  if (requestManager.isCurrent(sessionId, controller)) {
    setSessionLoading(sessionId, false);
  }
  requestManager.finish(sessionId, controller);
}

function shouldBlockManagedRequestForKnownBudget(providerId: string): boolean {
  if (!isManagedProviderId(providerId)) {
    return false;
  }

  const { budget } = useManagedAIStore.getState();
  return isManagedBudgetExhausted(budget);
}

export async function shouldBlockManagedRequestAfterBudgetRefresh(providerId: string): Promise<boolean> {
  if (!shouldBlockManagedRequestForKnownBudget(providerId)) {
    return false;
  }

  try {
    await useManagedAIStore.getState().refreshBudget();
  } catch {
    // Keep the known exhausted state below when the refresh fails.
  }

  return isManagedBudgetExhausted(useManagedAIStore.getState().budget);
}

export function markManagedQuotaExhausted(): void {
  applyManagedQuotaExhaustedSnapshot();
}

export function isManagedQuotaError(error: unknown): boolean {
  return getUserFacingAIError(error).type === AIErrorType.QUOTA_EXHAUSTED;
}

export function buildRecalledDraft(
  request: ActiveComposerRequest,
  fallbackMessage?: string,
): RecalledComposerDraft {
  const fallback = fallbackMessage?.trim()
    ? fallbackMessage
    : request.submittedText;
  return {
    message: fallback.trim() ? fallback : request.submittedText,
    attachments: request.submittedAttachments,
    noteMentions: request.submittedNoteMentions,
  };
}

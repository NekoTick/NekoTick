import { ACCOUNT_AUTH_INVALIDATED_EVENT, ACCOUNT_LOGIN_REQUESTED_EVENT } from '@/lib/account/sessionEvent';
import { buildErrorTag } from '@/lib/ai/errorTag';
import {
  MAX_USER_FACING_AI_ERROR_MESSAGE_CHARS,
  normalizeUserFacingMessage,
} from '@/lib/ai/errorClassification';
import { getUserFacingAIError } from '@/lib/ai/errors';
import { AIErrorType } from '@/lib/ai/types';
import { useAIUIStore } from '@/stores/ai/chatState';
import { applyManagedQuotaExhaustedSnapshot } from '@/stores/useManagedAIStore';

function primitiveToString(value: unknown): string {
  if (value == null) {
    return '';
  }
  switch (typeof value) {
    case 'string':
      return value;
    case 'number':
    case 'boolean':
    case 'bigint':
    case 'symbol':
      return String(value);
    default:
      return '';
  }
}

export function extractRawErrorMessage(error: unknown): string {
  let message: unknown;
  if (error && typeof error === 'object') {
    try {
      message = (error as { message?: unknown }).message;
    } catch {
      message = undefined;
    }
  }
  const normalized = normalizeUserFacingMessage(
    typeof message === 'string' ? message : primitiveToString(error),
  ).slice(0, MAX_USER_FACING_AI_ERROR_MESSAGE_CHARS);
  return normalized || 'AI request failed.';
}

function dispatchAccountAuthInvalidated() {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event(ACCOUNT_AUTH_INVALIDATED_EVENT));
}

export function requestManagedAccountSignIn(sessionId?: string | null) {
  if (sessionId) {
    useAIUIStore.getState().setAuthPromptSessionId(sessionId);
  }
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event(ACCOUNT_LOGIN_REQUESTED_EVENT));
}

export function buildChatErrorPayload(error: unknown, managed = true) {
  const normalized = getUserFacingAIError(error, { managed });
  if (managed && normalized.type === AIErrorType.QUOTA_EXHAUSTED) {
    applyManagedQuotaExhaustedSnapshot();
  }
  if (managed && normalized.type === AIErrorType.AUTH_ERROR) {
    dispatchAccountAuthInvalidated();
  }

  return {
    message: normalized.message,
    xml: buildErrorTag(normalized.type, normalized.code, normalized.message),
  };
}

export function markManagedAuthPromptForError(sessionId: string, error: unknown, managed: boolean) {
  if (!managed) {
    return;
  }

  const normalized = getUserFacingAIError(error, { managed: true });
  if (normalized.type === AIErrorType.AUTH_ERROR) {
    requestManagedAccountSignIn(sessionId);
  }
}

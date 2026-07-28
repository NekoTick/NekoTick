import { ACCOUNT_AUTH_INVALIDATED_EVENT, ACCOUNT_LOGIN_REQUESTED_EVENT } from '@/lib/account/sessionEvent';
import { buildErrorTag } from '@/lib/ai/errorTag';
import { getUserFacingAIError } from '@/lib/ai/errors';
import { AIErrorType } from '@/lib/ai/types';
import { isDesktopCustomProviderConnectionFailureMessage } from '@/lib/ai/userFacingErrorMessages';
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
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
    const message = (error as { message: string }).message.trim();
    if (message) {
      return message;
    }
  }
  return primitiveToString(error).trim() || 'AI request failed.';
}

function dispatchAccountAuthInvalidated(reason?: 'device_limit') {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(reason
    ? new CustomEvent(ACCOUNT_AUTH_INVALIDATED_EVENT, { detail: { reason } })
    : new Event(ACCOUNT_AUTH_INVALIDATED_EVENT));
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
  if (!managed) {
    const message = extractRawErrorMessage(error);
    if (isDesktopCustomProviderConnectionFailureMessage(message)) {
      const normalized = getUserFacingAIError(error);
      return {
        message: normalized.message,
        xml: buildErrorTag(normalized.type, normalized.code, normalized.message),
      };
    }

    return {
      message,
      xml: buildErrorTag('custom_provider', '', message),
    };
  }

  const normalized = getUserFacingAIError(error);
  if (normalized.type === AIErrorType.QUOTA_EXHAUSTED) {
    applyManagedQuotaExhaustedSnapshot();
  }
  if (normalized.type === AIErrorType.AUTH_ERROR) {
    dispatchAccountAuthInvalidated(
      normalized.code === 'session_device_limit' ? 'device_limit' : undefined,
    );
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

  const normalized = getUserFacingAIError(error);
  if (normalized.type === AIErrorType.AUTH_ERROR) {
    requestManagedAccountSignIn(sessionId);
  }
}

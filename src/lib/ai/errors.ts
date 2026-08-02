import { AIError, AIErrorType } from './types';
import { translate } from '@/lib/i18n';
import {
  getSpecificUserFacingOverride,
  getUserFacingMessage,
  type UserFacingAIError,
} from './userFacingErrorMessages';
import {
  extractErrorCode,
  extractErrorDetails,
  extractErrorMessage,
  inferErrorTypeByMessage,
  inferErrorTypeByStatus,
  isLikelyHtmlErrorDocument,
  isRecord,
  normalizeUserFacingMessage,
  primitiveToString,
  readErrorField,
} from './errorClassification';

export {
  MAX_USER_FACING_AI_ERROR_CODE_CHARS,
  MAX_USER_FACING_AI_ERROR_MESSAGE_CHARS,
} from './errorClassification';

export function createAIError(
  type: AIErrorType,
  message: string,
  details?: string,
  statusCode?: number
): AIError {
  return { type, message, details, statusCode }
}

export function parseAPIError(error: any): AIError {
  const errorType = readErrorField(error, 'type');
  const errorMessage = readErrorField(error, 'message');
  if (typeof errorType === 'string' && typeof errorMessage === 'string') {
    if (Object.values(AIErrorType).includes(errorType as AIErrorType)) {
      const details = readErrorField(error, 'details');
      const statusCode = readErrorField(error, 'statusCode');
      return createAIError(
        errorType as AIErrorType,
        errorMessage,
        typeof details === 'string' ? details : undefined,
        typeof statusCode === 'number' ? statusCode : undefined
      )
    }
  }

  if (typeof errorMessage === 'string') {
    const message = errorMessage
    const lowerMsg = message.toLowerCase();
    const name = readErrorField(error, 'name');
    const errorName = typeof name === 'string'
      ? name
      : '';

    let type = inferErrorTypeByMessage(message);
    if (
      type === AIErrorType.UNKNOWN &&
      (lowerMsg.includes('timeout') || lowerMsg.includes('abort') || errorName === 'AbortError')
    ) {
      type = AIErrorType.TIMEOUT;
    }

    return createAIError(type, message);
  }

  return createAIError(
    AIErrorType.UNKNOWN,
    primitiveToString(error) || 'Unknown error'
  );
}

function extractHTTPErrorMessage(body: any): string | undefined {
  if (typeof body === 'string' && body.trim()) {
    const trimmed = body.trim()
    return isLikelyHtmlErrorDocument(trimmed) ? undefined : trimmed
  }

  if (!isRecord(body)) {
    return undefined
  }

  const nestedError = readErrorField(body, 'error')
  if (typeof nestedError === 'string' && nestedError.trim()) {
    return nestedError.trim()
  }
  if (isRecord(nestedError)) {
    const message = readErrorField(nestedError, 'message')
    const error = readErrorField(nestedError, 'error')
    const nestedMessage =
      typeof message === 'string' && message.trim()
        ? message.trim()
        : typeof error === 'string' && error.trim()
          ? error.trim()
          : ''
    if (nestedMessage) {
      return nestedMessage
    }
  }

  for (const key of ['message', 'msg', 'detail', 'error_description'] as const) {
    const value = readErrorField(body, key)
    if (typeof value === 'string' && value.trim()) {
      const trimmed = value.trim()
      return isLikelyHtmlErrorDocument(trimmed) ? undefined : trimmed
    }
  }

  return undefined
}

export function parseHTTPError(status: number, body?: any): AIError {
  const apiMessage = extractHTTPErrorMessage(body);

  switch (status) {
    case 401:
      return createAIError(
        AIErrorType.AUTH_ERROR,
        apiMessage || translate('chat.error.authFailed'),
        undefined,
        status
      )
    case 403: {
      const inferredType = apiMessage ? inferErrorTypeByMessage(apiMessage) : AIErrorType.UNKNOWN
      return createAIError(
        inferredType === AIErrorType.AUTH_ERROR ? AIErrorType.AUTH_ERROR : AIErrorType.SERVER_ERROR,
        apiMessage || translate('chat.error.upstreamUnavailable'),
        undefined,
        status
      )
    }
    case 429:
      return createAIError(
        AIErrorType.RATE_LIMIT,
        apiMessage || translate('chat.error.upstreamRateLimited'),
        undefined,
        status
      )
    case 400:
      return createAIError(
        AIErrorType.INVALID_REQUEST,
        apiMessage || translate('chat.error.invalidRequest'),
        undefined,
        status
      )
    case 500:
    case 502:
    case 503:
    case 504:
      return createAIError(
        AIErrorType.SERVER_ERROR,
        apiMessage || translate('chat.error.upstreamUnavailable'),
        undefined,
        status
      )
    default:
      return createAIError(
        AIErrorType.UNKNOWN,
        apiMessage || translate('chat.error.upstreamUnavailable'),
        undefined,
        status
      )
  }
}

export function getUserFacingAIError(
  error: unknown,
  options: { managed?: boolean } = {},
): UserFacingAIError {
  const managed = options.managed === true
  const parsed = parseAPIError(error)
  const message = normalizeUserFacingMessage(extractErrorMessage(error))
  const details = normalizeUserFacingMessage(extractErrorDetails(error))
  const displayMessage = details || message
  const code = extractErrorCode(error)
  const specificOverride = getSpecificUserFacingOverride(displayMessage, code, managed)
  if (specificOverride) {
    return specificOverride
  }

  const statusType = inferErrorTypeByStatus(code)
  const messageType = inferErrorTypeByMessage(displayMessage)

  let type = parsed.type
  if (statusType) {
    type = statusType
  } else if (type === AIErrorType.UNKNOWN && messageType !== AIErrorType.UNKNOWN) {
    type = messageType
  }

  let normalizedType = type === AIErrorType.UNKNOWN ? AIErrorType.SERVER_ERROR : type
  const customProviderAuthFailure = !managed && normalizedType === AIErrorType.AUTH_ERROR
  if (customProviderAuthFailure) {
    normalizedType = AIErrorType.SERVER_ERROR
  } else if (!managed && normalizedType === AIErrorType.QUOTA_EXHAUSTED) {
    normalizedType = AIErrorType.RATE_LIMIT
  }

  return {
    type: normalizedType,
    code,
    message: customProviderAuthFailure
      ? translate('chat.error.authFailed')
      : getUserFacingMessage(normalizedType),
  }
}

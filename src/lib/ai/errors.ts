import { AIError, AIErrorType } from './types';
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
    return body
  }

  if (!isRecord(body)) {
    return undefined
  }

  const nestedError = readErrorField(body, 'error')
  if (typeof nestedError === 'string' && nestedError.trim()) {
    return nestedError
  }
  if (isRecord(nestedError)) {
    const message = readErrorField(nestedError, 'message')
    const error = readErrorField(nestedError, 'error')
    const nestedMessage =
      typeof message === 'string' && message.trim()
        ? message
        : typeof error === 'string' && error.trim()
          ? error
          : ''
    if (nestedMessage) {
      return nestedMessage
    }
  }

  for (const key of ['message', 'msg', 'detail', 'error_description'] as const) {
    const value = readErrorField(body, key)
    if (typeof value === 'string' && value.trim()) {
      return value
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
        apiMessage || `HTTP ${status}`,
        undefined,
        status
      )
    case 403: {
      const inferredType = apiMessage ? inferErrorTypeByMessage(apiMessage) : AIErrorType.UNKNOWN
      return createAIError(
        inferredType === AIErrorType.AUTH_ERROR ? AIErrorType.AUTH_ERROR : AIErrorType.SERVER_ERROR,
        apiMessage || `HTTP ${status}`,
        undefined,
        status
      )
    }
    case 429:
      return createAIError(
        AIErrorType.RATE_LIMIT,
        apiMessage || `HTTP ${status}`,
        undefined,
        status
      )
    case 400:
      return createAIError(
        AIErrorType.INVALID_REQUEST,
        apiMessage || `HTTP ${status}`,
        undefined,
        status
      )
    case 500:
    case 502:
    case 503:
    case 504:
      return createAIError(
        AIErrorType.SERVER_ERROR,
        apiMessage || `HTTP ${status}`,
        undefined,
        status
      )
    default:
      return createAIError(
        AIErrorType.UNKNOWN,
        apiMessage || `HTTP ${status}`,
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
  const rawDetails = readErrorField(error, 'details')
  const rawMessage = readErrorField(error, 'message')
  const customProviderMessage = typeof rawDetails === 'string' && rawDetails
    ? rawDetails
    : typeof rawMessage === 'string' && rawMessage
      ? rawMessage
      : primitiveToString(error)
  const message = normalizeUserFacingMessage(extractErrorMessage(error))
  const details = normalizeUserFacingMessage(extractErrorDetails(error))
  const displayMessage = details || message
  const code = extractErrorCode(error)
  const statusType = inferErrorTypeByStatus(code)
  const messageType = inferErrorTypeByMessage(displayMessage)

  let type = parsed.type
  if (statusType) {
    type = statusType
  } else if (type === AIErrorType.UNKNOWN && messageType !== AIErrorType.UNKNOWN) {
    type = messageType
  }

  const normalizedType = type === AIErrorType.UNKNOWN ? AIErrorType.SERVER_ERROR : type
  const specificOverride = getSpecificUserFacingOverride(displayMessage, code, managed)
  if (!managed) {
    return {
      type: specificOverride?.type ?? normalizedType,
      code,
      message: customProviderMessage || parsed.message || 'AI request failed.',
    }
  }

  if (specificOverride) {
    return specificOverride
  }

  return {
    type: normalizedType,
    code,
    message: getUserFacingMessage(normalizedType),
  }
}

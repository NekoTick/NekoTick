import { translate } from '@/lib/i18n';
import { AIErrorType } from './types';
import { normalizeUserFacingMessage } from './errorClassification';
import { AI_PROVIDER_CONNECTION_FAILURE_CODE } from './providerHttpErrors';

export interface UserFacingAIError {
  type: AIErrorType
  code: string
  message: string
}

const UNSUPPORTED_MODEL_INPUT_CODES = new Set([
  'unsupported_message_content',
  'unsupported_model_input',
])
const KNOWN_MANAGED_BUSINESS_ERRORS = [
  'Points exhausted',
  'No active points balance',
  'Insufficient remaining points',
]

const MANAGED_UPSTREAM_UNAVAILABLE_CODES = new Set([
  'upstream_unavailable',
  'UPSTREAM_UNAVAILABLE',
])
const MANAGED_UPSTREAM_RATE_LIMITED_CODES = new Set([
  'upstream_rate_limited',
  'UPSTREAM_RATE_LIMITED',
])
const MANAGED_QUOTA_EXHAUSTED_CODES = new Set([
  'points_exhausted',
  'inactive_points',
  'insufficient_points',
])
const MANAGED_INVALID_REQUEST_CODES = new Set([
  'invalid_request',
  'INVALID_REQUEST',
])

export function isDesktopCustomProviderConnectionFailureMessage(message: string): boolean {
  const normalizedMessage = normalizeUserFacingMessage(message).toLowerCase()
  return normalizedMessage.includes(AI_PROVIDER_CONNECTION_FAILURE_CODE.toLowerCase())
}

export function getUserFacingMessage(type: AIErrorType): string {
  switch (type) {
    case AIErrorType.NETWORK_ERROR:
      return translate('chat.error.network')
    case AIErrorType.TIMEOUT:
      return translate('chat.error.timeout')
    case AIErrorType.AUTH_ERROR:
      return translate('chat.error.authExpired')
    case AIErrorType.QUOTA_EXHAUSTED:
      return translate('chat.error.pointsExhausted')
    case AIErrorType.RATE_LIMIT:
      return translate('chat.error.upstreamRateLimited')
    case AIErrorType.INVALID_REQUEST:
      return translate('chat.error.invalidRequest')
    case AIErrorType.SERVER_ERROR:
    case AIErrorType.UNKNOWN:
    default:
      return translate('chat.error.upstreamUnavailable')
  }
}

export function getSpecificUserFacingOverride(
  message: string,
  code: string,
  managed: boolean,
): UserFacingAIError | null {
  const normalized = normalizeUserFacingMessage(message).toLowerCase()
  const normalizedCode = code.trim()
  const normalizedCodeLower = normalizedCode.toLowerCase()

  if (
    normalizedCodeLower === 'session_device_limit' ||
    normalized.includes('session signed out because device limit was reached')
  ) {
    return {
      type: AIErrorType.AUTH_ERROR,
      code: normalizedCode || 'session_device_limit',
      message: translate('account.error.deviceLimit'),
    }
  }

  if (isDesktopCustomProviderConnectionFailureMessage(message)) {
    return {
      type: AIErrorType.NETWORK_ERROR,
      code: normalizedCode,
      message: translate('chat.error.customProviderConnectionFailed'),
    }
  }

  if (normalized === 'web search is unavailable for this model.') {
    return {
      type: AIErrorType.INVALID_REQUEST,
      code: normalizedCode,
      message: translate('chat.webSearch.unavailableForModel'),
    }
  }

  if (
    normalized === 'unsupported_model_input' ||
    normalized === 'unsupported_message_content' ||
    UNSUPPORTED_MODEL_INPUT_CODES.has(normalizedCodeLower)
  ) {
    return {
      type: AIErrorType.INVALID_REQUEST,
      code: normalizedCode || 'unsupported_model_input',
      message: translate('chat.error.managedTextOnly'),
    }
  }

  if (
    normalized === 'invalid_request' ||
    MANAGED_INVALID_REQUEST_CODES.has(normalizedCode) ||
    MANAGED_INVALID_REQUEST_CODES.has(normalizedCodeLower)
  ) {
    return {
      type: AIErrorType.INVALID_REQUEST,
      code: normalizedCode || 'invalid_request',
      message: getUserFacingMessage(AIErrorType.INVALID_REQUEST),
    }
  }

  if (
    MANAGED_UPSTREAM_RATE_LIMITED_CODES.has(message) ||
    MANAGED_UPSTREAM_RATE_LIMITED_CODES.has(normalizedCode) ||
    normalized === 'upstream_rate_limited'
  ) {
    return {
      type: AIErrorType.RATE_LIMIT,
      code: normalizedCode || 'upstream_rate_limited',
      message: translate('chat.error.upstreamRateLimited'),
    }
  }

  if (
    MANAGED_UPSTREAM_UNAVAILABLE_CODES.has(message) ||
    MANAGED_UPSTREAM_UNAVAILABLE_CODES.has(normalizedCode) ||
    normalized === 'upstream_unavailable'
  ) {
    return {
      type: AIErrorType.SERVER_ERROR,
      code: normalizedCode || 'upstream_unavailable',
      message: translate('chat.error.upstreamUnavailable'),
    }
  }

  if (managed) {
    for (const knownMessage of KNOWN_MANAGED_BUSINESS_ERRORS) {
      if (
        normalized.includes(knownMessage.toLowerCase()) ||
        MANAGED_QUOTA_EXHAUSTED_CODES.has(normalizedCode)
      ) {
        return {
          type: AIErrorType.QUOTA_EXHAUSTED,
          code: code || 'quota_exhausted',
          message: translate('chat.error.pointsExhausted'),
        }
      }
    }
  }

  if (
    managed &&
    normalized.includes('managed api failed with status 403') &&
    (normalized.includes('bad_response_status_code') || normalized.includes('openai_error'))
  ) {
    return {
      type: AIErrorType.SERVER_ERROR,
      code: '403',
      message: translate('chat.error.upstreamUnavailable'),
    }
  }

  return null
}

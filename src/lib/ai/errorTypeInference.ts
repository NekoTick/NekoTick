import { AIErrorType } from './types';

export function inferErrorTypeByStatus(code: string): AIErrorType | null {
  const status = Number(code);
  if (!Number.isFinite(status)) {
    return null;
  }

  switch (status) {
    case 400:
      return AIErrorType.INVALID_REQUEST;
    case 401:
      return AIErrorType.AUTH_ERROR;
    case 408:
      return AIErrorType.TIMEOUT;
    case 429:
      return AIErrorType.RATE_LIMIT;
    case 500:
    case 502:
    case 503:
    case 504:
    case 520:
    case 521:
    case 522:
    case 523:
    case 524:
      return AIErrorType.SERVER_ERROR;
    default:
      return null;
  }
}

function includesAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

export function inferErrorTypeByMessage(message: string): AIErrorType {
  const normalized = message.trim().toLowerCase();
  if (!normalized) {
    return AIErrorType.UNKNOWN;
  }

  if (
    includesAny(normalized, [
      'timeout',
      'timed out',
      'deadline exceeded',
      'request timeout',
      'operation was aborted',
      'the ai request timed out',
    ])
  ) {
    return AIErrorType.TIMEOUT;
  }

  if (
    includesAny(normalized, [
      'ai_provider_connection_failed',
      'failed to fetch',
      'fetch failed',
      'load failed',
      'error sending request',
      'sending request for url',
      'networkerror',
      'network error',
      'network request failed',
      'internet disconnected',
      'connection reset',
      'connection refused',
      'econnreset',
      'econnrefused',
      'enotfound',
      'socket hang up',
    ])
  ) {
    return AIErrorType.NETWORK_ERROR;
  }

  if (
    includesAny(normalized, [
      'unauthorized',
      'forbidden',
      'sign-in required',
      'sign in required',
      'login required',
      'log in required',
      'authentication',
      'authorization',
      'unauthenticated',
      'missing session token',
      'invalid session token',
      'session verification failed',
      'session expired',
      'managed api session expired',
      'vlaina sign-in required',
      'token expired',
    ])
  ) {
    return AIErrorType.AUTH_ERROR;
  }

  if (
    includesAny(normalized, [
      'rate limit',
      'too many requests',
      'quota exceeded',
      'request limit',
    ])
  ) {
    return AIErrorType.RATE_LIMIT;
  }

  if (
    includesAny(normalized, [
      'invalid request',
      'bad request',
      'invalid input',
      'malformed',
      'text-only',
      'text only',
      'unsupported',
    ])
  ) {
    return AIErrorType.INVALID_REQUEST;
  }

  if (
    includesAny(normalized, [
      'server error',
      'internal server error',
      'service unavailable',
      'temporarily unavailable',
      'bad gateway',
      'gateway timeout',
      'upstream',
      'channel',
      'provider',
    ])
  ) {
    return AIErrorType.SERVER_ERROR;
  }

  return AIErrorType.UNKNOWN;
}

import { readErrorField } from './errorClassification';
import { parseAPIError } from './errors';
import { AIErrorType, type AIModel, type Provider } from './types';

const MAX_ENDPOINT_ERROR_STATUS_STRING_CHARS = 16;
const MAX_ENDPOINT_ERROR_CODE_STRING_CHARS = 128;
const MAX_ENDPOINT_ERROR_TEXT_CHARS = 4096;
const ENDPOINT_FALLBACK_STATUS_CODES = new Set([400, 404, 405, 422]);
const ENDPOINT_MISMATCH_STATUS_CODE = 403;
const NON_ENDPOINT_FALLBACK_ERROR_CODES = new Set([
  'upstream_rate_limited',
  'points_exhausted',
  'inactive_points',
  'insufficient_points',
]);

export type EndpointType = NonNullable<Provider['endpointType']>;

export function extractEndpointStatusCode(error: unknown): number | null {
  if (!error || typeof error !== 'object') {
    return null;
  }

  const value = readErrorField(error, 'statusCode') ?? readErrorField(error, 'status');
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.length <= MAX_ENDPOINT_ERROR_STATUS_STRING_CHARS) {
    const trimmed = value.trim();
    if (!/^\d{3}$/.test(trimmed)) {
      return null;
    }
    return Number.parseInt(trimmed, 10);
  }

  return null;
}

export function extractEndpointErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return '';
  }

  const value = readErrorField(error, 'errorCode') ?? readErrorField(error, 'code');
  return typeof value === 'string' && value.length <= MAX_ENDPOINT_ERROR_CODE_STRING_CHARS
    ? value.trim().toLowerCase()
    : '';
}

export function extractEndpointErrorText(error: unknown): string {
  if (!error) {
    return '';
  }

  const values: string[] = [];
  if (typeof error === 'object') {
    for (const key of ['message', 'details'] as const) {
      const value = readErrorField(error, key);
      if (typeof value === 'string') {
        values.push(value.slice(0, MAX_ENDPOINT_ERROR_TEXT_CHARS));
      }
    }
    const nestedError = readErrorField(error, 'error');
    if (nestedError && typeof nestedError === 'object') {
      for (const key of ['message', 'detail'] as const) {
        const value = readErrorField(nestedError, key);
        if (typeof value === 'string') {
          values.push(value.slice(0, MAX_ENDPOINT_ERROR_TEXT_CHARS));
        }
      }
    }
  }
  if (typeof error === 'string') {
    values.push(error.slice(0, MAX_ENDPOINT_ERROR_TEXT_CHARS));
  }

  return values
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_ENDPOINT_ERROR_TEXT_CHARS)
    .toLowerCase();
}

export function isNonEndpointFallbackError(error: unknown): boolean {
  return NON_ENDPOINT_FALLBACK_ERROR_CODES.has(extractEndpointErrorCode(error));
}

export function isEndpointMismatchForbiddenError(error: unknown): boolean {
  if (extractEndpointStatusCode(error) !== ENDPOINT_MISMATCH_STATUS_CODE) {
    return false;
  }

  const text = `${extractEndpointErrorCode(error)} ${extractEndpointErrorText(error)}`;
  if (!text.trim()) {
    return false;
  }

  const mentionsEndpoint =
    text.includes('/v1/chat/completions') ||
    text.includes('/chat/completions') ||
    text.includes('/v1/messages') ||
    text.includes('/messages') ||
    text.includes('endpoint') ||
    text.includes('route') ||
    text.includes('接口') ||
    text.includes('端口') ||
    text.includes('路径');
  if (!mentionsEndpoint) {
    return false;
  }

  return (
    text.includes('not support') ||
    text.includes('not_supported') ||
    text.includes('unsupported') ||
    text.includes('not found') ||
    text.includes('not_found') ||
    text.includes('invalid endpoint') ||
    text.includes('不支持') ||
    text.includes('不存在') ||
    text.includes('无效')
  );
}

export function isLikelyAnthropicModel(model: AIModel): boolean {
  const haystack = [
    model.id,
    model.apiModelId,
    model.name,
    model.group,
  ].join(' ').toLowerCase();
  return haystack.includes('claude') || haystack.includes('anthropic');
}

export function getVerifiedModelEndpointType(model: AIModel): Provider['endpointType'] | undefined {
  return model.endpointType && model.endpointTypeCheckedAt ? model.endpointType : undefined;
}

export function getVerifiedProviderEndpointType(provider: Provider): Provider['endpointType'] | undefined {
  return provider.endpointType && provider.endpointTypeCheckedAt ? provider.endpointType : undefined;
}

export function getAlternateEndpointType(endpointType: Provider['endpointType'] | undefined): EndpointType {
  return endpointType === 'anthropic' ? 'openai' : 'anthropic';
}

export function shouldTryAlternateEndpointAfterEndpointError(error: unknown): boolean {
  const statusCode = extractEndpointStatusCode(error);
  if (statusCode != null) {
    return ENDPOINT_FALLBACK_STATUS_CODES.has(statusCode) || isEndpointMismatchForbiddenError(error);
  }

  if (isNonEndpointFallbackError(error)) {
    return false;
  }

  const parsed = parseAPIError(error);
  return parsed.type === AIErrorType.INVALID_REQUEST || parsed.type === AIErrorType.UNKNOWN;
}

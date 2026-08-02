export {
  inferErrorTypeByMessage,
  inferErrorTypeByStatus,
} from './errorTypeInference';

export const MAX_USER_FACING_AI_ERROR_MESSAGE_CHARS = 8192;
export const MAX_USER_FACING_AI_ERROR_CODE_CHARS = 512;
const UNSAFE_USER_FACING_ERROR_CHARS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\uFFFD]/gu;
const USER_FACING_ERROR_CODE_PATTERN = /^[A-Za-z0-9._:-]+$/;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function readErrorField(error: unknown, key: string): unknown {
  if (!isRecord(error)) {
    return undefined;
  }
  try {
    return error[key];
  } catch {
    return undefined;
  }
}

export function isErrorNamed(error: unknown, name: string): boolean {
  return readErrorField(error, 'name') === name;
}

export function primitiveToString(value: unknown): string {
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

export function normalizeUserFacingMessage(message: string): string {
  return message.replace(UNSAFE_USER_FACING_ERROR_CHARS, ' ').replace(/\s+/g, ' ').trim();
}

function stripErrorPrefix(message: string): string {
  let next = normalizeUserFacingMessage(message);
  for (let index = 0; index < 3; index += 1) {
    const stripped = next.replace(/^Error:\s*/i, '').trim();
    if (stripped === next) break;
    next = stripped;
  }
  return next;
}

function extractMachineErrorCodeFromMessage(message: string): string {
  const normalized = normalizeUserFacingMessage(message);
  const candidates = [normalized];
  const ipcMatch = normalized.match(/^Error invoking remote method '[^']+':\s*(.+)$/i);
  if (ipcMatch?.[1]) {
    candidates.push(ipcMatch[1]);
  }

  for (const candidate of candidates) {
    const inner = stripErrorPrefix(candidate);
    if (/^[A-Z][A-Z0-9_]{2,}$/.test(inner)) {
      return inner.toLowerCase();
    }
  }

  return '';
}

export function extractErrorMessage(error: unknown): string {
  const message = readErrorField(error, 'message');
  if (typeof message === 'string') {
    return message.slice(0, MAX_USER_FACING_AI_ERROR_MESSAGE_CHARS);
  }

  return primitiveToString(error).slice(0, MAX_USER_FACING_AI_ERROR_MESSAGE_CHARS);
}

export function extractErrorDetails(error: unknown): string {
  const details = readErrorField(error, 'details');
  return typeof details === 'string' ? details.slice(0, MAX_USER_FACING_AI_ERROR_MESSAGE_CHARS) : '';
}

export function extractErrorCode(error: unknown): string {
  const message = extractErrorMessage(error);
  if (!isRecord(error)) {
    const statusMatch = message.match(/\b(?:status|http)\s+(\d{3})\b/i);
    return statusMatch?.[1] || extractMachineErrorCodeFromMessage(message);
  }

  for (const key of ['errorCode', 'code'] as const) {
    const codeValue = readErrorField(error, key);
    if (typeof codeValue === 'string' && codeValue.length <= MAX_USER_FACING_AI_ERROR_CODE_CHARS) {
      const trimmed = codeValue.trim();
      if (USER_FACING_ERROR_CODE_PATTERN.test(trimmed)) {
        return trimmed;
      }
    }
  }

  const statusCode = readErrorField(error, 'statusCode');
  const value = statusCode ?? readErrorField(error, 'status');
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'string' && value.length <= MAX_USER_FACING_AI_ERROR_CODE_CHARS) {
    const trimmed = value.trim();
    if (USER_FACING_ERROR_CODE_PATTERN.test(trimmed)) {
      return trimmed;
    }
  }

  const statusMatch = message.match(/\b(?:status|http)\s+(\d{3})\b/i);
  return statusMatch?.[1] || extractMachineErrorCodeFromMessage(message);
}

export function isLikelyHtmlErrorDocument(message: string): boolean {
  const normalized = message.slice(0, 2000).trim().toLowerCase();
  const hasCloudflareErrorShell =
    normalized.includes('cloudflare') &&
    (normalized.includes('error code') ||
      normalized.includes('cf-wrapper') ||
      normalized.includes('performance & security by'));
  return (
    normalized.startsWith('<!doctype html') ||
    normalized.startsWith('<html') ||
    normalized.includes('<title>') ||
    hasCloudflareErrorShell ||
    normalized.includes('error code 524')
  );
}

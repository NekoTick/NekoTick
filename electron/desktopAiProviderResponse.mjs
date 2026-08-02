const HTTP_HEADER_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const UNSAFE_RESPONSE_TEXT_PATTERN = /[\u0000-\u001F\u007F\u202A-\u202E\u2066-\u2069\uFFFD]/;
const BLOCKED_RESPONSE_HEADERS = new Set(['set-cookie', 'set-cookie2']);
const MAX_RESPONSE_STATUS_TEXT_CHARS = 256;
const MAX_RESPONSE_HEADER_COUNT = 128;
const MAX_RESPONSE_HEADER_NAME_CHARS = 256;
const MAX_RESPONSE_HEADER_VALUE_CHARS = 16 * 1024;
const MAX_RESPONSE_METADATA_BYTES = 64 * 1024;

export const AI_PROVIDER_INVALID_RESPONSE_METADATA_MESSAGE =
  'AI provider returned invalid response metadata.';

function normalizeResponseMetadata(response) {
  const status = response.status;
  if (!Number.isSafeInteger(status) || status < 100 || status > 599) {
    throw new Error('invalid status');
  }

  const statusText = response.statusText;
  if (
    typeof statusText !== 'string'
    || statusText.length > MAX_RESPONSE_STATUS_TEXT_CHARS
    || UNSAFE_RESPONSE_TEXT_PATTERN.test(statusText)
  ) {
    throw new Error('invalid status text');
  }

  const entries = response.headers?.entries?.();
  if (!entries || typeof entries[Symbol.iterator] !== 'function') {
    throw new Error('invalid headers');
  }

  const headers = [];
  const names = new Set();
  let headerCount = 0;
  let metadataBytes = Buffer.byteLength(statusText, 'utf8');
  for (const entry of entries) {
    headerCount += 1;
    if (headerCount > MAX_RESPONSE_HEADER_COUNT || !Array.isArray(entry) || entry.length < 2) {
      throw new Error('invalid header entry');
    }
    const [rawName, value] = entry;
    if (
      typeof rawName !== 'string'
      || rawName.length === 0
      || rawName.length > MAX_RESPONSE_HEADER_NAME_CHARS
      || !HTTP_HEADER_NAME_PATTERN.test(rawName)
      || typeof value !== 'string'
      || value.length > MAX_RESPONSE_HEADER_VALUE_CHARS
      || UNSAFE_RESPONSE_TEXT_PATTERN.test(value)
    ) {
      throw new Error('invalid header');
    }

    const name = rawName.toLowerCase();
    metadataBytes += Buffer.byteLength(name, 'utf8') + Buffer.byteLength(value, 'utf8');
    if (metadataBytes > MAX_RESPONSE_METADATA_BYTES) {
      throw new Error('response metadata is too large');
    }
    if (BLOCKED_RESPONSE_HEADERS.has(name)) continue;
    if (names.has(name)) throw new Error('duplicate header');
    names.add(name);
    headers.push([name, value]);
  }

  return { status, statusText, headers };
}

export function normalizeAiProviderResponseMetadata(response) {
  try {
    return normalizeResponseMetadata(response);
  } catch {
    throw new Error(AI_PROVIDER_INVALID_RESPONSE_METADATA_MESSAGE);
  }
}

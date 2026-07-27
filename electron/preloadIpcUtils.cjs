const IPC_REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/;
const MAX_DESKTOP_FS_WRITE_BYTES = 64 * 1024 * 1024;

function primitiveToString(value) {
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
      return null;
  }
}

function requireSafeIpcRequestId(value, label) {
  const rawId = primitiveToString(value);
  const id = rawId === null ? '' : rawId.trim();
  if (!IPC_REQUEST_ID_PATTERN.test(id)) {
    throw new Error(`${label} must contain only safe channel characters.`);
  }
  return id;
}

function assertDesktopFsWritePayloadBytes(byteLength, maxBytes = MAX_DESKTOP_FS_WRITE_BYTES) {
  if (
    !Number.isSafeInteger(byteLength) ||
    byteLength < 0 ||
    (maxBytes !== null && (
      !Number.isSafeInteger(maxBytes) ||
      maxBytes < 0 ||
      maxBytes > MAX_DESKTOP_FS_WRITE_BYTES ||
      byteLength > maxBytes
    ))
  ) {
    throw new Error('Desktop content is too large to write.');
  }
}

function isUint8ArrayPayload(value) {
  return Object.prototype.toString.call(value) === '[object Uint8Array]';
}

function normalizeDesktopBinaryWritePayload(bytes) {
  if (isUint8ArrayPayload(bytes)) {
    assertDesktopFsWritePayloadBytes(bytes.byteLength);
    return bytes;
  }

  const byteLength = bytes && typeof bytes.length === 'number'
    ? bytes.length
    : Number.NaN;
  assertDesktopFsWritePayloadBytes(byteLength);

  const normalized = new Array(byteLength);
  for (let index = 0; index < byteLength; index += 1) {
    normalized[index] = bytes[index];
  }
  return normalized;
}

function normalizeDesktopTextWritePayload(content, maxBytes) {
  const text = primitiveToString(content);
  if (text === null) {
    throw new Error('Desktop text content must be a primitive value.');
  }
  const resolvedMaxBytes = maxBytes === undefined ? MAX_DESKTOP_FS_WRITE_BYTES : maxBytes;
  if (resolvedMaxBytes !== null && text.length > resolvedMaxBytes) {
    throw new Error('Desktop content is too large to write.');
  }
  if (resolvedMaxBytes !== null) {
    assertDesktopFsWritePayloadBytes(Buffer.byteLength(text, 'utf8'), resolvedMaxBytes);
  }
  return text;
}

function callIpcCallback(callback, ...args) {
  try {
    Promise.resolve(callback(...args)).catch(() => undefined);
  } catch {
    // Renderer callbacks should not surface as preload IPC listener failures.
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);
  for (const nested of Object.values(value)) {
    deepFreeze(nested);
  }
  return value;
}

module.exports = {
  callIpcCallback,
  deepFreeze,
  normalizeDesktopBinaryWritePayload,
  normalizeDesktopTextWritePayload,
  primitiveToString,
  requireSafeIpcRequestId,
};

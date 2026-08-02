const IPC_REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/;

export function primitiveToString(value) {
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

export function requireSafeIpcRequestId(value, label) {
  const rawId = primitiveToString(value);
  const id = rawId === null ? '' : rawId.trim();
  if (!IPC_REQUEST_ID_PATTERN.test(id)) {
    throw new Error(`${label} must contain only safe channel characters.`);
  }
  return id;
}

export function getManagedErrorMessage(error) {
  try {
    if (error && typeof error === 'object') {
      const message = error.message;
      if (typeof message === 'string') {
        return message;
      }
    }
  } catch {
    return 'Unknown error';
  }
  return primitiveToString(error) || 'Unknown error';
}

export function safeSend(sender, channel, payload) {
  if (!sender || sender.isDestroyed()) {
    return false;
  }

  try {
    sender.send(channel, payload);
    return true;
  } catch {
    return false;
  }
}

export const desktopDeviceLimitErrorCode = 'session_device_limit';
export const desktopDeviceLimitErrorMessage = 'Session signed out because device limit was reached';

export function readDesktopSessionInvalidationReason(payload) {
  return payload?.errorCode === desktopDeviceLimitErrorCode ? 'device_limit' : null;
}

export async function readDesktopSessionResponseInvalidationReason(response) {
  if (response.status !== 401 && response.status !== 403) return null;
  try {
    return readDesktopSessionInvalidationReason(await response.clone().json());
  } catch {
    return null;
  }
}

export function createDesktopDeviceLimitError() {
  const error = new Error(desktopDeviceLimitErrorMessage);
  error.statusCode = 401;
  error.errorCode = desktopDeviceLimitErrorCode;
  return error;
}

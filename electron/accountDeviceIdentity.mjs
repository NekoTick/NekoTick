import electron from 'electron';
import { randomBytes } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { ensurePrivateDirectory, writePrivateFile } from './privateFilePermissions.mjs';

const { app } = electron;
const MAX_DEVICE_FILE_BYTES = 4 * 1024;
const DEVICE_ID_PATTERN = /^vld_[0-9a-f]{32}$/;

export const desktopDeviceIdHeader = 'x-vlaina-device-id';

export function buildDesktopDeviceHeaders(deviceId, initHeaders = {}) {
  if (!DEVICE_ID_PATTERN.test(deviceId ?? '')) {
    return { ...initHeaders };
  }
  return {
    ...initHeaders,
    [desktopDeviceIdHeader]: deviceId,
  };
}

async function readDeviceId(devicePath) {
  try {
    const fileInfo = await stat(devicePath);
    if (!fileInfo.isFile() || fileInfo.size > MAX_DEVICE_FILE_BYTES) return null;
    const value = JSON.parse(await readFile(devicePath, 'utf8'))?.deviceId;
    return DEVICE_ID_PATTERN.test(value ?? '') ? value : null;
  } catch {
    return null;
  }
}

export function createDesktopDeviceIdentityStore(options = {}) {
  const userDataPath = options.userDataPath ?? app.getPath('userData');
  const randomBytesImpl = options.randomBytesImpl ?? randomBytes;
  let cachedDeviceId = null;
  let pendingDeviceId = null;

  async function loadOrCreateDeviceId() {
    const accountDir = path.join(userDataPath, '.vlaina', 'app', 'account');
    const devicePath = path.join(accountDir, 'device.json');
    try {
      await ensurePrivateDirectory(accountDir);
      const storedDeviceId = await readDeviceId(devicePath);
      if (storedDeviceId) return storedDeviceId;
    } catch {
    }

    const deviceId = `vld_${randomBytesImpl(16).toString('hex')}`;
    try {
      await ensurePrivateDirectory(accountDir);
      await writePrivateFile(devicePath, JSON.stringify({ deviceId }, null, 2));
    } catch {
    }
    return deviceId;
  }

  async function getDesktopDeviceId() {
    if (cachedDeviceId) return cachedDeviceId;
    if (!pendingDeviceId) {
      pendingDeviceId = loadOrCreateDeviceId().then((deviceId) => {
        cachedDeviceId = deviceId;
        return deviceId;
      }).finally(() => {
        pendingDeviceId = null;
      });
    }
    return await pendingDeviceId;
  }

  return { getDesktopDeviceId };
}

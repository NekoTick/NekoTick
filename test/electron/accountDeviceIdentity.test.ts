import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  default: {
    app: { getPath: vi.fn(() => '/tmp/vlaina-device-identity-test') },
  },
}));

import {
  buildDesktopDeviceHeaders,
  createDesktopDeviceIdentityStore,
  desktopDeviceIdHeader,
} from '../../electron/accountDeviceIdentity.mjs';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('desktop device identity', () => {
  it('persists one random installation identifier independently of account credentials', async () => {
    const userDataPath = await mkdtemp(path.join(os.tmpdir(), 'vlaina-device-'));
    temporaryDirectories.push(userDataPath);
    const firstStore = createDesktopDeviceIdentityStore({
      userDataPath,
      randomBytesImpl: () => Buffer.from('11'.repeat(16), 'hex'),
    });

    const first = await firstStore.getDesktopDeviceId();
    const second = await firstStore.getDesktopDeviceId();
    const reloaded = await createDesktopDeviceIdentityStore({ userDataPath }).getDesktopDeviceId();

    expect(first).toBe(`vld_${'11'.repeat(16)}`);
    expect(second).toBe(first);
    expect(reloaded).toBe(first);
    const stored = await readFile(path.join(userDataPath, '.vlaina', 'app', 'account', 'device.json'), 'utf8');
    expect(JSON.parse(stored)).toEqual({ deviceId: first });
  });

  it('replaces malformed stored identifiers and prevents callers from overriding the device header', async () => {
    const userDataPath = await mkdtemp(path.join(os.tmpdir(), 'vlaina-device-'));
    temporaryDirectories.push(userDataPath);
    const accountDir = path.join(userDataPath, '.vlaina', 'app', 'account');
    const bootstrapStore = createDesktopDeviceIdentityStore({ userDataPath });
    await bootstrapStore.getDesktopDeviceId();
    await writeFile(path.join(accountDir, 'device.json'), JSON.stringify({ deviceId: 'invalid' }), 'utf8');
    const store = createDesktopDeviceIdentityStore({
      userDataPath,
      randomBytesImpl: () => Buffer.from('22'.repeat(16), 'hex'),
    });
    const deviceId = await store.getDesktopDeviceId();

    expect(deviceId).toBe(`vld_${'22'.repeat(16)}`);
    expect(buildDesktopDeviceHeaders(deviceId, { [desktopDeviceIdHeader]: 'attacker' })).toEqual({
      [desktopDeviceIdHeader]: deviceId,
    });
  });

  it('keeps a process-lifetime identifier when the private directory is unavailable', async () => {
    const store = createDesktopDeviceIdentityStore({
      userDataPath: '/dev/null',
      randomBytesImpl: () => Buffer.from('33'.repeat(16), 'hex'),
    });

    const first = await store.getDesktopDeviceId();
    const second = await store.getDesktopDeviceId();

    expect(first).toBe(`vld_${'33'.repeat(16)}`);
    expect(second).toBe(first);
  });
});

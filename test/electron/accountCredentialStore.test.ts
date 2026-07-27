import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  userDataPath: '',
  encryptionAvailable: true,
  storageBackend: 'gnome_libsecret',
  decryptFails: false,
  decryptCalls: 0,
  safeStorageCalls: 0,
}));

vi.mock('electron', () => ({
  default: {
    app: {
      getPath(name: string) {
        if (name !== 'userData') {
          throw new Error(`Unexpected app path: ${name}`);
        }
        return mocks.userDataPath;
      },
    },
    safeStorage: {
      isEncryptionAvailable() {
        mocks.safeStorageCalls += 1;
        return mocks.encryptionAvailable;
      },
      getSelectedStorageBackend() {
        mocks.safeStorageCalls += 1;
        return mocks.storageBackend;
      },
      encryptString(value: string) {
        mocks.safeStorageCalls += 1;
        return Buffer.from(`enc:${value}`, 'utf8');
      },
      decryptString(buffer: Buffer) {
        mocks.safeStorageCalls += 1;
        mocks.decryptCalls += 1;
        if (mocks.decryptFails) {
          throw new Error('decrypt failed');
        }
        const decoded = buffer.toString('utf8');
        return decoded.startsWith('enc:') ? decoded.slice(4) : decoded;
      },
    },
  },
}));

describe('accountCredentialStore', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.doUnmock('node:fs/promises');
    mocks.userDataPath = await mkdtemp(path.join(os.tmpdir(), 'vlaina-account-store-'));
    mocks.encryptionAvailable = true;
    mocks.storageBackend = 'gnome_libsecret';
    mocks.decryptFails = false;
    mocks.decryptCalls = 0;
    mocks.safeStorageCalls = 0;
  });

  afterEach(async () => {
    vi.doUnmock('node:fs/promises');
    await rm(mocks.userDataPath, { recursive: true, force: true });
  });

  it('does not pass raw session tokens into auth log details', async () => {
    const { createAccountCredentialStore } = await import('../../electron/accountCredentialStore.mjs');
    const logDesktopAuth = vi.fn();
    const store = createAccountCredentialStore({
      desktopLegacySessionHeader: 'x-app-session-token',
      logDesktopAuth,
    });

    await store.writeStoredAccountCredentials({
      appSessionToken: 'nts_super_secret_token',
      provider: 'google',
      username: 'alice',
      primaryEmail: 'alice@example.com',
      avatarUrl: null,
      authenticatedAt: 1,
    });
    await store.readStoredAccountCredentials();
    await store.rotateStoredSessionToken(new Headers({ 'x-app-session-token': 'nts_rotated_secret' }));

    expect(JSON.stringify(logDesktopAuth.mock.calls)).not.toContain('nts_super_secret_token');
    expect(JSON.stringify(logDesktopAuth.mock.calls)).not.toContain('nts_rotated_secret');
  });

  it('does not let stale rotation, update, or clear operations replace newer credentials', async () => {
    const { createAccountCredentialStore } = await import('../../electron/accountCredentialStore.mjs');
    const store = createAccountCredentialStore({
      desktopLegacySessionHeader: 'x-app-session-token',
    });
    const credentials = {
      appSessionToken: 'nts_current_session',
      provider: 'google',
      username: 'alice',
      primaryEmail: 'alice@example.com',
      avatarUrl: null,
      authenticatedAt: 1,
    };
    await store.writeStoredAccountCredentials(credentials);

    await store.rotateStoredSessionToken(
      new Headers({ 'x-app-session-token': 'nts_stale_rotation' }),
      'nts_old_session',
    );
    await expect(store.writeStoredAccountCredentialsIfCurrent(
      { ...credentials, appSessionToken: 'nts_stale_update' },
      'nts_old_session',
    )).resolves.toBe(false);
    await expect(store.clearStoredAccountCredentialsIfCurrent('nts_old_session')).resolves.toBe(false);

    await expect(store.readStoredAccountCredentials()).resolves.toMatchObject({
      appSessionToken: 'nts_current_session',
      username: 'alice',
    });
  });

  it('stores account session tokens only as encrypted records', async () => {
    const { createAccountCredentialStore } = await import('../../electron/accountCredentialStore.mjs');
    const store = createAccountCredentialStore({
      desktopLegacySessionHeader: 'x-app-session-token',
    });

    await store.writeStoredAccountCredentials({
      appSessionToken: 'nts_super_secret_token',
      provider: 'google',
      username: 'alice',
      primaryEmail: 'alice@example.com',
      avatarUrl: null,
      authenticatedAt: 1,
    });

    const secretsPath = path.join(mocks.userDataPath, '.vlaina', 'app', 'secrets', 'account.json');
    const rawSecrets = await readFile(secretsPath, 'utf8');
    expect(rawSecrets).not.toContain('nts_super_secret_token');
    expect(JSON.parse(rawSecrets).appSessionToken).toMatchObject({
      __secure: 'electron.safeStorage.v1',
    });
  });

  it('stores account credentials in private files on POSIX', async () => {
    if (process.platform === 'win32') {
      return;
    }

    const { createAccountCredentialStore } = await import('../../electron/accountCredentialStore.mjs');
    const store = createAccountCredentialStore({
      desktopLegacySessionHeader: 'x-app-session-token',
    });

    await store.writeStoredAccountCredentials({
      appSessionToken: 'nts_super_secret_token',
      provider: 'google',
      username: 'alice',
      primaryEmail: 'alice@example.com',
      avatarUrl: null,
      authenticatedAt: 1,
    });

    const accountDir = path.join(mocks.userDataPath, '.vlaina', 'app', 'account');
    const secretsDir = path.join(mocks.userDataPath, '.vlaina', 'app', 'secrets');
    const metaPath = path.join(accountDir, 'profile.json');
    const secretsPath = path.join(secretsDir, 'account.json');
    expect((await stat(accountDir)).mode & 0o777).toBe(0o700);
    expect((await stat(secretsDir)).mode & 0o777).toBe(0o700);
    expect((await stat(metaPath)).mode & 0o777).toBe(0o600);
    expect((await stat(secretsPath)).mode & 0o777).toBe(0o600);
  });

  it('normalizes account metadata before storing it', async () => {
    const { createAccountCredentialStore } = await import('../../electron/accountCredentialStore.mjs');
    const store = createAccountCredentialStore({
      desktopLegacySessionHeader: 'x-app-session-token',
    });

    await store.writeStoredAccountCredentials({
      appSessionToken: ' nts_super_secret_token ',
      provider: 'google',
      username: ' alice ',
      primaryEmail: ' alice@example.com ',
      avatarUrl: 'http://127.0.0.1/avatar.png',
      membershipTier: 'pro',
      membershipName: 'P'.repeat(129),
      authenticatedAt: 1,
    });

    const metaPath = path.join(mocks.userDataPath, '.vlaina', 'app', 'account', 'profile.json');
    const rawMeta = JSON.parse(await readFile(metaPath, 'utf8'));
    expect(rawMeta).toMatchObject({
      provider: 'google',
      username: 'alice',
      primaryEmail: 'alice@example.com',
      avatarUrl: null,
      membershipTier: 'pro',
      membershipName: null,
      authenticatedAt: 1,
    });

    await expect(store.readStoredAccountCredentials()).resolves.toMatchObject({
      appSessionToken: 'nts_super_secret_token',
      username: 'alice',
      primaryEmail: 'alice@example.com',
      avatarUrl: null,
      membershipTier: 'pro',
      membershipName: null,
    });
  });

  it('keeps account session tokens in memory when safe storage is unavailable', async () => {
    mocks.encryptionAvailable = false;
    const { createAccountCredentialStore } = await import('../../electron/accountCredentialStore.mjs');
    const store = createAccountCredentialStore({
      desktopLegacySessionHeader: 'x-app-session-token',
    });

    await store.writeStoredAccountCredentials({
      appSessionToken: 'nts_super_secret_token',
      provider: 'google',
      username: 'alice',
      primaryEmail: 'alice@example.com',
      avatarUrl: null,
      authenticatedAt: 1,
    });

    await expect(store.readStoredAccountCredentials()).resolves.toMatchObject({
      appSessionToken: 'nts_super_secret_token',
      provider: 'google',
      username: 'alice',
      persistent: false,
    });

    const secretsPath = path.join(mocks.userDataPath, '.vlaina', 'app', 'secrets', 'account.json');
    await expect(readFile(secretsPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('does not persist account session tokens with the Linux basic text backend', async () => {
    mocks.storageBackend = 'basic_text';
    const { createAccountCredentialStore } = await import('../../electron/accountCredentialStore.mjs');
    const store = createAccountCredentialStore({
      desktopLegacySessionHeader: 'x-app-session-token',
      platform: 'linux',
    });

    await expect(store.writeStoredAccountCredentials({
      appSessionToken: 'nts_super_secret_token',
      provider: 'google',
      username: 'alice',
      primaryEmail: 'alice@example.com',
      avatarUrl: null,
      authenticatedAt: 1,
    })).resolves.toBe(false);

    const secretsPath = path.join(mocks.userDataPath, '.vlaina', 'app', 'secrets', 'account.json');
    await expect(readFile(secretsPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('preserves encrypted credentials when decryption temporarily fails', async () => {
    const { createAccountCredentialStore } = await import('../../electron/accountCredentialStore.mjs');
    const storeDir = path.join(mocks.userDataPath, '.vlaina', 'app');
    const metaPath = path.join(storeDir, 'account', 'profile.json');
    const secretsPath = path.join(storeDir, 'secrets', 'account.json');
    const rawSecrets = JSON.stringify({
      appSessionToken: {
        __secure: 'electron.safeStorage.v1',
        ciphertext: Buffer.from('enc:nts_session', 'utf8').toString('base64'),
      },
    });
    await mkdir(path.dirname(metaPath), { recursive: true });
    await mkdir(path.dirname(secretsPath), { recursive: true });
    await writeFile(metaPath, JSON.stringify({ provider: 'google', username: 'alice' }), 'utf8');
    await writeFile(secretsPath, rawSecrets, 'utf8');
    mocks.decryptFails = true;

    const store = createAccountCredentialStore({
      desktopLegacySessionHeader: 'x-app-session-token',
    });

    await expect(store.readStoredAccountCredentials()).resolves.toBeNull();
    await expect(readFile(secretsPath, 'utf8')).resolves.toBe(rawSecrets);
  });

  it.each(['metadata', 'secrets'] as const)(
    'returns null without using safe storage when the %s file is missing',
    async (missingFile) => {
      const storeDir = path.join(mocks.userDataPath, '.vlaina', 'app');
      const metaPath = path.join(storeDir, 'account', 'profile.json');
      const secretsPath = path.join(storeDir, 'secrets', 'account.json');
      await mkdir(path.dirname(metaPath), { recursive: true });
      await mkdir(path.dirname(secretsPath), { recursive: true });
      if (missingFile !== 'metadata') {
        await writeFile(metaPath, JSON.stringify({ provider: 'google', username: 'fixture-user' }), 'utf8');
      }
      if (missingFile !== 'secrets') {
        await writeFile(secretsPath, JSON.stringify({ appSessionToken: {} }), 'utf8');
      }

      const { createAccountCredentialStore } = await import('../../electron/accountCredentialStore.mjs');
      const store = createAccountCredentialStore({
        desktopLegacySessionHeader: 'x-app-session-token',
      });

      await expect(store.readStoredAccountCredentials()).resolves.toBeNull();
      expect(mocks.safeStorageCalls).toBe(0);
    },
  );

  it('coalesces and caches persistent credential reads', async () => {
    const storeDir = path.join(mocks.userDataPath, '.vlaina', 'app');
    const metaPath = path.join(storeDir, 'account', 'profile.json');
    const secretsPath = path.join(storeDir, 'secrets', 'account.json');
    await mkdir(path.dirname(metaPath), { recursive: true });
    await mkdir(path.dirname(secretsPath), { recursive: true });
    await writeFile(metaPath, JSON.stringify({ provider: 'google', username: 'alice' }), 'utf8');
    await writeFile(secretsPath, JSON.stringify({
      appSessionToken: {
        __secure: 'electron.safeStorage.v1',
        ciphertext: Buffer.from('enc:nts_session', 'utf8').toString('base64'),
      },
    }), 'utf8');

    const { createAccountCredentialStore } = await import('../../electron/accountCredentialStore.mjs');
    const store = createAccountCredentialStore({
      desktopLegacySessionHeader: 'x-app-session-token',
    });

    const [first, second] = await Promise.all([
      store.readStoredAccountCredentials(),
      store.readStoredAccountCredentials(),
    ]);
    const third = await store.readStoredAccountCredentials();

    expect(first).toMatchObject({ appSessionToken: 'nts_session', username: 'alice' });
    expect(second).toEqual(first);
    expect(third).toEqual(first);
    expect(mocks.decryptCalls).toBe(1);
  });

  it('serializes overlapping persistent reads and writes', async () => {
    const storeDir = path.join(mocks.userDataPath, '.vlaina', 'app');
    const metaPath = path.join(storeDir, 'account', 'profile.json');
    const secretsPath = path.join(storeDir, 'secrets', 'account.json');
    await mkdir(path.dirname(metaPath), { recursive: true });
    await mkdir(path.dirname(secretsPath), { recursive: true });
    await writeFile(metaPath, JSON.stringify({ provider: 'google', username: 'old-user' }), 'utf8');
    await writeFile(secretsPath, JSON.stringify({
      appSessionToken: {
        __secure: 'electron.safeStorage.v1',
        ciphertext: Buffer.from('enc:nts_old_session', 'utf8').toString('base64'),
      },
      legacyToken: 'plaintext-is-removed',
    }), 'utf8');

    const realFs = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    let releaseSecretsRead!: () => void;
    let markSecretsReadStarted!: () => void;
    const secretsReadGate = new Promise<void>((resolve) => {
      releaseSecretsRead = resolve;
    });
    const secretsReadStarted = new Promise<void>((resolve) => {
      markSecretsReadStarted = resolve;
    });
    let heldSecretsRead = false;
    const readFileMock = vi.fn(async (...args: Parameters<typeof realFs.readFile>) => {
      const value = await realFs.readFile(...args);
      if (!heldSecretsRead && String(args[0]) === secretsPath) {
        heldSecretsRead = true;
        markSecretsReadStarted();
        await secretsReadGate;
      }
      return value;
    });
    const writeFileMock = vi.fn(realFs.writeFile);
    const fsMocks = { ...realFs, readFile: readFileMock, writeFile: writeFileMock };
    vi.doMock('node:fs/promises', () => ({ ...fsMocks, default: fsMocks }));

    const { createAccountCredentialStore } = await import('../../electron/accountCredentialStore.mjs');
    const store = createAccountCredentialStore({
      desktopLegacySessionHeader: 'x-app-session-token',
    });
    const staleRead = store.readStoredAccountCredentials();
    const write = store.writeStoredAccountCredentials({
      appSessionToken: 'nts_new_session',
      provider: 'google',
      username: 'new-user',
      primaryEmail: null,
      avatarUrl: null,
      authenticatedAt: 2,
    });

    await secretsReadStarted;
    releaseSecretsRead();
    await expect(staleRead).resolves.toMatchObject({ appSessionToken: 'nts_old_session' });
    await write;
    await expect(store.readStoredAccountCredentials()).resolves.toMatchObject({
      appSessionToken: 'nts_new_session',
      username: 'new-user',
    });
    await expect(readFile(secretsPath, 'utf8')).resolves.not.toContain('plaintext-is-removed');
  });

  it('ignores and removes plaintext account session token records', async () => {
    const { createAccountCredentialStore } = await import('../../electron/accountCredentialStore.mjs');
    const store = createAccountCredentialStore({
      desktopLegacySessionHeader: 'x-app-session-token',
    });
    const storeDir = path.join(mocks.userDataPath, '.vlaina', 'app');
    const metaPath = path.join(storeDir, 'account', 'profile.json');
    const secretsPath = path.join(storeDir, 'secrets', 'account.json');

    await mkdir(path.dirname(metaPath), { recursive: true });
    await mkdir(path.dirname(secretsPath), { recursive: true });
    await writeFile(metaPath, JSON.stringify({ provider: 'google', username: 'alice' }), 'utf8');
    await writeFile(secretsPath, JSON.stringify({ appSessionToken: 'nts_plaintext' }), 'utf8');

    await expect(store.readStoredAccountCredentials()).resolves.toBeNull();
    await expect(readFile(secretsPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('ignores oversized account credential files', async () => {
    const { createAccountCredentialStore } = await import('../../electron/accountCredentialStore.mjs');
    const store = createAccountCredentialStore({
      desktopLegacySessionHeader: 'x-app-session-token',
    });
    const storeDir = path.join(mocks.userDataPath, '.vlaina', 'app');
    const metaPath = path.join(storeDir, 'account', 'profile.json');
    const secretsPath = path.join(storeDir, 'secrets', 'account.json');

    await mkdir(path.dirname(metaPath), { recursive: true });
    await mkdir(path.dirname(secretsPath), { recursive: true });
    await writeFile(metaPath, ' '.repeat(300 * 1024), 'utf8');
    await writeFile(secretsPath, ' '.repeat(300 * 1024), 'utf8');

    await expect(store.readStoredAccountCredentials()).resolves.toBeNull();
  });

  it('ignores account credential content that exceeds the limit after read', async () => {
    const fsMocks = {
      chmod: vi.fn(async () => undefined),
      mkdir: vi.fn(async () => undefined),
      readFile: vi.fn(async () => 'x'.repeat(256 * 1024 + 1)),
      rm: vi.fn(async () => undefined),
      stat: vi.fn(async () => ({ isFile: () => true, size: 128 })),
      writeFile: vi.fn(async () => undefined),
    };
    vi.doMock('node:fs/promises', () => ({ ...fsMocks, default: fsMocks }));

    const { createAccountCredentialStore } = await import('../../electron/accountCredentialStore.mjs');
    const store = createAccountCredentialStore({
      desktopLegacySessionHeader: 'x-app-session-token',
    });

    await expect(store.readStoredAccountCredentials()).resolves.toBeNull();
    expect(fsMocks.readFile).toHaveBeenCalled();
    expect(fsMocks.writeFile).not.toHaveBeenCalled();
  });
});

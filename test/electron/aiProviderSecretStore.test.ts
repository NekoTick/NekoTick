import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  decryptionFails: false,
  encryptionAvailable: true,
  userDataPath: '',
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
        return mocks.encryptionAvailable;
      },
      getSelectedStorageBackend() {
        return 'gnome_libsecret';
      },
      encryptString(value: string) {
        return Buffer.from(value, 'utf8');
      },
      decryptString(buffer: Buffer) {
        if (mocks.decryptionFails) {
          throw new Error('keychain locked');
        }
        return buffer.toString('utf8');
      },
    },
  },
}));

describe('aiProviderSecretStore', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.doUnmock('node:fs/promises');
    mocks.decryptionFails = false;
    mocks.encryptionAvailable = true;
    mocks.userDataPath = await mkdtemp(path.join(os.tmpdir(), 'vlaina-ai-secrets-'));
  });

  afterEach(async () => {
    vi.doUnmock('node:fs/promises');
    await rm(mocks.userDataPath, { recursive: true, force: true });
  });

  it('serializes concurrent secret updates without losing keys', async () => {
    const { readSecretsStore, updateSecretsStore } = await import('../../electron/aiProviderSecretStore.mjs');

    await Promise.all([
      updateSecretsStore(async (data) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        data['provider-a'] = 'sk-a';
      }),
      updateSecretsStore(async (data) => {
        data['provider-b'] = 'sk-b';
      }),
    ]);

    await expect(readSecretsStore()).resolves.toMatchObject({
      data: {
        'provider-a': 'sk-a',
        'provider-b': 'sk-b',
      },
    });
  });

  it('stores provider secrets in private files on POSIX', async () => {
    if (process.platform === 'win32') {
      return;
    }

    const { updateSecretsStore } = await import('../../electron/aiProviderSecretStore.mjs');

    await updateSecretsStore(async (data) => {
      data['provider-a'] = 'sk-a';
    });

    const secretsDir = path.join(mocks.userDataPath, '.vlaina', 'app', 'secrets');
    const secretsPath = path.join(secretsDir, 'ai-providers.json');
    expect((await stat(secretsDir)).mode & 0o777).toBe(0o700);
    expect((await stat(secretsPath)).mode & 0o777).toBe(0o600);
    expect(await readFile(secretsPath, 'utf8')).not.toContain('sk-a');
  });

  it('does not write provider secrets when system encryption is unavailable', async () => {
    mocks.encryptionAvailable = false;
    const { updateSecretsStore } = await import('../../electron/aiProviderSecretStore.mjs');

    await expect(updateSecretsStore(async (data) => {
      data['provider-a'] = 'fake-test-key';
    })).rejects.toThrow('System secure storage is unavailable');

    const secretsPath = path.join(
      mocks.userDataPath,
      '.vlaina',
      'app',
      'secrets',
      'ai-providers.json',
    );
    await expect(stat(secretsPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('preserves the encrypted store when existing secrets cannot be decrypted', async () => {
    const { readSecretsStore, updateSecretsStore } = await import('../../electron/aiProviderSecretStore.mjs');
    await updateSecretsStore(async (data) => {
      data['provider-a'] = 'fake-test-key';
    });
    const secretsPath = path.join(
      mocks.userDataPath,
      '.vlaina',
      'app',
      'secrets',
      'ai-providers.json',
    );
    const originalContent = await readFile(secretsPath, 'utf8');
    mocks.decryptionFails = true;

    await expect(readSecretsStore()).rejects.toThrow('Provider secrets could not be decrypted.');
    await expect(updateSecretsStore(async (data) => {
      data['provider-b'] = 'another-fake-key';
    })).rejects.toThrow('Provider secrets could not be decrypted.');

    expect(await readFile(secretsPath, 'utf8')).toBe(originalContent);
  });

  it('drops unsafe legacy provider ids from the secret file', async () => {
    const { readSecretsStore } = await import('../../electron/aiProviderSecretStore.mjs');
    const secretsPath = path.join(
      mocks.userDataPath,
      '.vlaina',
      'app',
      'secrets',
      'ai-providers.json',
    );
    await mkdir(path.dirname(secretsPath), { recursive: true });
    await writeFile(secretsPath, JSON.stringify({
      'provider-a': 'sk-a',
      '../outside': 'sk-outside',
      'provider/slash': 'sk-slash',
    }), 'utf8');

    await expect(readSecretsStore()).resolves.toMatchObject({
      data: {
        'provider-a': 'sk-a',
      },
    });
    expect(await readFile(secretsPath, 'utf8')).not.toContain('../outside');
    expect(await readFile(secretsPath, 'utf8')).not.toContain('provider/slash');
  });

  it('ignores oversized secret store files', async () => {
    const { readSecretsStore } = await import('../../electron/aiProviderSecretStore.mjs');
    const secretsPath = path.join(
      mocks.userDataPath,
      '.vlaina',
      'app',
      'secrets',
      'ai-providers.json',
    );
    await mkdir(path.dirname(secretsPath), { recursive: true });
    await writeFile(secretsPath, ' '.repeat(600 * 1024), 'utf8');

    await expect(readSecretsStore()).resolves.toMatchObject({
      data: {},
    });
  });

  it('ignores secret store content that exceeds the limit after read', async () => {
    const fsMocks = {
      chmod: vi.fn(async () => undefined),
      mkdir: vi.fn(async () => undefined),
      readFile: vi.fn(async () => 'x'.repeat(512 * 1024 + 1)),
      stat: vi.fn(async () => ({ isFile: () => true, size: 128 })),
      writeFile: vi.fn(async () => undefined),
    };
    vi.doMock('node:fs/promises', () => ({ ...fsMocks, default: fsMocks }));

    const { readSecretsStore } = await import('../../electron/aiProviderSecretStore.mjs');

    await expect(readSecretsStore()).resolves.toMatchObject({ data: {} });
    expect(fsMocks.readFile).toHaveBeenCalled();
    expect(fsMocks.writeFile).not.toHaveBeenCalled();
  });
});

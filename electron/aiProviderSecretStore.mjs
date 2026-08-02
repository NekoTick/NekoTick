import electron from 'electron';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { ensurePrivateDirectory, writePrivateFile } from './privateFilePermissions.mjs';
import { decodeSecretRecord, encodeSecretRecord } from './secureSecretRecord.mjs';
import { isSafeStoragePersistenceAvailable } from './linuxSafeStorage.mjs';

const { app, safeStorage } = electron;
const MAX_PROVIDER_SECRETS_JSON_BYTES = 512 * 1024;
const PROVIDER_SECRET_DECRYPTION_ERROR_CODE = 'provider_secret_decryption_failed';
let secretsStoreUpdatePromise = Promise.resolve();

function isSafeProviderId(value) {
  return (
    typeof value === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)
  );
}

function sanitizeSecretsData(data) {
  const sanitized = {};
  for (const [key, value] of Object.entries(data ?? {})) {
    if (isSafeProviderId(key) && typeof value === 'string') {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export async function readSecretsStore() {
  const secretsDir = path.join(app.getPath('userData'), '.vlaina', 'app', 'secrets');
  const secretsPath = path.join(secretsDir, 'ai-providers.json');

  if (!isSafeStoragePersistenceAvailable(safeStorage)) {
    throw new Error('System secure storage is unavailable');
  }

  await ensurePrivateDirectory(secretsDir);

  try {
    const fileInfo = await stat(secretsPath);
    if (!fileInfo.isFile() || fileInfo.size > MAX_PROVIDER_SECRETS_JSON_BYTES) {
      return { secretsDir, secretsPath, data: {} };
    }
    const content = await readFile(secretsPath, 'utf8');
    if (Buffer.byteLength(content, 'utf8') > MAX_PROVIDER_SECRETS_JSON_BYTES) {
      return { secretsDir, secretsPath, data: {} };
    }
    const parsed = JSON.parse(content);
    const { record, needsMigration, decryptionFailed } = decodeSecretRecord(parsed, safeStorage);
    if (decryptionFailed) {
      const error = new Error('Provider secrets could not be decrypted.');
      error.code = PROVIDER_SECRET_DECRYPTION_ERROR_CODE;
      throw error;
    }
    const data = sanitizeSecretsData(record);
    if (needsMigration || Object.keys(data).length !== Object.keys(record).length) {
      await writePrivateFile(secretsPath, JSON.stringify(
        encodeSecretRecord(data, safeStorage, { requireEncryption: true }),
        null,
        2,
      ));
    }
    return { secretsDir, secretsPath, data };
  } catch (error) {
    if (error?.code === PROVIDER_SECRET_DECRYPTION_ERROR_CODE) {
      throw error;
    }
    return { secretsDir, secretsPath, data: {} };
  }
}

export async function writeSecretsStore(data) {
  const { secretsPath } = await readSecretsStore();
  await writePrivateFile(secretsPath, JSON.stringify(
    encodeSecretRecord(sanitizeSecretsData(data), safeStorage, { requireEncryption: true }),
    null,
    2,
  ));
}

export async function updateSecretsStore(mutator) {
  const runUpdate = async () => {
    const store = await readSecretsStore();
    const nextData = { ...store.data };
    await mutator(nextData);
    await writeSecretsStore(nextData);
    return nextData;
  };

  const updatePromise = secretsStoreUpdatePromise.catch(() => undefined).then(runUpdate);
  secretsStoreUpdatePromise = updatePromise.then(() => undefined, () => undefined);
  return updatePromise;
}

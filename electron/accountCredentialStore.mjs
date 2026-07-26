import electron from 'electron';
import { readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { decodeSecretRecord, encodeSecretRecord } from './secureSecretRecord.mjs';
import { ensurePrivateDirectory, writePrivateFile } from './privateFilePermissions.mjs';
import { isSafeStoragePersistenceAvailable } from './linuxSafeStorage.mjs';
import {
  normalizeDesktopAccountAvatarUrl,
  normalizeDesktopAccountEmail,
  normalizeDesktopAccountMembershipName,
  normalizeDesktopAccountUsername,
} from './accountIdentityNormalization.mjs';

const { app, safeStorage } = electron;
const MAX_ACCOUNT_STORE_JSON_BYTES = 256 * 1024;

export function isSupportedAccountProvider(provider) {
  return provider === 'google' || provider === 'email';
}

export function normalizeDesktopAccountProvider(provider, fallback = null) {
  if (typeof provider !== 'string') {
    return fallback;
  }

  const normalized = provider.trim().toLowerCase();
  return isSupportedAccountProvider(normalized) ? normalized : fallback;
}

function normalizeMembershipTier(value) {
  return value === 'free' ||
    value === 'plus' ||
    value === 'pro' ||
    value === 'max' ||
    value === 'ultra'
    ? value
    : null;
}

function normalizeStoredAccountCredentials(credentials) {
  const provider = normalizeDesktopAccountProvider(credentials?.provider, null);
  const username = normalizeDesktopAccountUsername(credentials?.username);
  const appSessionToken =
    typeof credentials?.appSessionToken === 'string' && credentials.appSessionToken.trim()
      ? credentials.appSessionToken.trim()
      : '';

  if (!provider || !username || !appSessionToken) {
    throw new Error('Account credentials are incomplete.');
  }

  return {
    ...credentials,
    appSessionToken,
    provider,
    username,
    primaryEmail: normalizeDesktopAccountEmail(credentials?.primaryEmail),
    avatarUrl: normalizeDesktopAccountAvatarUrl(credentials?.avatarUrl),
    membershipTier: normalizeMembershipTier(credentials?.membershipTier),
    membershipName: normalizeDesktopAccountMembershipName(credentials?.membershipName),
    authenticatedAt:
      typeof credentials?.authenticatedAt === 'number' && Number.isFinite(credentials.authenticatedAt)
        ? credentials.authenticatedAt
        : null,
  };
}

async function readJsonFile(filePath, fallbackValue) {
  try {
    const fileInfo = await stat(filePath);
    if (!fileInfo.isFile() || fileInfo.size > MAX_ACCOUNT_STORE_JSON_BYTES) {
      return fallbackValue;
    }
    const content = await readFile(filePath, 'utf8');
    if (Buffer.byteLength(content, 'utf8') > MAX_ACCOUNT_STORE_JSON_BYTES) {
      return fallbackValue;
    }
    return JSON.parse(content);
  } catch {
    return fallbackValue;
  }
}

async function getAccountDir() {
  const accountDir = path.join(app.getPath('userData'), '.vlaina', 'app', 'account');
  await ensurePrivateDirectory(accountDir);
  return accountDir;
}

async function getSecretsDir() {
  const secretsDir = path.join(app.getPath('userData'), '.vlaina', 'app', 'secrets');
  await ensurePrivateDirectory(secretsDir);
  return secretsDir;
}

async function getAccountStorePaths() {
  const accountDir = await getAccountDir();
  const secretsDir = await getSecretsDir();
  return {
    metaPath: path.join(accountDir, 'profile.json'),
    secretsPath: path.join(secretsDir, 'account.json'),
  };
}

export function createAccountCredentialStore({
  desktopLegacySessionHeader,
  platform = process.platform,
}) {
  let memoryStoredAccountCredentials = null;
  let persistentStoredAccountCredentials = null;
  let credentialOperationQueue = Promise.resolve();

  function queueCredentialOperation(operation) {
    const result = credentialOperationQueue.then(operation, operation);
    credentialOperationQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  async function readStoredAccountCredentialsNow() {
    if (memoryStoredAccountCredentials) {
      return memoryStoredAccountCredentials;
    }
    if (persistentStoredAccountCredentials) {
      return persistentStoredAccountCredentials;
    }

    const { metaPath, secretsPath } = await getAccountStorePaths();
    const meta = await readJsonFile(metaPath, null);
    const rawSecrets = await readJsonFile(secretsPath, null);
    if (!isSafeStoragePersistenceAvailable(safeStorage, platform)) {
      return null;
    }
    const { record: secrets, needsMigration, decryptionFailed } = decodeSecretRecord(rawSecrets, safeStorage, {
      allowPlaintext: false,
    });
    if (decryptionFailed) {
      return null;
    }
    if (needsMigration) {
      if (Object.keys(secrets).length === 0) {
        await rm(secretsPath, { force: true });
      } else {
        await writePrivateFile(
          secretsPath,
          JSON.stringify(encodeSecretRecord(secrets, safeStorage, { requireEncryption: true }), null, 2)
        );
      }
    }
    const provider = normalizeDesktopAccountProvider(meta?.provider, '');
    const username = normalizeDesktopAccountUsername(meta?.username) ?? '';
    const appSessionToken = typeof secrets?.appSessionToken === 'string' ? secrets.appSessionToken.trim() : '';

    if (!isSupportedAccountProvider(provider) || !username || !appSessionToken) {
      return null;
    }

    const credentials = {
      appSessionToken,
      provider,
      username,
      primaryEmail: normalizeDesktopAccountEmail(meta?.primaryEmail),
      avatarUrl: normalizeDesktopAccountAvatarUrl(meta?.avatarUrl),
      membershipTier: normalizeMembershipTier(meta?.membershipTier),
      membershipName: normalizeDesktopAccountMembershipName(meta?.membershipName),
      persistent: true,
      authenticatedAt:
        typeof meta?.authenticatedAt === 'number' && Number.isFinite(meta.authenticatedAt)
          ? meta.authenticatedAt
          : null,
    };
    persistentStoredAccountCredentials = credentials;
    return credentials;
  }

  async function readStoredAccountCredentials() {
    return await queueCredentialOperation(readStoredAccountCredentialsNow);
  }

  async function writeStoredAccountCredentialsNow(credentials) {
    const normalizedCredentials = normalizeStoredAccountCredentials(credentials);
    const { metaPath, secretsPath } = await getAccountStorePaths();
    let encodedSecrets = null;
    try {
      if (!isSafeStoragePersistenceAvailable(safeStorage, platform)) {
        throw new Error('System secure storage is unavailable');
      }
      encodedSecrets = encodeSecretRecord(
        {
          appSessionToken: normalizedCredentials.appSessionToken,
        },
        safeStorage,
        { requireEncryption: true }
      );
    } catch (error) {
      if (!/system secure storage is unavailable/i.test(error instanceof Error ? error.message : String(error))) {
        throw error;
      }
      memoryStoredAccountCredentials = {
        ...normalizedCredentials,
        persistent: false,
      };
      persistentStoredAccountCredentials = null;
      await rm(metaPath, { force: true });
      await rm(secretsPath, { force: true });
      return false;
    }

    memoryStoredAccountCredentials = null;
    persistentStoredAccountCredentials = null;
    await writePrivateFile(
      metaPath,
      JSON.stringify(
        {
          provider: normalizedCredentials.provider,
          username: normalizedCredentials.username,
          primaryEmail: normalizedCredentials.primaryEmail,
          avatarUrl: normalizedCredentials.avatarUrl,
          membershipTier: normalizedCredentials.membershipTier,
          membershipName: normalizedCredentials.membershipName,
          authenticatedAt: normalizedCredentials.authenticatedAt,
        },
        null,
        2
      )
    );
    await writePrivateFile(
      secretsPath,
      JSON.stringify(encodedSecrets, null, 2)
    );
    persistentStoredAccountCredentials = {
      ...normalizedCredentials,
      persistent: true,
    };
    return true;
  }

  async function writeStoredAccountCredentials(credentials) {
    return await queueCredentialOperation(() => writeStoredAccountCredentialsNow(credentials));
  }

  async function writeStoredAccountCredentialsIfCurrent(credentials, expectedToken) {
    return await queueCredentialOperation(async () => {
      const current = await readStoredAccountCredentialsNow();
      if (!current || current.appSessionToken !== expectedToken) {
        return false;
      }
      await writeStoredAccountCredentialsNow(credentials);
      return true;
    });
  }

  async function clearStoredAccountCredentialsNow() {
    memoryStoredAccountCredentials = null;
    persistentStoredAccountCredentials = null;
    const { metaPath, secretsPath } = await getAccountStorePaths();
    await rm(metaPath, { force: true });
    await rm(secretsPath, { force: true });
  }

  async function clearStoredAccountCredentials() {
    return await queueCredentialOperation(clearStoredAccountCredentialsNow);
  }

  async function clearStoredAccountCredentialsIfCurrent(expectedToken) {
    return await queueCredentialOperation(async () => {
      const current = await readStoredAccountCredentialsNow();
      if (!current || current.appSessionToken !== expectedToken) {
        return false;
      }
      await clearStoredAccountCredentialsNow();
      return true;
    });
  }

  async function rotateStoredSessionToken(headers, expectedToken = null) {
    const rotatedToken = headers.get(desktopLegacySessionHeader)?.trim();
    if (!rotatedToken) {
      return;
    }

    return await queueCredentialOperation(async () => {
      const current = await readStoredAccountCredentialsNow();
      if (!current || (expectedToken && current.appSessionToken !== expectedToken)) {
        return;
      }

      await writeStoredAccountCredentialsNow({
        ...current,
        appSessionToken: rotatedToken,
      });
    });
  }

  return {
    readStoredAccountCredentials,
    writeStoredAccountCredentials,
    writeStoredAccountCredentialsIfCurrent,
    clearStoredAccountCredentials,
    clearStoredAccountCredentialsIfCurrent,
    rotateStoredSessionToken,
  };
}

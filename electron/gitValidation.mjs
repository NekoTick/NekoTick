import path from 'node:path';
import { sanitizeGitOutput } from './gitCommand.mjs';

const MAX_PATH_CHARS = 8192;

export function resolveRelativeGitPath(rootPath, filePath) {
  if (typeof filePath !== 'string' || !filePath || filePath.length > MAX_PATH_CHARS || filePath.includes('\0')) {
    throw new Error('A valid Git file path is required.');
  }

  const absolutePath = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(rootPath, filePath);
  const relativePath = path.relative(rootPath, absolutePath);
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error('Git file path must stay inside the repository.');
  }
  return relativePath;
}

export function requireSafeRemoteName(remoteName) {
  if (
    typeof remoteName !== 'string'
    || !remoteName
    || remoteName.startsWith('-')
    || /[\u0000-\u0020\u007F]/.test(remoteName)
  ) {
    throw new Error('Git remote name is invalid.');
  }
  return remoteName;
}

export function sanitizeRemoteUrl(remoteUrl) {
  const value = sanitizeGitOutput(remoteUrl).trim();
  if (!value) return null;

  if (/^https:\/\//i.test(value) || /^ssh:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      parsed.username = '';
      parsed.password = '';
      return parsed.toString();
    } catch {
      return null;
    }
  }

  try {
    requireAllowedRemoteUrl(value);
  } catch {
    return null;
  }
  const scpRemote = /^(?:[^@\s/:]+@)?([^\s/:]+):(.+)$/.exec(value);
  if (scpRemote) {
    return `${scpRemote[1]}:${scpRemote[2]}`;
  }
  return null;
}

function requireRemoteText(remoteUrl) {
  const value = String(remoteUrl ?? '').trim();
  if (!value || /[\u0000-\u0020\u007F]/.test(value)) {
    throw new Error('Git remote must use HTTPS or SSH.');
  }
  return value;
}

function requireHttpsRemote(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Git HTTPS remote URL is invalid.');
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname) {
    throw new Error('Git HTTPS remote URL is invalid.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Git HTTPS remote URL must not contain credentials.');
  }
  return value;
}

export function requireAllowedRemoteUrl(remoteUrl) {
  const value = requireRemoteText(remoteUrl);
  if (/^[a-z]:/i.test(value)) {
    throw new Error('Git remote must use HTTPS or SSH.');
  }
  if (/^https:\/\//i.test(value)) {
    return requireHttpsRemote(value);
  }
  if (/^ssh:\/\//i.test(value)) {
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error('Git SSH remote URL is invalid.');
    }
    if (parsed.protocol !== 'ssh:' || !parsed.hostname || parsed.password) {
      throw new Error('Git SSH remote URL is invalid.');
    }
    return value;
  }
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(value) || /^[a-z][a-z\d+.-]*::/i.test(value)) {
    throw new Error('Git remote must use HTTPS or SSH.');
  }
  if (/^(?:[^@\s/:]+@)?[^\s/:]+:(?!:).+$/.test(value)) {
    return value;
  }
  throw new Error('Git remote must use HTTPS or SSH.');
}

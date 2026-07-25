import type { MessageKey } from '@/lib/i18n';

export function getGitErrorMessageKey(
  error: unknown,
  fallback: MessageKey = 'git.operationFailed',
): MessageKey {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/merge conflicts?|unmerged|needs merge|you need to resolve/i.test(message)) {
    return 'git.conflicts';
  }
  if (/detached|attached branch/i.test(message)) return 'git.detachedUnavailable';
  if (/diverged|non-fast-forward|fetch first|rejected.*head/i.test(message)) {
    return 'git.diverged';
  }
  if (/authentication failed|permission denied|could not read username|host key verification failed/i.test(message)) {
    return 'git.authenticationFailed';
  }
  if (/author identity unknown|committer identity unknown|please tell me who you are/i.test(message)) {
    return 'git.identityMissing';
  }
  if (/must use https or ssh|remote url is invalid|protocol .* not allowed/i.test(message)) {
    return 'git.unsupportedRemote';
  }
  if (/timed out|could not resolve host|failed to connect|network (?:is )?unavailable|network is unreachable|connection reset/i.test(message)) {
    return 'git.networkUnavailable';
  }
  if (/output exceeded the safety limit|stdout maxbuffer/i.test(message)) return 'git.diffTooLarge';
  return fallback;
}

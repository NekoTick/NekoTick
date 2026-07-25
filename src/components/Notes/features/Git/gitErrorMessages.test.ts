import { describe, expect, it } from 'vitest';
import { getGitErrorMessageKey } from './gitErrorMessages';

describe('Git error messages', () => {
  it.each([
    ['Git commit is unavailable while merge conflicts remain.', 'git.conflicts'],
    ['Git pull is unavailable because local and remote history have diverged.', 'git.diverged'],
    ['Git commit requires an attached branch.', 'git.detachedUnavailable'],
    ['fatal: Authentication failed for remote', 'git.authenticationFailed'],
    ['Author identity unknown', 'git.identityMissing'],
    ['Git command timed out.', 'git.networkUnavailable'],
    ['Git remote must use HTTPS or SSH.', 'git.unsupportedRemote'],
    ['Git command output exceeded the safety limit.', 'git.diffTooLarge'],
  ])('maps %s to %s', (message, key) => {
    expect(getGitErrorMessageKey(new Error(message))).toBe(key);
  });
});

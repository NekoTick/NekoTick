import { describe, expect, it } from 'vitest';
import { parseAISessionsFile, serializeAISessionsFile } from './unifiedStorageSessionFiles';

function sessionsData(computerUseEnabled: boolean) {
  return {
    sessions: [],
    selectedModelId: null,
    unreadSessionIds: [],
    currentSessionId: null,
    temporaryChatEnabled: false,
    customSystemPrompt: '',
    includeTimeContext: true,
    webSearchEnabled: false,
    computerUseEnabled,
    providerIds: [],
    deletedSessionIds: [],
    deletedProviderIds: [],
  };
}

describe('computer operation preference storage', () => {
  it('does not restore execution permission from the sessions file', () => {
    const serialized = serializeAISessionsFile(sessionsData(true));
    expect(JSON.parse(serialized).data.computerUseEnabled).toBe(false);
    expect(parseAISessionsFile(JSON.parse(serialized))?.computerUseEnabled).toBe(false);
  });

  it('defaults missing legacy preferences to disabled', () => {
    const legacy = JSON.parse(serializeAISessionsFile(sessionsData(false)));
    delete legacy.data.computerUseEnabled;
    expect(parseAISessionsFile(legacy)?.computerUseEnabled).toBe(false);
  });
});

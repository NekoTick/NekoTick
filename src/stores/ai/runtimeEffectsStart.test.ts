import { describe, expect, it } from 'vitest';
import {
  getAIStoreRuntimeChangeFlags,
  hasAIStoreRuntimeRelevantChanges,
} from './runtimeEffectsStart';

const EMPTY_SESSIONS: never[] = [];
const EMPTY_MODELS: never[] = [];
const EMPTY_PROVIDERS: never[] = [];
const EMPTY_UNREAD_SESSION_IDS: string[] = [];

function createSnapshot(overrides: Partial<Parameters<typeof getAIStoreRuntimeChangeFlags>[0]> = {}) {
  return {
    loaded: true,
    lastChatSessionId: null,
    models: EMPTY_MODELS,
    providers: EMPTY_PROVIDERS,
    sessions: EMPTY_SESSIONS,
    temporaryChatEnabled: false,
    unreadSessionIds: EMPTY_UNREAD_SESSION_IDS,
    ...overrides,
  };
}

function createRuntimeState(snapshot = createSnapshot()) {
  return {
    loaded: snapshot.loaded,
    data: {
      settings: {
        ui: { lastChatSessionId: snapshot.lastChatSessionId },
      },
      ai: {
        models: snapshot.models,
        providers: snapshot.providers,
        sessions: snapshot.sessions,
        temporaryChatEnabled: snapshot.temporaryChatEnabled,
        unreadSessionIds: snapshot.unreadSessionIds,
        messages: {},
      },
    },
  } as unknown as Parameters<typeof hasAIStoreRuntimeRelevantChanges>[1];
}

describe('getAIStoreRuntimeChangeFlags', () => {
  it('ignores message-only updates', () => {
    const previous = createSnapshot();
    const current = createSnapshot();

    expect(getAIStoreRuntimeChangeFlags(previous, current)).toEqual({
      loadedChanged: false,
      modelsChanged: false,
      providersChanged: false,
      sessionsChanged: false,
      temporaryChatChanged: false,
      unreadSessionsChanged: false,
      lastChatSessionChanged: false,
    });
  });

  it('flags only the runtime domains whose references changed', () => {
    const previous = createSnapshot();
    const current = createSnapshot({ models: [], providers: ['provider'], sessions: ['session'] });

    expect(getAIStoreRuntimeChangeFlags(previous, current)).toMatchObject({
      loadedChanged: false,
      modelsChanged: true,
      providersChanged: true,
      sessionsChanged: true,
      unreadSessionsChanged: false,
    });
  });

  it('skips message-only store updates before creating change flags', () => {
    const previous = createSnapshot();
    const messageOnlyState = createRuntimeState(previous);

    expect(hasAIStoreRuntimeRelevantChanges(previous, messageOnlyState)).toBe(false);
    expect(
      hasAIStoreRuntimeRelevantChanges(
        previous,
        createRuntimeState(createSnapshot({ models: [] })),
      ),
    ).toBe(true);
  });
});

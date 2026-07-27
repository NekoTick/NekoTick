import { describe, expect, it, vi } from 'vitest';
import { retainLoadedSessionMessages } from './useUnifiedStore';
import { createSettingsActions } from './actions/settingsActions';
import {
  resolveMarkdownSettings,
  updateMarkdownBodyLineNumbers,
  updateMarkdownImportedThemeId,
  updateMarkdownTypewriterMode,
} from './settings/markdownSettings';
import type { UnifiedData } from '@/lib/storage/unifiedStorage';
import {
  MAX_SETTINGS_TIMEZONE_CITY_CHARS,
  MAX_SETTINGS_UI_THEME_ID_CHARS,
} from '@/lib/storage/unifiedStorage';
import { DEFAULT_SETTINGS } from '@/lib/config';

function createData(overrides?: Partial<NonNullable<UnifiedData['ai']>>): UnifiedData {
  return {
    settings: {} as never,
    customIcons: [],
    ai: {
      providers: [],
      models: [],
      benchmarkResults: {},
      fetchedModels: {},
      sessions: [],
      messages: {},
      unreadSessionIds: [],
      selectedModelId: null,
      currentSessionId: null,
      temporaryChatEnabled: false,
      customSystemPrompt: '',
      includeTimeContext: true,
      ...overrides,
    },
  };
}

function createSettingsData(overrides?: Partial<UnifiedData['settings']>): UnifiedData {
  return {
    settings: {
      timezone: { offset: 8, city: 'Beijing' },
      markdown: {
        typewriterMode: false,
        theme: {
          importedThemeId: null,
        },
        body: { showLineNumbers: false },
        codeBlock: { showLineNumbers: true },
      },
      ui: {
        lastAppViewMode: 'notes',
        colorMode: 'system',
        themeId: 'default',
        notesChatFloatingSize: { width: 420, height: 640 },
      },
      ...overrides,
    },
    customIcons: [],
    ai: undefined,
  };
}

function createSettingsActionHarness(data = createSettingsData()) {
  let state = { data };
  const persist = vi.fn();
  const set = (fn: (state: { data: UnifiedData }) => Partial<{ data: UnifiedData }>) => {
    state = {
      ...state,
      ...fn(state),
    };
  };

  return {
    actions: createSettingsActions(set, persist),
    getData: () => state.data,
    persist,
  };
}

describe('retainLoadedSessionMessages', () => {
  it('keeps already loaded messages for sessions that still exist after reload', () => {
    const previous = createData({
      sessions: [
        { id: 'session-1', title: 'First', modelId: '', createdAt: 1, updatedAt: 1 },
        { id: 'session-2', title: 'Second', modelId: '', createdAt: 2, updatedAt: 2 },
      ],
      messages: {
        'session-1': [
          {
            id: 'm1',
            role: 'user',
            content: 'hello',
            modelId: '',
            timestamp: 1,
            versions: [{ content: 'hello', createdAt: 1, kind: 'original' as const, subsequentMessages: [] }],
            currentVersionIndex: 0,
          },
        ],
        'session-2': [],
      },
    });

    const next = createData({
      sessions: [
        { id: 'session-1', title: 'First', modelId: '', createdAt: 1, updatedAt: 3 },
        { id: 'session-3', title: 'Third', modelId: '', createdAt: 3, updatedAt: 3 },
      ],
      messages: {},
    });

    const session1Messages = previous.ai?.messages['session-1'] || [];

    expect(retainLoadedSessionMessages(previous, next).ai?.messages).toEqual({
      'session-1': session1Messages,
    });
  });

  it('preserves local temporary sessions and messages across disk reloads', () => {
    const previous = createData({
      sessions: [
        { id: 'temp-session-1', title: 'Temporary Chat', modelId: '', createdAt: 1, updatedAt: 1 },
        { id: 'session-1', title: 'First', modelId: '', createdAt: 1, updatedAt: 1 },
      ],
      messages: {
        'temp-session-1': [
          {
            id: 'tmp',
            role: 'user',
            content: 'temporary',
            modelId: '',
            timestamp: 1,
            versions: [{ content: 'temporary', createdAt: 1, kind: 'original' as const, subsequentMessages: [] }],
            currentVersionIndex: 0,
          },
        ],
      },
    });

    const next = createData({
      sessions: [
        { id: 'session-2', title: 'Second', modelId: '', createdAt: 2, updatedAt: 2 },
      ],
      messages: {},
    });

    const retained = retainLoadedSessionMessages(previous, next).ai;

    expect(retained?.sessions.map((session) => session.id)).toEqual([
      'temp-session-1',
      'session-2',
    ]);
    expect(retained?.messages['temp-session-1']?.[0]?.content).toBe('temporary');
  });
});

describe('markdownSettings', () => {
  it('defaults typewriter mode off for older settings objects', () => {
    expect(resolveMarkdownSettings({
      codeBlock: { showLineNumbers: false },
    } as Partial<UnifiedData['settings']['markdown']>)).toEqual({
      typewriterMode: false,
      theme: {
        importedThemeId: null,
      },
      body: { showLineNumbers: false },
      codeBlock: { showLineNumbers: false },
    });
  });

  it('ignores legacy markdown theme compatibility while preserving safe imported ids', () => {
    expect(resolveMarkdownSettings({
      theme: {
        compatibility: 'not-a-platform',
        importedThemeId: ' clean-light ',
      } as never,
      codeBlock: { showLineNumbers: false },
    }).theme).toEqual({
      importedThemeId: 'clean-light',
    });
  });

  it('preserves safe imported markdown theme ids and rejects unsafe ids', () => {
    expect(resolveMarkdownSettings({
      theme: {
        importedThemeId: 'clean-light',
      },
      codeBlock: { showLineNumbers: false },
    }).theme).toEqual({
      importedThemeId: 'clean-light',
    });

    expect(resolveMarkdownSettings({
      theme: {
        importedThemeId: '../bad',
      },
      codeBlock: { showLineNumbers: false },
    }).theme).toEqual({
      importedThemeId: null,
    });
  });

  it('updates typewriter mode without changing code block settings', () => {
    const data: UnifiedData = {
      settings: {
        timezone: { offset: 0, city: 'UTC' },
          markdown: {
            typewriterMode: false,
            theme: {
              importedThemeId: null,
            },
            body: { showLineNumbers: false },
            codeBlock: { showLineNumbers: false },
          },
      },
      customIcons: [],
      ai: undefined,
    };

    expect(updateMarkdownTypewriterMode(data, true).settings.markdown).toEqual({
      typewriterMode: true,
      theme: {
        importedThemeId: null,
      },
      body: { showLineNumbers: false },
      codeBlock: { showLineNumbers: false },
    });
  });

  it('updates body line numbers without changing code block settings', () => {
    const data: UnifiedData = {
      settings: {
        timezone: { offset: 0, city: 'UTC' },
          markdown: {
            typewriterMode: false,
            theme: {
              importedThemeId: null,
            },
            body: { showLineNumbers: false },
            codeBlock: { showLineNumbers: true },
          },
      },
      customIcons: [],
      ai: undefined,
    };

    expect(updateMarkdownBodyLineNumbers(data, true).settings.markdown).toEqual({
      typewriterMode: false,
      theme: {
        importedThemeId: null,
      },
      body: { showLineNumbers: true },
      codeBlock: { showLineNumbers: true },
    });
  });

  it('updates imported theme id without changing markdown layout settings', () => {
    const data: UnifiedData = {
      settings: {
        timezone: { offset: 0, city: 'UTC' },
        markdown: {
          typewriterMode: true,
          theme: {
            importedThemeId: null,
          },
          body: { showLineNumbers: true },
          codeBlock: { showLineNumbers: false },
        },
      },
      customIcons: [],
      ai: undefined,
    };

    const withImportedTheme = updateMarkdownImportedThemeId(data, ' minimal ');
    const nativeWithImportedTheme = updateMarkdownImportedThemeId(data, 'clean-light');

    expect(withImportedTheme.settings.markdown).toEqual({
      typewriterMode: true,
      theme: {
        importedThemeId: 'minimal',
      },
      body: { showLineNumbers: true },
      codeBlock: { showLineNumbers: false },
    });
    expect(nativeWithImportedTheme.settings.markdown.theme).toEqual({
      importedThemeId: 'clean-light',
    });
  });
});

describe('settingsActions', () => {
  it('does not persist unchanged app settings', () => {
    const { actions, persist } = createSettingsActionHarness();

    actions.setTimezone(8, 'Beijing');
    actions.setLastAppViewMode('notes');
    actions.setMarkdownCodeBlockLineNumbers(true);
    actions.setMarkdownBodyLineNumbers(false);
    actions.setMarkdownTypewriterMode(false);
    actions.setMarkdownImportedThemeId(null);

    expect(persist).not.toHaveBeenCalled();
  });

  it('does not persist normalized markdown theme no-ops', () => {
    const { actions, persist } = createSettingsActionHarness(createSettingsData({
      markdown: {
        typewriterMode: false,
        theme: {
          importedThemeId: 'clean-light',
        },
        body: { showLineNumbers: false },
        codeBlock: { showLineNumbers: true },
      },
    }));

    actions.setMarkdownImportedThemeId(' clean-light ');

    expect(persist).not.toHaveBeenCalled();
  });

  it('persists changed app settings with narrow patches', () => {
    const { actions, getData, persist } = createSettingsActionHarness();

    actions.setLastAppViewMode('chat');

    expect(getData().settings.ui?.lastAppViewMode).toBe('chat');
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({
      settings: expect.objectContaining({
        ui: expect.objectContaining({
          lastAppViewMode: 'chat',
        }),
      }),
    }), {
      settings: {
        ui: {
          lastAppViewMode: 'chat',
        },
      },
    });
  });

  it('can update last app view mode without scheduling unified persistence', () => {
    const { actions, getData, persist } = createSettingsActionHarness();

    actions.setLastAppViewMode('chat', true);

    expect(getData().settings.ui?.lastAppViewMode).toBe('chat');
    expect(persist).not.toHaveBeenCalled();
  });

  it('persists changed last chat session with a narrow settings patch', () => {
    const { actions, getData, persist } = createSettingsActionHarness();

    actions.setLastChatSessionId(' session-2 ');

    expect(getData().settings.ui?.lastChatSessionId).toBe('session-2');
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({
      settings: expect.objectContaining({
        ui: expect.objectContaining({
          lastChatSessionId: 'session-2',
        }),
      }),
    }), {
      settings: {
        ui: {
          lastChatSessionId: 'session-2',
        },
      },
    });
  });

  it('normalizes timezone values before they enter runtime state', () => {
    const { actions, getData } = createSettingsActionHarness();

    actions.setTimezone(Number.NaN, 'c'.repeat(MAX_SETTINGS_TIMEZONE_CITY_CHARS + 1));

    expect(getData().settings.timezone).toEqual({
      offset: DEFAULT_SETTINGS.timezone.offset,
      city: 'c'.repeat(MAX_SETTINGS_TIMEZONE_CITY_CHARS),
    });

    actions.setTimezone(Number.POSITIVE_INFINITY, '   ');

    expect(getData().settings.timezone).toEqual(DEFAULT_SETTINGS.timezone);
  });

  it('normalizes theme ids before they enter runtime state', () => {
    const { actions, getData } = createSettingsActionHarness();

    actions.setThemeId(`  ${'t'.repeat(MAX_SETTINGS_UI_THEME_ID_CHARS + 1)}  `);

    expect(getData().settings.ui?.themeId).toBe('t'.repeat(MAX_SETTINGS_UI_THEME_ID_CHARS));
  });

  it('normalizes floating panel sizes before they enter runtime state', () => {
    const { actions, getData } = createSettingsActionHarness();

    actions.setNotesChatFloatingSize({ width: Number.NaN, height: Number.POSITIVE_INFINITY });
    expect(getData().settings.ui?.notesChatFloatingSize).toEqual(
      DEFAULT_SETTINGS.ui.notesChatFloatingSize,
    );

    actions.setNotesChatFloatingSize({ width: 9999.4, height: 1.2 });
    expect(getData().settings.ui?.notesChatFloatingSize).toEqual({ width: 760, height: 420 });
  });
});

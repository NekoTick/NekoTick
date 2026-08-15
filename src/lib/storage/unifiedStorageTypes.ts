import type { Provider, AIModel, ChatMessage, ChatSession, ProviderBenchmarkRecord } from '@/lib/ai/types';
import { DEFAULT_TIMEZONE } from '@/lib/config';

export interface CustomIcon {
  id: string;
  url: string;
  name: string;
  createdAt: number;
}

export interface TimezoneInfo {
  offset: number;
  city: string;
}

export interface MarkdownThemeSettings {
  importedThemeId?: string | null;
}

export interface FloatingPanelSize {
  width: number;
  height: number;
}

export interface UnifiedData {
  settings: {
    timezone: TimezoneInfo;
    markdown: {
      typewriterMode: boolean;
      theme?: Partial<MarkdownThemeSettings>;
      body?: {
        showLineNumbers?: boolean;
      };
      codeBlock: {
        showLineNumbers: boolean;
      };
    };
    ui?: {
      lastAppViewMode?: 'notes' | 'chat';
      lastChatSessionId?: string | null;
      colorMode?: 'system' | 'light' | 'dark';
      themeId?: string;
      notesChatFloatingSize?: FloatingPanelSize;
    };
  };
  customIcons?: CustomIcon[];
  deletedCustomIconIds?: string[];
  ai?: {
    providers: Provider[];
    models: AIModel[];
    benchmarkResults?: Record<string, ProviderBenchmarkRecord>;
    fetchedModels?: Record<string, string[]>;
    sessions: ChatSession[];
    messages: Record<string, ChatMessage[]>;
    unreadSessionIds?: string[];
    selectedModelId: string | null;
    currentSessionId: string | null;
    temporaryChatEnabled?: boolean;
    customSystemPrompt?: string;
    includeTimeContext?: boolean;
    webSearchEnabled?: boolean;
    deletedProviderIds?: string[];
    deletedSessionIds?: string[];
  };
}

export interface DataFile {
  version: 2;
  lastModified: number;
  data: UnifiedData;
}

export function createDefaultUnifiedData(): UnifiedData {
  return {
    settings: {
      timezone: { offset: DEFAULT_TIMEZONE, city: 'Beijing' },
      markdown: {
        typewriterMode: false,
        theme: {
          importedThemeId: null,
        },
        body: {
          showLineNumbers: false,
        },
        codeBlock: {
          showLineNumbers: false,
        },
      },
      ui: {
        lastAppViewMode: 'notes',
        colorMode: 'system',
        themeId: 'default',
        notesChatFloatingSize: {
          width: 420,
          height: 680,
        },
      },
    },
    customIcons: [],
    deletedCustomIconIds: [],
  };
}

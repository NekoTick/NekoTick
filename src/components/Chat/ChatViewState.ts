export interface ChatViewProps {
  mode?: 'full' | 'embedded';
  presentation?: 'desktop' | 'mobile';
  active?: boolean;
  onCloseEmbeddedPanel?: () => void;
  onPromoteEmbeddedPanel?: () => void;
  onStartupReady?: () => void;
  onPrimaryContentReady?: () => void;
}

export const EMPTY_MESSAGES: never[] = [];
export const EMPTY_SESSIONS: never[] = [];
export const EMPTY_PROVIDERS: never[] = [];
export const EMPTY_MODELS: never[] = [];

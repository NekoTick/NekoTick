import { SignInPromptPill } from './SignInPromptPill';

interface ErrorBlockProps {
  type?: string;
  code?: string;
  content: string;
  showLoginPrompt?: boolean;
}

export function ErrorBlock({ content, showLoginPrompt = false }: ErrorBlockProps) {
  if (showLoginPrompt) {
    return (
      <div className="w-full mb-2" data-no-focus-input="true">
        <SignInPromptPill />
      </div>
    );
  }

  return (
    <div className="w-full mb-2" data-no-focus-input="true">
      <div
        data-no-focus-input="true"
        data-chat-selection-surface="true"
        data-chat-selection-start="true"
        className="text-sm text-[var(--vlaina-color-brand-pink)] opacity-[var(--vlaina-opacity-90)] leading-relaxed select-text whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
      >
        {content}
      </div>
    </div>
  );
}

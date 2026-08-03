import { MAX_COMPOSER_PROGRAMMATIC_INSERT_CHARS } from './composerFocusRegistry';

export const MAX_CHAT_COMPOSER_INTERACTIVE_TEXT_CHARS = 16 * 1024;

export function limitChatComposerText(value: string): string {
  return value.length > MAX_COMPOSER_PROGRAMMATIC_INSERT_CHARS
    ? value.slice(0, MAX_COMPOSER_PROGRAMMATIC_INSERT_CHARS)
    : value;
}

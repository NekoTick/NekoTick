import {
  normalizeUrlSerializationArtifacts,
  stripEmptyMarkdownPlaceholders,
  stripTrailingNewlines,
} from './markdownSerializationDocument';
import {
  normalizeEscapedHighlightSyntax,
} from './markdownSerializationEditorBreaks';
import {
  normalizeEscapedAngleBracketText,
  unescapeMarkdownPunctuation,
} from './markdownSerializationEscapes';
import {
  normalizeInternalClipboardArtifacts,
  normalizeUserBreakSentinels,
} from './markdownSerializationSentinels';
import { BR_ONLY_PATTERN, MARKED_BLOCKQUOTE_USER_BR_PATTERN, MARKED_BLOCKQUOTE_USER_BR_WITH_DEPTH_PATTERN, MARKED_BR_ONLY_PATTERN, MARKED_USER_BR_PATTERN } from './markdownSerializationShared';
import { restoreUserAuthoredInternalArtifactComments } from './markdownInternalArtifactEscapes';

export function normalizeSerializedMarkdownSelection(text: string): string {
  const trimmedText = stripTrailingNewlines(text).trim();
  const isStandaloneBreak =
    isPlainStandaloneBreakLine(trimmedText) || MARKED_BR_ONLY_PATTERN.test(trimmedText);
  const normalizedPlaceholders = normalizeInternalClipboardArtifacts(text);
  const withoutTrailingNewlines = stripTrailingNewlines(
    normalizeUserBreakSentinels(stripEmptyMarkdownPlaceholders(normalizedPlaceholders))
  );
  if (
    isStandaloneBreak
    || (text.length > 0 && withoutTrailingNewlines.length === 0)
    || BR_ONLY_PATTERN.test(withoutTrailingNewlines.trim())
  ) return '\n';
  return restoreUserAuthoredInternalArtifactComments(normalizeUrlSerializationArtifacts(
    normalizeEscapedHighlightSyntax(normalizeEscapedAngleBracketText(
      unescapeMarkdownPunctuation(withoutTrailingNewlines)
    ))
  ));
}

export function isPlainStandaloneBreakLine(text: string): boolean {
  if (!BR_ONLY_PATTERN.test(text)) return false;
  return !MARKED_USER_BR_PATTERN.test(text)
    && !MARKED_BLOCKQUOTE_USER_BR_PATTERN.test(text)
    && !MARKED_BLOCKQUOTE_USER_BR_WITH_DEPTH_PATTERN.test(text);
}

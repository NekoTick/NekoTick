import { expect } from 'vitest';

const INTERNAL_VLAINA_HTML_ATTR_PATTERN =
  /\bdat[ae]-vlaina(?:-?(?:empty|empt)-line|-?list-gap|-?user-br|-?blockquote-depth)\b/i;
const SERIALIZER_SPACE_ENTITY_PATTERN = /&#(?:x0*20|0*32)(?:;|(?=$|[ \t]))/i;

export function expectPersistedMarkdownToBeClean(markdown: string): void {
  expect(markdown).not.toContain('\u0000');
  expect(markdown).not.toContain('\u200B');
  expect(markdown).not.toContain('\u200C');
  expect(markdown).not.toContain('\u2800');
  expect(markdown).not.toMatch(/VLAINA_(?:LIST_GAP|USER_BR)_SENTINEL/);
  expect(markdown).not.toMatch(
    /vlaina-(?:markdown-(?:blank-line|tight-heading)|rendered-html-boundary-blank-line)/i
  );
  expect(markdown).not.toMatch(INTERNAL_VLAINA_HTML_ATTR_PATTERN);
  expect(markdown).not.toMatch(SERIALIZER_SPACE_ENTITY_PATTERN);
}

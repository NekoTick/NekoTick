import { getMarkdownBlockContent } from '@/lib/markdown/markdownHtmlBlockClassification';
import { mapMarkdownOutsideProtectedSegments } from './markdownProtectedBlocks';

const USER_COMMENT_ESCAPE_PREFIX = 'vlaina-user-authored-internal-comment:';
const INTERNAL_ARTIFACT_COMMENT_CONTENT_PATTERN =
  /^\s*vlaina-(?:markdown-(?:blank-line|tight-heading)|rendered-html-boundary-blank-line)\s*$/i;
const HTML_COMMENT_OPEN_PATTERN = /^[ \t]*<!--/;
const HTML_COMMENT_CLOSE_PATTERN = /-->/;
const STANDALONE_HTML_COMMENT_PATTERN = /^([ \t]*<!--)([\s\S]*?)(-->\s*)$/;

export function protectUserAuthoredInternalArtifactCommentsForEditor(text: string): string {
  if (!hasEscapableUserComment(text)) return text;

  return mapStandaloneHtmlComments(text, (line, match) => {
    const content = match[2] ?? '';
    if (
      !INTERNAL_ARTIFACT_COMMENT_CONTENT_PATTERN.test(content)
      && !content.startsWith(USER_COMMENT_ESCAPE_PREFIX)
    ) {
      return line;
    }

    return `${match[1] ?? '<!--'}${USER_COMMENT_ESCAPE_PREFIX}${content}${match[3] ?? '-->'}`;
  });
}

export function restoreUserAuthoredInternalArtifactComments(text: string): string {
  if (!text.includes(USER_COMMENT_ESCAPE_PREFIX)) return text;

  return mapStandaloneHtmlComments(text, (line, match) => {
    const content = match[2] ?? '';
    if (!content.startsWith(USER_COMMENT_ESCAPE_PREFIX)) return line;

    return `${match[1] ?? '<!--'}${content.slice(USER_COMMENT_ESCAPE_PREFIX.length)}${match[3] ?? '-->'}`;
  });
}

function hasEscapableUserComment(text: string): boolean {
  const lower = text.toLowerCase();
  return lower.includes('vlaina-markdown-blank-line')
    || lower.includes('vlaina-markdown-tight-heading')
    || lower.includes('vlaina-rendered-html-boundary-blank-line')
    || text.includes(USER_COMMENT_ESCAPE_PREFIX);
}

function mapStandaloneHtmlComments(
  text: string,
  transform: (line: string, match: RegExpExecArray) => string,
): string {
  return mapMarkdownOutsideProtectedSegments(
    text,
    (segment) => {
      let activeMultilineComment = false;

      return segment.split('\n').map((line) => {
        const content = getMarkdownBlockContent(line);
        const standaloneMatch = STANDALONE_HTML_COMMENT_PATTERN.exec(content);

        if (activeMultilineComment) {
          if (!standaloneMatch && HTML_COMMENT_CLOSE_PATTERN.test(content)) {
            activeMultilineComment = false;
          }
          return line;
        }

        if (standaloneMatch) {
          const contentStart = line.length - content.length;
          return `${line.slice(0, contentStart)}${transform(content, standaloneMatch)}`;
        }

        if (
          HTML_COMMENT_OPEN_PATTERN.test(content)
          && !HTML_COMMENT_CLOSE_PATTERN.test(content)
        ) {
          activeMultilineComment = true;
        }
        return line;
      }).join('\n');
    },
    { protectHtmlComments: false, protectMathBlocks: false },
  );
}

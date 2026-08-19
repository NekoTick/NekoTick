import { isValidElement, memo, useMemo } from 'react';
import { writeTextToClipboard } from '@/lib/clipboard';
import { selectCodeBlockLineNumbersEnabled } from '@/stores/unified/settings/markdownSettings';
import { useUnifiedStore } from '@/stores/unified/useUnifiedStore';
import { CodeBlockHeader } from './CodeBlockHeader';
import { highlightMarkdownCode } from './highlighter';

interface ReadOnlyCodeBlockProps {
  className?: string;
  children: React.ReactNode;
  blockId?: string;
  copied?: boolean;
  onCopy?: (blockId: string) => void;
}

const LANGUAGE_CLASS_PATTERN = /language-([\w+-]+)/;
const MAX_HIGHLIGHT_CHARS = 20_000;
const MAX_LINE_NUMBER_LINES = 20_000;

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseLanguageFromClassName(className: string): string {
  const match = LANGUAGE_CLASS_PATTERN.exec(className);
  return match ? match[1] : '';
}

function extractCodePayload(
  className: string | undefined,
  children: React.ReactNode,
): { language: string; codeText: string } {
  if (isValidElement(children)) {
    const props = children.props as {
      className?: string;
      children?: React.ReactNode;
    };
    const nestedClassName = props.className || className || '';
    const nestedLanguage = parseLanguageFromClassName(nestedClassName);
    const nestedCodeText = String(props.children ?? '').replace(/\n$/, '');
    return { language: nestedLanguage, codeText: nestedCodeText };
  }

  const language = parseLanguageFromClassName(className || '');
  const codeText = String(children).replace(/\n$/, '');
  return { language, codeText };
}

function countCodeLines(codeText: string, maxLines = Number.POSITIVE_INFINITY): number {
  if (codeText.length === 0) return 1;

  let lineCount = 1;
  for (let index = 0; index < codeText.length; index += 1) {
    if (codeText.charCodeAt(index) === 10) {
      lineCount += 1;
      if (lineCount > maxLines) {
        return lineCount;
      }
    }
  }
  return lineCount;
}

function createLineNumbersText(lineCount: number): string {
  return Array.from({ length: lineCount }, (_value, index) => String(index + 1)).join('\n');
}

export const ReadOnlyCodeBlock = memo(function ReadOnlyCodeBlock({
  className,
  children,
  blockId,
  copied = false,
  onCopy,
}: ReadOnlyCodeBlockProps) {
  const { language, codeText } = extractCodePayload(className, children);
  const showLineNumbers = useUnifiedStore(selectCodeBlockLineNumbersEnabled);
  const lineNumbers = useMemo(() => {
    if (!showLineNumbers) {
      return '';
    }
    const lineCount = countCodeLines(codeText, MAX_LINE_NUMBER_LINES);
    return lineCount <= MAX_LINE_NUMBER_LINES ? createLineNumbersText(lineCount) : '';
  }, [codeText, showLineNumbers]);
  const shouldShowLineNumbers = showLineNumbers && lineNumbers.length > 0;

  const highlightedHTML = useMemo(() => {
    try {
      if (codeText.length > MAX_HIGHLIGHT_CHARS) {
        return escapeHtml(codeText);
      }
      return highlightMarkdownCode(codeText, language);
    } catch {
      return escapeHtml(codeText);
    }
  }, [codeText, language]);

  const handleCopy = async (content: string) => {
    const didCopy = await writeTextToClipboard(content);
    if (!didCopy) return false;

    if (blockId && onCopy) {
      onCopy(blockId);
    }
    return true;
  };

  return (
    <div className="code-block-chrome relative my-4 overflow-hidden rounded-2xl group">
      <CodeBlockHeader
        copied={copied}
        getCopyText={() => codeText}
        languageControl={(
          <span className="code-block-chrome-language-label">
            {language || 'text'}
          </span>
        )}
        onCopy={handleCopy}
      />
      <div className="code-block-chrome-body overflow-x-auto p-4 pt-0">
        {shouldShowLineNumbers && (
          <pre
            className="code-block-chrome-line-numbers"
            aria-hidden="true"
            data-chat-selection-excluded="true"
          >
            {lineNumbers}
          </pre>
        )}
        {highlightedHTML ? (
          <code
            className={`code-block-chrome-code block whitespace-pre font-mono hljs ${language} !bg-transparent !p-0`}
            dangerouslySetInnerHTML={{ __html: highlightedHTML }}
          />
        ) : (
          <pre className="m-0 p-0 bg-transparent">
            <code className={`code-block-chrome-code font-mono ${language}`}>
              {codeText}
            </code>
          </pre>
        )}
      </div>
    </div>
  );
});

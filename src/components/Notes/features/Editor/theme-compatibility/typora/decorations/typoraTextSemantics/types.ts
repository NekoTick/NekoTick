export type DecorationAttrs = Record<string, string>;

export interface InlineTextRun {
  from: number;
  to: number;
  text: string;
  isMarkdownSyntax?: boolean;
  hasEmphasis: boolean;
  hasInlineCode: boolean;
  hasStrong: boolean;
  hasSubscript: boolean;
  hasSuperscript: boolean;
  hasUnderline: boolean;
  hasVlookHighlight: boolean;
}

export type VlookTextBlockKind =
  | 'caption'
  | 'highlight'
  | 'emphasis'
  | 'strong'
  | 'tab-caption'
  | 'underline';

export interface InlineRange {
  from: number;
  to: number;
}

export interface EmphasisRun {
  from: number;
  to: number;
  hasInlineCode: boolean;
  hasPlainText: boolean;
  hasStrong: boolean;
  text: string;
  inlineCodeRanges: InlineRange[];
  highlightRanges: InlineRange[];
}

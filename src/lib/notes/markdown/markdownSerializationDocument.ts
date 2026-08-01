import {
  normalizeCanonicalMarkdownSpacingForPersistence, normalizeInlineHtmlTextForPersistence,
} from './markdownCanonicalSpacing';
import {
  collapseSyntheticBlankLinesAroundEmptyPlaceholders, collapseSyntheticBlankLinesBetweenAdjacentHeadings,
} from './markdownHeadingSpacing';
import { mapMarkdownOutsideProtectedBlocks, mapMarkdownOutsideProtectedSegments, } from './markdownProtectedBlocks';
import {
  normalizeEditorBreakPlaceholders,
  normalizeEditorEmptyParagraphBreaks,
  normalizeEmptyAtxHeadingMarkers,
  normalizeEscapedHighlightSyntax,
  normalizeStandaloneBreakHtmlToMarkdown,
  normalizeTableCellBreakPlaceholders,
} from './markdownSerializationEditorBreaks';
import {
  canUseLargePlainMarkdownNormalizationFastPath,
  normalizeEscapedAngleBracketText,
  normalizeEscapedUrlSchemes,
  normalizeMarkdownAutolinkLiterals,
  normalizeRedundantMarkdownEscapes,
  stripLeadingBom,
  unescapeMarkdownPunctuation,
} from './markdownSerializationEscapes';
import { normalizeGenericHtmlBlockClosingSpacing } from './markdownSerializationHtmlSpacing';
import { normalizeInternalMarkdownBlankLineComments } from './markdownSerializationInternalBlankComments';
import { normalizeInternalTightHeadingComments } from './markdownSerializationInternalTightComments';
import {
  protectUserAuthoredInternalArtifactCommentsForEditor,
  restoreUserAuthoredInternalArtifactComments,
} from './markdownInternalArtifactEscapes';
import { normalizeMailtoEmailMarkdownLinks } from './markdownSerializationLinks';
import {
  normalizeInternalClipboardArtifacts,
  normalizeLeakedInternalArtifacts,
  normalizeListItemBlankLines,
  normalizeUserBreakSentinels,
} from './markdownSerializationSentinels';
import {
  BLOCKQUOTE_CONTAINER_PREFIX_PATTERN,
  BR_ONLY_PATTERN,
  EMPTY_FOOTNOTE_DEFINITION_PLACEHOLDER_PATTERN,
  EMPTY_LIST_ITEM_PLACEHOLDER_PATTERN,
  EMPTY_TABLE_CELL_PLACEHOLDER_PATTERN,
  LEADING_MARKDOWN_SPACE_ENTITY_RUN_PATTERN,
  LIST_CONTAINER_PREFIX_PATTERN,
  MARKDOWN_SPACE_ENTITY_PATTERN,
  MARKDOWN_SPACE_ENTITY_REPLACEMENT_PATTERN,
  MARKED_EMPTY_MARKDOWN_LINE_PLACEHOLDER_PATTERN,
  MAX_CACHED_MARKDOWN_NORMALIZATION_LENGTH
} from './markdownSerializationShared';

let lastNormalizedMarkdownInput: string | null = null;
let lastNormalizedMarkdownOutput: string | null = null;

export function normalizeUrlSerializationArtifacts(text: string): string {
  return normalizeMailtoEmailMarkdownLinks(
    normalizeMarkdownAutolinkLiterals(normalizeEscapedUrlSchemes(text))
  );
}

export function normalizeMarkdownSpaceEntityArtifacts(text: string): string {
  if (!MARKDOWN_SPACE_ENTITY_PATTERN.test(text)) return text;

  return mapMarkdownOutsideProtectedSegments(text, (segment) =>
    segment.split('\n').map(normalizeMarkdownSpaceEntityLine).join('\n')
  );
}

export function normalizeMarkdownSpaceEntityLine(line: string): string {
  const contentStart = getMarkdownContainerContentStart(line);
  const leadingContent = line.slice(contentStart);
  const match = LEADING_MARKDOWN_SPACE_ENTITY_RUN_PATTERN.exec(leadingContent);
  if (!match) return line;

  return `${line.slice(0, contentStart)}${leadingContent.replace(
    LEADING_MARKDOWN_SPACE_ENTITY_RUN_PATTERN,
    (prefix) => prefix.replace(MARKDOWN_SPACE_ENTITY_REPLACEMENT_PATTERN, ' ')
  )}`;
}

export function getMarkdownContainerContentStart(line: string): number {
  let cursor = 0;

  while (cursor < line.length) {
    const blockquoteMatch = BLOCKQUOTE_CONTAINER_PREFIX_PATTERN.exec(line.slice(cursor));
    if (!blockquoteMatch) break;
    cursor += blockquoteMatch[0].length;
  }

  const listMatch = LIST_CONTAINER_PREFIX_PATTERN.exec(line.slice(cursor));
  if (listMatch) {
    cursor += listMatch[0].length;
  }

  return cursor;
}

export function stripEmptyMarkdownPlaceholders(text: string): string {
  return mapMarkdownOutsideProtectedBlocks(
    normalizeEditorBreakPlaceholders(text),
    (line) => line
      .replace(MARKED_EMPTY_MARKDOWN_LINE_PLACEHOLDER_PATTERN, (_match, prefix: string) =>
        prefix.trimEnd()
      )
      .replace(EMPTY_LIST_ITEM_PLACEHOLDER_PATTERN, (_match, prefix: string) =>
        prefix.trimEnd()
      )
      .replace(EMPTY_FOOTNOTE_DEFINITION_PLACEHOLDER_PATTERN, (_match, prefix: string) =>
        prefix.trimEnd()
      )
      .replace(EMPTY_TABLE_CELL_PLACEHOLDER_PATTERN, '$1 $2')
  );
}

export function stripTrailingNewlines(text: string): string {
  return text.replace(/\n+$/, '');
}

export function normalizeSerializedMarkdownBlock(text: string): string {
  const normalizedPlaceholders = normalizeInternalClipboardArtifacts(text);
  const withoutTrailingNewlines = stripTrailingNewlines(
    normalizeUserBreakSentinels(stripEmptyMarkdownPlaceholders(normalizedPlaceholders))
  );
  if (BR_ONLY_PATTERN.test(withoutTrailingNewlines.trim())) return '';
  return restoreUserAuthoredInternalArtifactComments(normalizeUrlSerializationArtifacts(
    normalizeEscapedHighlightSyntax(normalizeEscapedAngleBracketText(
      unescapeMarkdownPunctuation(withoutTrailingNewlines)
    ))
  ));
}

export function normalizeSerializedMarkdownDocument(text: string): string {
  if (text === lastNormalizedMarkdownInput && lastNormalizedMarkdownOutput !== null) {
    return lastNormalizedMarkdownOutput;
  }

  const source = stripLeadingBom(text);

  if (canUseLargePlainMarkdownNormalizationFastPath(source)) {
    return source;
  }

  const output = runMarkdownDocumentNormalizationPipeline(source).output;
  if (text.length <= MAX_CACHED_MARKDOWN_NORMALIZATION_LENGTH) {
    lastNormalizedMarkdownInput = text;
    lastNormalizedMarkdownOutput = output;
  } else {
    lastNormalizedMarkdownInput = null;
    lastNormalizedMarkdownOutput = null;
  }
  return output;
}

export function normalizeEditorStateMarkdownDocument(text: string): string {
  return normalizeEditorRuntimeMarkdownArtifactsForState(text);
}

export function normalizeEditorRuntimeMarkdownArtifacts(text: string): string {
  const protectedText = protectUserAuthoredInternalArtifactCommentsForEditor(text);
  const afterInternalTightHeadingComments = normalizeInternalTightHeadingComments(protectedText);
  const afterInternalMarkdownBlankLineComments =
    normalizeInternalMarkdownBlankLineComments(afterInternalTightHeadingComments);
  const afterStripPlaceholders = stripEmptyMarkdownPlaceholders(afterInternalMarkdownBlankLineComments);
  const afterEmptyParagraphBreaks = normalizeEditorEmptyParagraphBreaks(afterStripPlaceholders);
  const afterUserBreaks = normalizeUserBreakSentinels(afterEmptyParagraphBreaks);
  const afterListItems = normalizeListItemBlankLines(afterUserBreaks);
  const afterLeakedInternalArtifacts = normalizeUserBreakSentinels(
    normalizeLeakedInternalArtifacts(afterListItems)
  );
  const afterEmptyAtxHeadings = normalizeEmptyAtxHeadingMarkers(afterLeakedInternalArtifacts);
  const afterTableCellBreaks = normalizeTableCellBreakPlaceholders(afterEmptyAtxHeadings);
  const afterStandaloneBreakHtml = normalizeStandaloneBreakHtmlToMarkdown(afterTableCellBreaks);
  const afterMarkdownSpaceEntities = normalizeMarkdownSpaceEntityArtifacts(afterStandaloneBreakHtml);
  const afterEscapedAngleBracketText = normalizeEscapedAngleBracketText(afterMarkdownSpaceEntities);
  return restoreUserAuthoredInternalArtifactComments(
    normalizeRedundantMarkdownEscapes(afterEscapedAngleBracketText)
  );
}

export function normalizeEditorRuntimeMarkdownArtifactsForState(text: string): string {
  const source = protectUserAuthoredInternalArtifactCommentsForEditor(
    stripLeadingBom(text).replace(/\r\n?/g, '\n')
  );
  const afterInternalTightHeadingComments = normalizeInternalTightHeadingComments(source);
  const afterInternalMarkdownBlankLineComments =
    normalizeInternalMarkdownBlankLineComments(afterInternalTightHeadingComments);
  const afterStripPlaceholders = stripEmptyMarkdownPlaceholders(afterInternalMarkdownBlankLineComments);
  const afterEmptyParagraphBreaks = normalizeEditorEmptyParagraphBreaks(afterStripPlaceholders);
  const afterUserBreaks = normalizeUserBreakSentinels(afterEmptyParagraphBreaks);
  const afterListItems = normalizeListItemBlankLines(afterUserBreaks);
  const afterLeakedInternalArtifacts = normalizeUserBreakSentinels(
    normalizeLeakedInternalArtifacts(afterListItems)
  );
  const afterEmptyAtxHeadings = normalizeEmptyAtxHeadingMarkers(afterLeakedInternalArtifacts);
  const afterTableCellBreaks = normalizeTableCellBreakPlaceholders(afterEmptyAtxHeadings);
  const afterStandaloneBreakHtml = normalizeStandaloneBreakHtmlToMarkdown(afterTableCellBreaks);
  const afterInlineHtmlText = normalizeInlineHtmlTextForPersistence(afterStandaloneBreakHtml);
  const afterMarkdownSpaceEntities = normalizeMarkdownSpaceEntityArtifacts(afterInlineHtmlText);

  return restoreUserAuthoredInternalArtifactComments(
    normalizeMailtoEmailMarkdownLinks(
      normalizeMarkdownAutolinkLiterals(afterMarkdownSpaceEntities)
    )
  );
}

export function summarizeMarkdownNormalizationPipeline(text: string) {
  const pipeline = runMarkdownDocumentNormalizationPipeline(text);
  return Object.fromEntries(
    Object.entries(pipeline).map(([key, value]) => [
      key,
      {
        length: value.length,
        lines: value.length === 0 ? 0 : value.split('\n').length,
        preview: value.replace(/\r/g, '\\r').replace(/\n/g, '\\n').slice(0, 500),
      },
    ])
  );
}

export function runMarkdownDocumentNormalizationPipeline(text: string) {
  const afterInternalTightHeadingComments = normalizeInternalTightHeadingComments(text);
  const afterHeadingSpacing = collapseSyntheticBlankLinesBetweenAdjacentHeadings(afterInternalTightHeadingComments);
  const afterInternalMarkdownBlankLineComments =
    normalizeInternalMarkdownBlankLineComments(afterHeadingSpacing);
  const afterSyntheticBlankLines =
    collapseSyntheticBlankLinesAroundEmptyPlaceholders(afterInternalMarkdownBlankLineComments);
  const afterEscapedAngleBracketText = normalizeEscapedAngleBracketText(afterSyntheticBlankLines);
  const afterCanonicalSpacing = normalizeCanonicalMarkdownSpacingForPersistence(afterEscapedAngleBracketText);
  const afterGenericHtmlBlockClosingSpacing = normalizeGenericHtmlBlockClosingSpacing(afterCanonicalSpacing);
  const afterStripPlaceholders = stripEmptyMarkdownPlaceholders(afterGenericHtmlBlockClosingSpacing);
  const afterEmptyParagraphBreaks = normalizeEditorEmptyParagraphBreaks(afterStripPlaceholders);
  const afterUserBreaks = normalizeUserBreakSentinels(afterEmptyParagraphBreaks);
  const afterListItems = normalizeListItemBlankLines(afterUserBreaks);
  const afterLeakedInternalArtifacts = normalizeUserBreakSentinels(
    normalizeLeakedInternalArtifacts(afterListItems)
  );
  const afterEmptyAtxHeadings = normalizeEmptyAtxHeadingMarkers(afterLeakedInternalArtifacts);
  const afterEscapedHighlight = afterEmptyAtxHeadings;
  const afterAbbreviationDefinitions = afterEscapedHighlight;
  const afterTableCellBreaks = normalizeTableCellBreakPlaceholders(afterAbbreviationDefinitions);
  const afterStandaloneBreakHtml = normalizeStandaloneBreakHtmlToMarkdown(afterTableCellBreaks);
  const afterMarkdownSpaceEntities = normalizeMarkdownSpaceEntityArtifacts(afterStandaloneBreakHtml);
  const afterRedundantMarkdownEscapes = normalizeRedundantMarkdownEscapes(afterMarkdownSpaceEntities);
  const output = restoreUserAuthoredInternalArtifactComments(
    normalizeUrlSerializationArtifacts(afterRedundantMarkdownEscapes)
  );

  return {
    input: text,
    afterInternalTightHeadingComments,
    afterHeadingSpacing,
    afterInternalMarkdownBlankLineComments,
    afterSyntheticBlankLines,
    afterEscapedAngleBracketText,
    afterCanonicalSpacing,
    afterGenericHtmlBlockClosingSpacing,
    afterStripPlaceholders,
    afterEmptyParagraphBreaks,
    afterUserBreaks,
    afterListItems,
    afterLeakedInternalArtifacts,
    afterEmptyAtxHeadings,
    afterEscapedHighlight,
    afterAbbreviationDefinitions,
    afterTableCellBreaks,
    afterStandaloneBreakHtml,
    afterMarkdownSpaceEntities,
    afterRedundantMarkdownEscapes,
    output,
  };
}

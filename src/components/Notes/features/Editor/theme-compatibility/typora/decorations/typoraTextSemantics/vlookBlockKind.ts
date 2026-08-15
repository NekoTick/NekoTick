import { getTextContent } from './runs';
import type { InlineTextRun, VlookTextBlockKind } from './types';

function isEveryTextRun(
  runs: InlineTextRun[],
  predicate: (run: InlineTextRun) => boolean
): boolean {
  return runs.length > 0 &&
    runs.every((run) => run.text.trim() === '' || predicate(run));
}

export function getTextBlockVlookKind(
  node: any,
  runs: InlineTextRun[]
): VlookTextBlockKind | null {
  const visibleRuns = runs.filter((run) => !run.isMarkdownSyntax);
  if (node.type?.name !== 'paragraph' || visibleRuns.length === 0 || getTextContent(node).trim() === '') {
    return null;
  }

  if (
    isEveryTextRun(
      visibleRuns,
      (run) => run.hasEmphasis &&
        run.hasSuperscript &&
        !run.hasInlineCode &&
        !run.hasStrong
    )
  ) {
    return 'tab-caption';
  }

  if (isEveryTextRun(visibleRuns, (run) => run.hasEmphasis && run.hasVlookHighlight)) {
    return 'caption';
  }

  if (
    isEveryTextRun(
      visibleRuns,
      (run) => run.hasVlookHighlight && !run.hasEmphasis && !run.hasInlineCode
    )
  ) {
    return 'highlight';
  }

  if (
    isEveryTextRun(
      visibleRuns,
      (run) => run.hasStrong &&
        !run.hasInlineCode &&
        !run.hasEmphasis &&
        !run.hasVlookHighlight
    )
  ) {
    return 'strong';
  }

  if (
    isEveryTextRun(
      visibleRuns,
      (run) => run.hasUnderline &&
        !run.hasInlineCode &&
        !run.hasStrong &&
        !run.hasEmphasis &&
        !run.hasVlookHighlight
    )
  ) {
    return 'underline';
  }

  if (
    isEveryTextRun(
      visibleRuns,
      (run) => run.hasEmphasis &&
        !run.hasInlineCode &&
        !run.hasStrong &&
        !run.hasVlookHighlight &&
        !run.hasSuperscript &&
        !run.hasSubscript
    )
  ) {
    return 'emphasis';
  }

  return null;
}

import { Decoration } from '@milkdown/kit/prose/view';
import { getInlineTextRuns } from './runs';
import { getTextBlockVlookKind } from './vlookBlockKind';
import { getCombinedClass, getVlookAccentToken } from './vlookTokens';
import type { DecorationAttrs, EmphasisRun } from './types';

export function pushTyporaInlineClass(
  decorations: Decoration[],
  from: number,
  to: number,
  className: string
) {
  if (to <= from) return;
  decorations.push(Decoration.inline(from, to, { class: className }));
}

export function pushTyporaInlineAttrs(
  decorations: Decoration[],
  from: number,
  to: number,
  attrs: DecorationAttrs
) {
  if (to <= from) return;
  decorations.push(Decoration.inline(from, to, attrs));
}

function pushEmphasisRunDecorations(decorations: Decoration[], run: EmphasisRun | null) {
  if (!run) return;
  const accentToken = getVlookAccentToken(run.text);
  const hasMultipleInlineCodeRanges = run.inlineCodeRanges.length > 1;

  if (run.hasStrong) {
    pushTyporaInlineClass(
      decorations,
      run.from,
      run.to,
      getCombinedClass('v-coating', accentToken, 'em')
    );
  }

  for (const range of run.highlightRanges) {
    pushTyporaInlineClass(
      decorations,
      range.from,
      range.to,
      getCombinedClass('v-stepwise', accentToken)
    );
  }

  if (!run.hasInlineCode) return;

  if (run.hasPlainText) {
    pushTyporaInlineClass(
      decorations,
      run.from,
      run.to,
      getCombinedClass(
        'v-badge-name',
        accentToken,
        hasMultipleInlineCodeRanges ? 'hastwo' : null
      )
    );

    for (const range of run.inlineCodeRanges) {
      pushTyporaInlineClass(
        decorations,
        range.from,
        range.to,
        getCombinedClass('v-badge-value', hasMultipleInlineCodeRanges ? 'hastwo' : null)
      );
    }
    return;
  }

  for (const range of run.inlineCodeRanges) {
    pushTyporaInlineClass(
      decorations,
      range.from,
      range.to,
      getCombinedClass('v-tag', accentToken, 'em')
    );
  }
}

export function addTyporaInlineDecorations(
  decorations: Decoration[],
  node: any,
  pos: number
) {
  const runs = getInlineTextRuns(node, pos);
  const visibleRuns = runs.filter((run) => !run.isMarkdownSyntax);
  const textBlockKind = getTextBlockVlookKind(node, runs);
  if (textBlockKind === 'caption') {
    const first = visibleRuns[0];
    const last = visibleRuns[visibleRuns.length - 1];
    pushTyporaInlineClass(decorations, first.from, last.to, 'v-cap-1');
    return;
  }

  if (textBlockKind === 'tab-caption') {
    const first = visibleRuns[0];
    const last = visibleRuns[visibleRuns.length - 1];
    pushTyporaInlineClass(decorations, first.from, last.to, 'v-tab-caption-label');
    return;
  }

  if (textBlockKind === 'highlight' || textBlockKind === 'emphasis') {
    return;
  }

  let emphasisRun: EmphasisRun | null = null;
  let syntaxGapSincePreviousRun = false;

  const flush = () => {
    pushEmphasisRunDecorations(decorations, emphasisRun);
    emphasisRun = null;
  };

  for (const run of runs) {
    if (run.isMarkdownSyntax) {
      syntaxGapSincePreviousRun = true;
      continue;
    }

    if (!run.hasEmphasis) {
      flush();
      syntaxGapSincePreviousRun = false;
      continue;
    }

    if (!emphasisRun || (emphasisRun.to !== run.from && !syntaxGapSincePreviousRun)) {
      flush();
      emphasisRun = {
        from: run.from,
        to: run.to,
        hasInlineCode: false,
        hasPlainText: false,
        hasStrong: false,
        text: '',
        inlineCodeRanges: [],
        highlightRanges: [],
      };
    } else {
      emphasisRun.to = run.to;
    }

    emphasisRun.text += run.text;

    if (run.hasInlineCode) {
      emphasisRun.hasInlineCode = true;
      emphasisRun.inlineCodeRanges.push({ from: run.from, to: run.to });
    } else {
      emphasisRun.hasPlainText = true;
    }

    if (run.hasStrong) {
      emphasisRun.hasStrong = true;
    }

    if (run.hasVlookHighlight) {
      emphasisRun.highlightRanges.push({ from: run.from, to: run.to });
    }

    syntaxGapSincePreviousRun = false;
  }

  flush();
}

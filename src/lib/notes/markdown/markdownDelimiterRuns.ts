interface MarkdownDelimiterRun {
  canClose: boolean;
  canOpen: boolean;
  length: number;
  rawEnd: number;
  rawStart: number;
}

function isWhitespace(value: string | undefined): boolean {
  return value === undefined || /\s/u.test(value);
}

function isPunctuation(value: string | undefined): boolean {
  return value !== undefined && /[\p{P}\p{S}]/u.test(value);
}

function getDelimiterFlanking(
  previous: string | undefined,
  next: string | undefined,
  marker: string,
): Pick<MarkdownDelimiterRun, 'canClose' | 'canOpen'> {
  const previousIsWhitespace = isWhitespace(previous);
  const nextIsWhitespace = isWhitespace(next);
  const previousIsPunctuation = isPunctuation(previous);
  const nextIsPunctuation = isPunctuation(next);
  const leftFlanking = !nextIsWhitespace
    && (!nextIsPunctuation || previousIsWhitespace || previousIsPunctuation);
  const rightFlanking = !previousIsWhitespace
    && (!previousIsPunctuation || nextIsWhitespace || nextIsPunctuation);

  if (marker !== '_') {
    return { canClose: rightFlanking, canOpen: leftFlanking };
  }
  return {
    canClose: rightFlanking && (!leftFlanking || nextIsPunctuation),
    canOpen: leftFlanking && (!rightFlanking || previousIsPunctuation),
  };
}

function collectDelimiterRuns(
  segment: string,
  marker: string,
  start: number,
  end: number,
): MarkdownDelimiterRun[] {
  const runs: MarkdownDelimiterRun[] = [];

  for (let index = start; index < end;) {
    const isEscapedMarker = segment[index] === '\\' && segment[index + 1] === marker;
    if (segment[index] !== marker && !isEscapedMarker) {
      index += 1;
      continue;
    }

    const rawStart = index;
    let length = 0;
    while (index < end) {
      if (segment[index] === marker) {
        length += 1;
        index += 1;
        continue;
      }
      if (segment[index] === '\\' && segment[index + 1] === marker) {
        length += 1;
        index += 2;
        continue;
      }
      break;
    }

    runs.push({
      ...getDelimiterFlanking(segment[rawStart - 1], segment[index], marker),
      length,
      rawEnd: index,
      rawStart,
    });
  }

  return runs;
}

function canPair(left: MarkdownDelimiterRun, right: MarkdownDelimiterRun, marker: string): boolean {
  return marker !== '~' || left.length === right.length;
}

export function isUnpairedMarkdownDelimiterRun(
  segment: string,
  slashIndex: number,
  marker: string,
): boolean {
  const paragraphStart = segment.lastIndexOf('\n\n', slashIndex - 1) + 1;
  const nextParagraph = segment.indexOf('\n\n', slashIndex);
  const paragraphEnd = nextParagraph === -1 ? segment.length : nextParagraph;
  const runs = collectDelimiterRuns(segment, marker, paragraphStart, paragraphEnd);
  const targetIndex = runs.findIndex(
    (run) => slashIndex >= run.rawStart && slashIndex < run.rawEnd,
  );
  if (targetIndex === -1) return false;

  const target = runs[targetIndex]!;
  const hasEarlierOpener = target.canClose && runs.slice(0, targetIndex)
    .some((run) => run.canOpen && canPair(run, target, marker));
  const hasLaterCloser = target.canOpen && runs.slice(targetIndex + 1)
    .some((run) => run.canClose && canPair(target, run, marker));
  return !hasEarlierOpener && !hasLaterCloser;
}

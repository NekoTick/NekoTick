let graphemeSegmenter: Intl.Segmenter | null = null;

function getGraphemeSegmenter(): Intl.Segmenter | null {
  if (typeof Intl.Segmenter !== 'function') {
    return null;
  }
  graphemeSegmenter ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  return graphemeSegmenter;
}

export function* iterateGraphemes(value: string): Iterable<string> {
  const segmenter = getGraphemeSegmenter();
  if (segmenter) {
    for (const part of segmenter.segment(value)) {
      yield part.segment;
    }
    return;
  }

  yield* Array.from(value);
}

export function getGraphemeOffsets(value: string): number[] {
  const offsets = [0];
  let offset = 0;
  for (const grapheme of iterateGraphemes(value)) {
    offset += grapheme.length;
    offsets.push(offset);
  }
  return offsets;
}

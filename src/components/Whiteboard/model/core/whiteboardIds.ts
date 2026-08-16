export function getNextWhiteboardIdSequence(items: { id: string }[], prefix: string): number {
  let maxSequence = 0;
  for (const item of items) {
    if (!item.id.startsWith(prefix)) continue;
    const suffix = item.id.slice(prefix.length);
    const sequence = /^(\d+)(?:-|$)/.exec(suffix)?.[1];
    if (!sequence) continue;
    maxSequence = Math.max(maxSequence, Number.parseInt(sequence, 10));
  }
  return maxSequence + 1;
}

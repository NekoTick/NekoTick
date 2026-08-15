import type { Node as ProseNode } from '@milkdown/kit/prose/model';
import type { Transaction } from '@milkdown/kit/prose/state';

function positionTouchesSyntax(doc: ProseNode, pos: number): boolean {
  const syntax = doc.type.schema.marks.markdownSyntax;
  if (!syntax) return false;
  const resolved = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
  return Boolean(
    syntax.isInSet(resolved.marks())
    || (resolved.nodeBefore && syntax.isInSet(resolved.nodeBefore.marks))
    || (resolved.nodeAfter && syntax.isInSet(resolved.nodeAfter.marks)),
  );
}

export function transactionTouchesMarkdownSyntax(transaction: Transaction): boolean {
  const syntax = transaction.before.type.schema.marks.markdownSyntax;
  if (!syntax) return false;

  let touches = false;
  for (let index = 0; index < transaction.steps.length; index += 1) {
    const step = transaction.steps[index];
    const before = transaction.docs[index] ?? transaction.before;
    step.getMap().forEach((oldStart, oldEnd) => {
      if (touches) return;
      const from = Math.max(0, Math.min(oldStart, before.content.size));
      const to = Math.max(from, Math.min(oldEnd, before.content.size));
      touches = from < to
        ? before.rangeHasMark(from, to, syntax)
        : positionTouchesSyntax(before, from);
    });
    if (touches) break;
  }
  return touches;
}

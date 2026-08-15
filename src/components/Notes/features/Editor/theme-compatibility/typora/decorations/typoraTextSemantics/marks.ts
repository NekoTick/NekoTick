export const VLOOK_HIGHLIGHT_MARKS = ['highlight', 'bgColor'] as const;

export function hasMark(node: any, markName: string): boolean {
  return Array.isArray(node.marks) &&
    node.marks.some((mark: any) => mark.type?.name === markName);
}

export function hasAnyMark(node: any, markNames: readonly string[]): boolean {
  return markNames.some((markName) => hasMark(node, markName));
}

export function textNodeHasMark(node: any, markName: string): boolean {
  if (node.isText) return !hasMark(node, 'markdownSyntax') && hasMark(node, markName);
  let matched = false;
  node.descendants?.((child: any) => {
    if (child.isText && !hasMark(child, 'markdownSyntax') && hasMark(child, markName)) {
      matched = true;
      return false;
    }
    return true;
  });
  return matched;
}

export function nodeHasAnyMark(node: any, markNames: readonly string[]): boolean {
  return markNames.some((markName) => textNodeHasMark(node, markName));
}

export function everyTextNodeHasMark(node: any, markName: string): boolean {
  let sawText = false;
  let allMatched = true;
  node.descendants?.((child: any) => {
    if (!child.isText || child.text === '' || hasMark(child, 'markdownSyntax')) return true;
    sawText = true;
    if (!hasMark(child, markName)) {
      allMatched = false;
      return false;
    }
    return true;
  });
  return sawText && allMatched;
}

export function everyTextNodeHasAnyMark(node: any, markNames: readonly string[]): boolean {
  let sawText = false;
  let allMatched = true;
  node.descendants?.((child: any) => {
    if (!child.isText || child.text === '' || hasMark(child, 'markdownSyntax')) return true;
    sawText = true;
    if (!hasAnyMark(child, markNames)) {
      allMatched = false;
      return false;
    }
    return true;
  });
  return sawText && allMatched;
}

export const MAX_GIT_DIFF_PREVIEW_CHARS = 4 * 1024 * 1024;
export const MAX_GIT_DIFF_PREVIEW_LINES = 12_000;

export function getGitDiffPreviewSize(diff: string) {
  let lines = diff ? 1 : 0;
  for (let index = diff.indexOf('\n'); index !== -1; index = diff.indexOf('\n', index + 1)) {
    lines += 1;
  }
  return { chars: diff.length, lines };
}

export function exceedsGitDiffPreviewBudget(diffs: string | string[]) {
  let chars = 0;
  let lines = 0;
  for (const diff of Array.isArray(diffs) ? diffs : [diffs]) {
    const size = getGitDiffPreviewSize(diff);
    chars += size.chars;
    lines += size.lines;
    if (chars > MAX_GIT_DIFF_PREVIEW_CHARS || lines > MAX_GIT_DIFF_PREVIEW_LINES) return true;
  }
  return false;
}

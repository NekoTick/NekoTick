import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const MAX_SNAPSHOT_FILES = 1000;
const MAX_SNAPSHOT_DEPTH = 12;
const MAX_TEXT_FILE_BYTES = 256 * 1024;
const MAX_TOTAL_TEXT_BYTES = 4 * 1024 * 1024;
const MAX_FILE_CHANGES = 12;
const MAX_PATCH_LINES = 240;
const MAX_PATCH_CHARS = 4000;
const MAX_TOTAL_PATCH_CHARS = 6000;
const MAX_DIFF_MATRIX_CELLS = 100_000;
const MAX_CHANGE_PATH_CHARS = 256;
const SKIPPED_DIRECTORIES = new Set([
  '.git', '.hg', '.svn', '.cache', '.next', '.nuxt', '.output', '.pnpm',
  'build', 'coverage', 'credentials', 'dist', 'keyrings', 'node_modules',
  'secrets', 'target',
]);
const UNSAFE_PATH_CHARS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\uFFFD]/u;

function safeRelativePath(value) {
  if (!value || value.length > MAX_CHANGE_PATH_CHARS || UNSAFE_PATH_CHARS.test(value)) return null;
  return value.split(path.sep).join('/');
}

function isTextBuffer(buffer) {
  return !buffer.subarray(0, 8192).includes(0);
}

async function readSnapshotFile(filePath, info, budget) {
  if (info.size > MAX_TEXT_FILE_BYTES || budget.remaining < info.size) {
    budget.truncated = true;
    return { size: info.size, mtimeMs: info.mtimeMs, text: null };
  }
  try {
    const buffer = await readFile(filePath);
    if (buffer.byteLength !== info.size || !isTextBuffer(buffer)) {
      return { size: info.size, mtimeMs: info.mtimeMs, text: null };
    }
    budget.remaining -= buffer.byteLength;
    return { size: info.size, mtimeMs: info.mtimeMs, text: buffer.toString('utf8') };
  } catch {
    budget.truncated = true;
    return { size: info.size, mtimeMs: info.mtimeMs, text: null };
  }
}

export async function captureDesktopCommandSnapshot(rootPath) {
  const files = new Map();
  const budget = { remaining: MAX_TOTAL_TEXT_BYTES, truncated: false };
  const directories = [{ absolute: rootPath, relative: '', depth: 0 }];

  while (directories.length > 0 && files.size < MAX_SNAPSHOT_FILES) {
    const current = directories.shift();
    let entries;
    try {
      const directoryInfo = await lstat(current.absolute);
      if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) {
        budget.truncated = true;
        continue;
      }
      entries = await readdir(current.absolute, { withFileTypes: true });
    } catch {
      budget.truncated = true;
      continue;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (files.size >= MAX_SNAPSHOT_FILES) {
        budget.truncated = true;
        break;
      }
      if (entry.name.startsWith('.')) continue;
      const relative = current.relative ? path.join(current.relative, entry.name) : entry.name;
      const safePath = safeRelativePath(relative);
      if (!safePath || entry.isSymbolicLink()) continue;
      const absolute = path.join(current.absolute, entry.name);
      if (entry.isDirectory()) {
        if (SKIPPED_DIRECTORIES.has(entry.name)) {
          continue;
        } else if (current.depth < MAX_SNAPSHOT_DEPTH) {
          directories.push({ absolute, relative, depth: current.depth + 1 });
        } else {
          budget.truncated = true;
        }
        continue;
      }
      if (!entry.isFile()) continue;
      try {
        const info = await lstat(absolute);
        if (!info.isFile() || info.isSymbolicLink()) continue;
        files.set(safePath, await readSnapshotFile(absolute, info, budget));
      } catch {
        budget.truncated = true;
      }
    }
  }

  return { files, truncated: budget.truncated };
}

function splitLines(value) {
  if (!value) return [];
  const normalized = value.replace(/\r\n/g, '\n');
  return (normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized).split('\n');
}

function diffMiddleLines(before, after) {
  if (before.length === 0) {
    return { lines: after.map((line) => `+${line}`), additions: after.length, deletions: 0, truncated: false };
  }
  if (after.length === 0) {
    return { lines: before.map((line) => `-${line}`), additions: 0, deletions: before.length, truncated: false };
  }
  if ((before.length + 1) * (after.length + 1) > MAX_DIFF_MATRIX_CELLS) {
    return {
      lines: [...before.map((line) => `-${line}`), ...after.map((line) => `+${line}`)],
      additions: after.length,
      deletions: before.length,
      truncated: true,
    };
  }

  const width = after.length + 1;
  const matrix = new Uint32Array((before.length + 1) * width);
  for (let left = before.length - 1; left >= 0; left -= 1) {
    for (let right = after.length - 1; right >= 0; right -= 1) {
      const index = left * width + right;
      matrix[index] = before[left] === after[right]
        ? matrix[(left + 1) * width + right + 1] + 1
        : Math.max(matrix[(left + 1) * width + right], matrix[index + 1]);
    }
  }

  const lines = [];
  let additions = 0;
  let deletions = 0;
  let left = 0;
  let right = 0;
  while (left < before.length || right < after.length) {
    if (left < before.length && right < after.length && before[left] === after[right]) {
      lines.push(` ${before[left]}`);
      left += 1;
      right += 1;
    } else if (
      right < after.length &&
      (left >= before.length || matrix[left * width + right + 1] > matrix[(left + 1) * width + right])
    ) {
      lines.push(`+${after[right]}`);
      additions += 1;
      right += 1;
    } else {
      lines.push(`-${before[left]}`);
      deletions += 1;
      left += 1;
    }
  }
  return { lines, additions, deletions, truncated: false };
}

function buildLineOperations(beforeText, afterText) {
  const before = splitLines(beforeText);
  const after = splitLines(afterText);
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < before.length - prefix && suffix < after.length - prefix
    && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) suffix += 1;
  const beforeMiddle = before.slice(prefix, before.length - suffix);
  const afterMiddle = after.slice(prefix, after.length - suffix);
  const middle = diffMiddleLines(beforeMiddle, afterMiddle);
  const contextBefore = before.slice(Math.max(0, prefix - 3), prefix).map((line) => ` ${line}`);
  const contextAfter = after.slice(after.length - suffix, after.length - suffix + 3).map((line) => ` ${line}`);
  const lines = [
    `@@ -${prefix + 1},${beforeMiddle.length} +${prefix + 1},${afterMiddle.length} @@`,
    ...contextBefore,
    ...middle.lines,
    ...contextAfter,
  ];
  const clippedLines = lines.slice(0, MAX_PATCH_LINES);
  const patch = clippedLines.join('\n').slice(0, MAX_PATCH_CHARS);
  return {
    additions: middle.additions,
    deletions: middle.deletions,
    patch,
    truncated: middle.truncated || lines.length > clippedLines.length || patch.length < clippedLines.join('\n').length,
  };
}

function changedWithoutText(before, after) {
  return before.size !== after.size || before.mtimeMs !== after.mtimeMs;
}

export function compareDesktopCommandSnapshots(before, after) {
  const paths = [...new Set([...before.files.keys(), ...after.files.keys()])].sort();
  const changes = [];
  let truncated = before.truncated || after.truncated;
  let remainingPatchChars = MAX_TOTAL_PATCH_CHARS;

  for (const filePath of paths) {
    const previous = before.files.get(filePath);
    const next = after.files.get(filePath);
    if (previous && next && previous.text === next.text && !changedWithoutText(previous, next)) continue;
    if (previous && next && previous.text !== null && next.text !== null && previous.text === next.text) continue;
    if (!previous && !next) continue;
    if (changes.length >= MAX_FILE_CHANGES) {
      truncated = true;
      break;
    }
    const kind = !previous ? 'added' : !next ? 'deleted' : 'modified';
    const textAvailable = (!previous || previous.text !== null) && (!next || next.text !== null);
    const rawDetail = textAvailable
      ? buildLineOperations(previous?.text || '', next?.text || '')
      : { additions: 0, deletions: 0, patch: '', truncated: true };
    const patch = rawDetail.patch.slice(0, remainingPatchChars);
    const detail = {
      ...rawDetail,
      patch,
      truncated: rawDetail.truncated || patch.length < rawDetail.patch.length,
    };
    remainingPatchChars -= patch.length;
    changes.push({ path: filePath, kind, ...detail });
    truncated ||= detail.truncated;
  }

  return { changes, truncated };
}

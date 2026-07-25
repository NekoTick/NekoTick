import { randomUUID } from 'node:crypto';
import { rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runGit } from './gitCommand.mjs';
import { resolveRelativeGitPath } from './gitValidation.mjs';

const DIFF_MAX_BUFFER_BYTES = 16 * 1024 * 1024;
const MAX_WORKING_DIFF_PATHS = 200;

async function readAddedFilesDiff(rootPath, filePaths, hasHead) {
  const existingPaths = (await Promise.all(filePaths.map(async (filePath) => {
    const info = await stat(path.join(rootPath, filePath)).catch(() => null);
    return info?.isFile() ? filePath : null;
  }))).filter(Boolean);
  if (existingPaths.length === 0) return '';

  const temporaryIndexPath = path.join(os.tmpdir(), `vlaina-git-diff-index-${randomUUID()}`);
  const env = { GIT_INDEX_FILE: temporaryIndexPath };
  try {
    await runGit(rootPath, hasHead ? ['read-tree', 'HEAD'] : ['read-tree', '--empty'], { env });
    await runGit(rootPath, [
      '--literal-pathspecs', 'add', '--intent-to-add', '--', ...existingPaths,
    ], { env });
    return (await runGit(rootPath, [
      '--literal-pathspecs', 'diff', '--no-ext-diff', '--no-textconv', '--no-color',
      '--', ...existingPaths,
    ], { env, maxBuffer: DIFF_MAX_BUFFER_BYTES })).stdout;
  } finally {
    await Promise.all([
      rm(temporaryIndexPath, { force: true }),
      rm(`${temporaryIndexPath}.lock`, { force: true }),
    ]).catch(() => {});
  }
}

export async function readGitWorkingDiff(rootPath, filePaths) {
  if (!Array.isArray(filePaths) || filePaths.length < 1 || filePaths.length > MAX_WORKING_DIFF_PATHS) {
    throw new Error(`Git diff requires between 1 and ${MAX_WORKING_DIFF_PATHS} file paths.`);
  }
  const relativePaths = Array.from(new Set(filePaths.map((filePath) => (
    resolveRelativeGitPath(rootPath, filePath)
  ))));
  const head = await runGit(rootPath, ['rev-parse', '--verify', 'HEAD'], { allowedExitCodes: [128] });
  if (head.code !== 0) return readAddedFilesDiff(rootPath, relativePaths, false);

  const trackedPaths = new Set((await runGit(rootPath, [
    '--literal-pathspecs', 'ls-files', '-z', '--', ...relativePaths,
  ])).stdout.split('\0').filter(Boolean));
  const trackedDiff = (await runGit(rootPath, [
    '--literal-pathspecs', 'diff', '--no-ext-diff', '--no-textconv', '--no-color',
    'HEAD', '--', ...relativePaths,
  ], { maxBuffer: DIFF_MAX_BUFFER_BYTES })).stdout;
  const untrackedDiff = await readAddedFilesDiff(
    rootPath,
    relativePaths.filter((filePath) => !trackedPaths.has(filePath)),
    true,
  );
  return [trackedDiff, untrackedDiff].filter(Boolean).join('\n');
}

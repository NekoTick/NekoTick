import { copyFile, mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  assertAuthorizedFsPath,
  assertAuthorizedFsRenameTarget,
  updateAuthorizedRootRename,
} from './fsAccess.mjs';
import { notifyDesktopWatchRename } from './desktopWatchIpc.mjs';
import { writeFileAtomically, writeFileAtomicallyIfUnchanged } from './desktopAtomicFile.mjs';
import {
  assertCopyableDesktopFile,
  assertWritableDesktopByteLength,
  describeDesktopDirectoryEntry,
  normalizeDesktopListEntryLimit,
  normalizeDesktopBinaryWriteBytes,
  normalizeDesktopTextWriteContent,
  prioritizeDesktopDirectoryEntriesForListing,
  readDesktopDirectoryEntriesForListing,
  readDesktopFileBytes,
} from './desktopFsHelpers.mjs';

export function isPathInsideDirectory(parentPath, candidatePath) {
  const relative = path.relative(path.resolve(parentPath), path.resolve(candidatePath));
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

export function registerDesktopFsIpc({ handleIpc }) {
  handleIpc('desktop:fs:write-binary', async (_event, filePath, bytes) => {
    await writeFileAtomically(
      await assertAuthorizedFsPath(filePath),
      normalizeDesktopBinaryWriteBytes(bytes),
    );
  });

  handleIpc('desktop:fs:read-binary', async (_event, filePath, maxBytes) => {
    return new Uint8Array(await readDesktopFileBytes(await assertAuthorizedFsPath(filePath), maxBytes));
  });

  handleIpc('desktop:fs:read-text', async (_event, filePath, maxBytes) => {
    return (await readDesktopFileBytes(await assertAuthorizedFsPath(filePath), maxBytes)).toString('utf8');
  });

  handleIpc('desktop:fs:write-text', async (_event, filePath, content, options) => {
    const resolvedPath = await assertAuthorizedFsPath(filePath);
    const text = normalizeDesktopTextWriteContent(content, options?.maxBytes);

    if (options?.recursive) {
      await mkdir(path.dirname(resolvedPath), { recursive: true });
    }

    if (options?.append) {
      const previous = await readDesktopFileBytes(resolvedPath, options?.maxBytes)
        .then((bytes) => bytes.toString('utf8'))
        .catch((error) => {
          if (error && typeof error === 'object' && error.code === 'ENOENT') {
            return '';
          }
          throw error;
        });
      assertWritableDesktopByteLength(
        Buffer.byteLength(previous, 'utf8') + Buffer.byteLength(text, 'utf8'),
        options?.maxBytes,
      );
      await writeFileAtomically(resolvedPath, previous + text);
      return;
    }

    await writeFileAtomically(resolvedPath, text);
  });

  handleIpc('desktop:fs:write-text-if-unchanged', async (_event, filePath, expectedContent, content) => {
    const resolvedPath = await assertAuthorizedFsPath(filePath);
    const expectedText = expectedContent === null
      ? null
      : normalizeDesktopTextWriteContent(expectedContent);
    const text = normalizeDesktopTextWriteContent(content);
    return writeFileAtomicallyIfUnchanged(resolvedPath, expectedText, text);
  });

  handleIpc('desktop:fs:exists', async (_event, filePath) => {
    if (typeof filePath !== 'string' || !filePath.trim()) {
      return false;
    }

    try {
      await stat(await assertAuthorizedFsPath(filePath));
      return true;
    } catch {
      return false;
    }
  });

  handleIpc('desktop:fs:mkdir', async (_event, filePath, recursive) => {
    await mkdir(await assertAuthorizedFsPath(filePath), { recursive: Boolean(recursive) });
  });

  handleIpc('desktop:fs:delete-file', async (_event, filePath) => {
    await rm(await assertAuthorizedFsPath(filePath), { force: true });
  });

  handleIpc('desktop:fs:delete-dir', async (_event, filePath, recursive) => {
    await rm(await assertAuthorizedFsPath(filePath), { recursive: Boolean(recursive), force: true });
  });

  handleIpc('desktop:fs:list-dir', async (_event, filePath, maxEntries) => {
    const resolvedPath = await assertAuthorizedFsPath(filePath);
    const resultLimit = normalizeDesktopListEntryLimit(maxEntries);

    let entries;
    try {
      entries = await readDesktopDirectoryEntriesForListing(resolvedPath, resultLimit);
    } catch (error) {
      if (error && typeof error === 'object' && error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
    const result = [];
    const prioritizedEntries = entries.length > resultLimit
      ? prioritizeDesktopDirectoryEntriesForListing(entries)
      : entries;
    for (const entry of prioritizedEntries) {
      if (result.length >= resultLimit) {
        break;
      }
      const describedEntry = describeDesktopDirectoryEntry(resolvedPath, entry);
      result.push(describedEntry instanceof Promise ? await describedEntry : describedEntry);
    }
    return result;
  });

  handleIpc('desktop:fs:rename', async (_event, oldPath, newPath) => {
    const resolvedOldPath = await assertAuthorizedFsPath(oldPath);
    const resolvedNewPath = await assertAuthorizedFsRenameTarget(resolvedOldPath, newPath);
    const oldInfo = await stat(resolvedOldPath);
    if (oldInfo.isDirectory() && isPathInsideDirectory(resolvedOldPath, resolvedNewPath)) {
      throw new Error(`Cannot move a directory into itself: ${resolvedOldPath}`);
    }

    await rename(resolvedOldPath, resolvedNewPath);
    await updateAuthorizedRootRename(resolvedOldPath, resolvedNewPath);
    notifyDesktopWatchRename(resolvedOldPath, resolvedNewPath);
  });

  handleIpc('desktop:fs:copy-file', async (_event, sourcePath, targetPath, maxBytes) => {
    const resolvedSourcePath = await assertAuthorizedFsPath(sourcePath);
    await assertCopyableDesktopFile(resolvedSourcePath, maxBytes);
    await copyFile(resolvedSourcePath, await assertAuthorizedFsPath(targetPath));
  });

  handleIpc('desktop:fs:stat', async (_event, filePath) => {
    const resolvedPath = await assertAuthorizedFsPath(filePath);
    try {
      const info = await stat(resolvedPath);
      return {
        name: path.basename(resolvedPath),
        path: resolvedPath,
        isDirectory: info.isDirectory(),
        isFile: info.isFile(),
        size: info.size,
        createdAt: info.birthtimeMs,
        modifiedAt: info.mtimeMs,
      };
    } catch {
      return null;
    }
  });
}

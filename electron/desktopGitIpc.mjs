import path from 'node:path';
import {
  commitGitChanges,
  fetchGitStatus,
  getGitCommitDiff,
  getGitHistory,
  getGitStatus,
  getGitWorkingDiffs,
  pullGitChanges,
  pushGitChanges,
} from './gitService.mjs';

const defaultGitService = {
  commit: commitGitChanges,
  commitDiff: getGitCommitDiff,
  fetch: fetchGitStatus,
  history: getGitHistory,
  pull: pullGitChanges,
  push: pushGitChanges,
  status: getGitStatus,
  workingDiff: getGitWorkingDiffs,
};

export function registerDesktopGitIpc({ handleIpc, service = defaultGitService }) {
  const repositoryTails = new Map();
  const enqueueRepositoryTask = (rootPath, task) => {
    const resolvedPath = path.resolve(String(rootPath));
    const key = process.platform === 'win32' ? resolvedPath.toLowerCase() : resolvedPath;
    const previous = repositoryTails.get(key) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(task);
    repositoryTails.set(key, run);
    void run.finally(() => {
      if (repositoryTails.get(key) === run) repositoryTails.delete(key);
    }).catch(() => undefined);
    return run;
  };

  handleIpc('desktop:git:status', (_event, rootPath) => (
    enqueueRepositoryTask(rootPath, () => service.status(rootPath))
  ));
  handleIpc('desktop:git:fetch', (_event, rootPath) => (
    enqueueRepositoryTask(rootPath, () => service.fetch(rootPath))
  ));
  handleIpc('desktop:git:working-diff', (_event, rootPath, filePaths) => (
    enqueueRepositoryTask(rootPath, () => service.workingDiff(rootPath, filePaths))
  ));
  handleIpc('desktop:git:history', (_event, rootPath, limit) => (
    enqueueRepositoryTask(rootPath, () => service.history(rootPath, limit))
  ));
  handleIpc('desktop:git:commit-diff', (_event, rootPath, hash) => (
    enqueueRepositoryTask(rootPath, () => service.commitDiff(rootPath, hash))
  ));
  handleIpc('desktop:git:commit', (_event, rootPath, options) => (
    enqueueRepositoryTask(rootPath, () => service.commit(rootPath, options))
  ));
  handleIpc('desktop:git:pull', (_event, rootPath) => (
    enqueueRepositoryTask(rootPath, () => service.pull(rootPath))
  ));
  handleIpc('desktop:git:push', (_event, rootPath) => (
    enqueueRepositoryTask(rootPath, () => service.push(rootPath))
  ));
}

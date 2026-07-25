import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import type { MessageKey } from '@/lib/i18n';
import type { GitBridge, GitStatus } from './gitUiTypes';
import {
  getGitDiffPreviewSize,
  MAX_GIT_DIFF_PREVIEW_CHARS,
  MAX_GIT_DIFF_PREVIEW_LINES,
} from './gitDiffBudget';

const DIFF_BATCH_SIZE = 100;

export function useGitWorkingDiff({
  git,
  open,
  reportFailure,
  rootPath,
  status,
}: {
  git: GitBridge;
  open: boolean;
  reportFailure: (error: unknown) => MessageKey;
  rootPath: string;
  status: GitStatus | null;
}) {
  const requestRef = useRef(0);
  const [diffs, setDiffs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const statusAvailable = Boolean(status);
  const changes = status?.changes ?? [];
  const diffRequestKey = JSON.stringify(changes.map((change) => [
    change.previousPath,
    change.path,
    change.indexStatus,
    change.workTreeStatus,
  ]));
  const diffPathsRef = useRef<string[]>([]);
  diffPathsRef.current = Array.from(new Set(changes.flatMap((change) => (
    change.previousPath ? [change.previousPath, change.path] : [change.path]
  ))));

  const clear = useCallback(() => {
    requestRef.current += 1;
    setDiffs([]);
    setLoading(false);
    setError(null);
  }, []);

  useEffect(() => {
    if (!open || !statusAvailable) return;
    const requestId = ++requestRef.current;
    const requestPaths = diffPathsRef.current;
    if (requestPaths.length === 0) {
      clear();
      return;
    }

    setDiffs([]);
    setLoading(true);
    setError(null);
    const loadDiffs = async () => {
      const nextDiffs: string[] = [];
      let totalChars = 0;
      let totalLines = 0;
      for (let index = 0; index < requestPaths.length; index += DIFF_BATCH_SIZE) {
        if (requestRef.current !== requestId) return;
        const batchPaths = requestPaths.slice(index, index + DIFF_BATCH_SIZE);
        const batchDiff = await git.workingDiff(rootPath, batchPaths);
        if (batchDiff) {
          const size = getGitDiffPreviewSize(batchDiff);
          totalChars += size.chars;
          totalLines += size.lines;
          if (totalChars > MAX_GIT_DIFF_PREVIEW_CHARS || totalLines > MAX_GIT_DIFF_PREVIEW_LINES) {
            if (requestRef.current === requestId) {
              setDiffs([]);
              setError(reportFailure(new Error('Git command output exceeded the safety limit.')));
            }
            return;
          }
          nextDiffs.push(batchDiff);
        }
        if (requestRef.current === requestId) {
          startTransition(() => setDiffs([...nextDiffs]));
        }
      }
    };
    void loadDiffs().catch((error) => {
      if (requestRef.current === requestId) {
        setDiffs([]);
        setError(reportFailure(error));
      }
    }).finally(() => {
      if (requestRef.current === requestId) setLoading(false);
    });
    return () => {
      if (requestRef.current === requestId) requestRef.current += 1;
    };
  }, [clear, diffRequestKey, git, open, reportFailure, rootPath, statusAvailable]);

  return { clear, diffs, error, loading };
}

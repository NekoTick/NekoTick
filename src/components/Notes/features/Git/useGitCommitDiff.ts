import { startTransition, useCallback, useRef, useState } from 'react';
import type { GitBridge, GitHistoryItem } from './gitUiTypes';

interface PendingCommitDiff {
  commit: GitHistoryItem;
  requestId: number;
  rootPath: string;
}

export function useGitCommitDiff({
  git,
  reportFailure,
  rootPath,
}: {
  git: GitBridge;
  reportFailure: (error: unknown) => void;
  rootPath: string;
}) {
  const requestRef = useRef(0);
  const inFlightRef = useRef(false);
  const pendingRef = useRef<PendingCommitDiff | null>(null);
  const rootPathRef = useRef(rootPath);
  const [diff, setDiff] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedHash, setSelectedHash] = useState<string | null>(null);

  rootPathRef.current = rootPath;

  const clear = useCallback(() => {
    requestRef.current += 1;
    pendingRef.current = null;
    setSelectedHash(null);
    setDiff('');
    setLoading(false);
  }, []);

  const select = useCallback((commit: GitHistoryItem) => {
    const requestId = ++requestRef.current;
    pendingRef.current = { commit, requestId, rootPath };
    setSelectedHash(commit.hash);
    setLoading(true);
    if (inFlightRef.current) return;

    const loadNext = () => {
      const pending = pendingRef.current;
      if (!pending) {
        setLoading(false);
        return;
      }
      pendingRef.current = null;
      inFlightRef.current = true;
      void git.commitDiff(pending.rootPath, pending.commit.hash).then((nextDiff) => {
        if (requestRef.current === pending.requestId && rootPathRef.current === pending.rootPath) {
          startTransition(() => setDiff(nextDiff));
        }
      }).catch((error) => {
        if (requestRef.current === pending.requestId && rootPathRef.current === pending.rootPath) {
          setDiff('');
          reportFailure(error);
        }
      }).finally(() => {
        inFlightRef.current = false;
        if (pendingRef.current) loadNext();
        else if (rootPathRef.current === pending.rootPath) setLoading(false);
      });
    };

    loadNext();
  }, [git, reportFailure, rootPath]);

  return { clear, diff, loading, select, selectedHash };
}

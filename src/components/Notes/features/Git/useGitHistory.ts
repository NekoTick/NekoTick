import { useCallback, useEffect, useRef, useState } from 'react';
import type { MessageKey } from '@/lib/i18n';
import type { GitBridge, GitHistoryItem } from './gitUiTypes';
import { useGitCommitDiff } from './useGitCommitDiff';

export function useGitHistory({
  enabled,
  git,
  reportFailure,
  rootPath,
}: {
  enabled: boolean;
  git: GitBridge;
  reportFailure: (error: unknown) => MessageKey;
  rootPath: string;
}) {
  const requestRef = useRef(0);
  const inFlightRef = useRef(false);
  const rootPathRef = useRef(rootPath);
  const [items, setItems] = useState<GitHistoryItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const commitDiff = useGitCommitDiff({ git, reportFailure, rootPath });

  rootPathRef.current = rootPath;

  const clear = useCallback(() => {
    requestRef.current += 1;
    inFlightRef.current = false;
    setItems(null);
    setLoading(false);
    setError(null);
    commitDiff.clear();
  }, [commitDiff.clear]);

  useEffect(() => clear(), [clear, rootPath]);

  useEffect(() => {
    if (!enabled || items !== null || inFlightRef.current) return;
    const requestId = ++requestRef.current;
    const requestRoot = rootPath;
    inFlightRef.current = true;
    setLoading(true);
    setError(null);
    void git.history(requestRoot, 30).then((history) => {
      if (requestRef.current === requestId && rootPathRef.current === requestRoot) {
        setItems(history);
      }
    }).catch((requestError) => {
      if (requestRef.current === requestId && rootPathRef.current === requestRoot) {
        setItems([]);
        setError(reportFailure(requestError));
      }
    }).finally(() => {
      if (requestRef.current === requestId && rootPathRef.current === requestRoot) {
        inFlightRef.current = false;
        setLoading(false);
      }
    });
  }, [enabled, git, items, reportFailure, rootPath]);

  useEffect(() => {
    if (!enabled || !items?.length || commitDiff.selectedHash) return;
    commitDiff.select(items[0]);
  }, [commitDiff.select, commitDiff.selectedHash, enabled, items]);

  return {
    clear,
    diff: commitDiff.diff,
    diffLoading: commitDiff.loading,
    error,
    items: items ?? [],
    loading,
    select: commitDiff.select,
    selectedHash: commitDiff.selectedHash,
  };
}

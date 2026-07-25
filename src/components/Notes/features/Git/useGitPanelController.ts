import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n, type MessageKey } from '@/lib/i18n';
import { useToastStore } from '@/stores/useToastStore';
import type {
  GitBridge,
  GitPanelTab,
  GitStatus,
} from './gitUiTypes';
import { createLocalDateTimeValue } from './gitUiTypes';
import { getGitErrorMessageKey } from './gitErrorMessages';
import { saveOpenNotesBeforeGit } from './gitNotePreparation';
import { useGitOperationRunner } from './useGitOperationRunner';
import { useGitWorkingDiff } from './useGitWorkingDiff';
import { useGitHistory } from './useGitHistory';

export function useGitPanelController({
  git,
  rootPath,
  open,
}: {
  git: GitBridge;
  rootPath: string;
  open: boolean;
}) {
  const { t } = useI18n();
  const addToast = useToastStore((state) => state.addToast);
  const rootPathRef = useRef(rootPath);
  const statusRef = useRef<GitStatus | null>(null);
  const statusRefreshInFlightRef = useRef(false);
  const openPreparationRef = useRef(0);
  const openRef = useRef(open);
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [panelReady, setPanelReady] = useState(false);
  const [panelError, setPanelError] = useState<MessageKey | null>(null);
  const [preparationAttempt, setPreparationAttempt] = useState(0);
  const [activeTab, setActiveTab] = useState<GitPanelTab>('changes');
  const [commitMessage, setCommitMessage] = useState('');
  const [selectedCommitPaths, setSelectedCommitPaths] = useState<Set<string>>(new Set());

  rootPathRef.current = rootPath;
  openRef.current = open;

  const isActiveSession = useCallback((requestRoot: string, sessionId: number) => (
    openRef.current
    && openPreparationRef.current === sessionId
    && rootPathRef.current === requestRoot
  ), []);

  const reportOperationFailure = useCallback((error: unknown, fallback?: MessageKey) => {
    const key = getGitErrorMessageKey(error, fallback);
    addToast(t(key), 'error');
    return key;
  }, [addToast, t]);
  const workingDiff = useGitWorkingDiff({
    git,
    open: open && panelReady && !panelError,
    reportFailure: reportOperationFailure,
    rootPath,
    status,
  });
  const historyVisible = activeTab === 'history' || status?.changes.length === 0;
  const gitHistory = useGitHistory({
    enabled: open && panelReady && historyVisible,
    git,
    reportFailure: reportOperationFailure,
    rootPath,
  });

  const clearSelections = useCallback(() => {
    workingDiff.clear();
    gitHistory.clear();
  }, [gitHistory.clear, workingDiff.clear]);

  const resetPanelState = useCallback((loading = false) => {
    statusRef.current = null;
    setStatus(null);
    setStatusLoading(loading);
    setPanelReady(false);
    setPanelError(null);
    setSelectedCommitPaths(new Set());
    setActiveTab('changes');
    setCommitMessage('');
    clearSelections();
  }, [clearSelections]);

  const applyMutationStatus = useCallback((requestRoot: string, nextStatus: GitStatus) => {
    if (!openRef.current || rootPathRef.current !== requestRoot) return;
    statusRef.current = nextStatus;
    setStatus(nextStatus);
    setPanelError(null);
    setSelectedCommitPaths(new Set(nextStatus.changes.map((change) => change.path)));
    clearSelections();
  }, [clearSelections]);
  const { operation, runMutation } = useGitOperationRunner({
    applyStatus: applyMutationStatus,
    reportFailure: reportOperationFailure,
    rootPath,
  });

  const applyRefreshedStatus = useCallback((requestRoot: string, nextStatus: GitStatus | null) => {
    if (!openRef.current || rootPathRef.current !== requestRoot) return;
    const previousStatus = statusRef.current;
    setPanelError(null);
    if (JSON.stringify(previousStatus) === JSON.stringify(nextStatus)) return;
    if (previousStatus && previousStatus.head !== nextStatus?.head) {
      gitHistory.clear();
    }
    statusRef.current = nextStatus;
    setStatus(nextStatus);
    setSelectedCommitPaths((current) => {
      const previousPaths = new Set(previousStatus?.changes.map((change) => change.path) ?? []);
      return new Set(nextStatus?.changes.filter((change) => (
        !previousPaths.has(change.path) || current.has(change.path)
      )).map((change) => change.path) ?? []);
    });
  }, [gitHistory.clear]);

  const refreshStatus = useCallback(async (silent = false) => {
    if (statusRefreshInFlightRef.current) return false;
    const requestRoot = rootPath;
    const sessionId = openPreparationRef.current;
    statusRefreshInFlightRef.current = true;
    if (!silent) setStatusLoading(true);
    try {
      const nextStatus = await git.status(requestRoot);
      if (!nextStatus) throw new Error('Git repository is no longer available.');
      if (!isActiveSession(requestRoot, sessionId)) return false;
      applyRefreshedStatus(requestRoot, nextStatus);
      return true;
    } catch (error) {
      if (isActiveSession(requestRoot, sessionId)) {
        const key = getGitErrorMessageKey(error);
        setPanelError(key);
        if (!silent) reportOperationFailure(error);
      }
      return false;
    } finally {
      statusRefreshInFlightRef.current = false;
      if (!silent && isActiveSession(requestRoot, sessionId)) {
        setStatusLoading(false);
      }
    }
  }, [applyRefreshedStatus, git, isActiveSession, reportOperationFailure, rootPath]);

  useEffect(() => {
    resetPanelState();
  }, [resetPanelState, rootPath]);

  useEffect(() => {
    const requestId = ++openPreparationRef.current;
    if (!open) {
      resetPanelState();
      return;
    }

    const requestRoot = rootPath;
    resetPanelState(true);

    void (async () => {
      try {
        if (!await saveOpenNotesBeforeGit()) {
          throw new Error('Open notes could not be saved before Git status was read.');
        }
      } catch {
        if (!isActiveSession(requestRoot, requestId)) return;
        setPanelError('git.saveBeforeOperationFailed');
        addToast(t('git.saveBeforeOperationFailed'), 'error');
        setStatusLoading(false);
        return;
      }

      try {
        const nextStatus = await git.status(requestRoot);
        if (!nextStatus) throw new Error('Git repository is no longer available.');
        if (!isActiveSession(requestRoot, requestId)) return;
        applyRefreshedStatus(requestRoot, nextStatus);
        setPanelReady(true);
      } catch (error) {
        if (!isActiveSession(requestRoot, requestId)) return;
        setPanelError(reportOperationFailure(error));
      } finally {
        if (isActiveSession(requestRoot, requestId)) {
          setStatusLoading(false);
        }
      }
    })();
    return () => {
      if (openPreparationRef.current === requestId) openPreparationRef.current += 1;
    };
  }, [
    addToast,
    applyRefreshedStatus,
    git,
    isActiveSession,
    open,
    preparationAttempt,
    reportOperationFailure,
    resetPanelState,
    rootPath,
    t,
  ]);

  useEffect(() => {
    if (!open || !panelReady) return;
    const refreshOnFocus = () => void refreshStatus(true);
    const refreshOnVisibility = () => {
      if (document.visibilityState === 'visible') void refreshStatus(true);
    };
    window.addEventListener('focus', refreshOnFocus);
    document.addEventListener('visibilitychange', refreshOnVisibility);
    return () => {
      window.removeEventListener('focus', refreshOnFocus);
      document.removeEventListener('visibilitychange', refreshOnVisibility);
    };
  }, [open, panelReady, refreshStatus]);

  const commit = useCallback(() => {
    const message = commitMessage.trim();
    const hasConflicts = status?.changes.some((change) => change.status === 'conflicted');
    if (!panelReady || panelError || status?.detached || hasConflicts) return;
    const selectedChanges = status?.changes.filter((change) => selectedCommitPaths.has(change.path)) ?? [];
    const paths = Array.from(new Set(selectedChanges.flatMap((change) => (
      change.previousPath ? [change.previousPath, change.path] : [change.path]
    ))));
    if (!message || paths.length === 0) return;
    void runMutation('commit', false, (requestRoot) => git.commit(requestRoot, {
      message,
      paths,
    }), 'git.commitSuccess').then((committed) => {
      if (committed) setCommitMessage('');
    });
  }, [commitMessage, git, panelError, panelReady, runMutation, selectedCommitPaths, status]);

  const toggleCommitPath = useCallback((path: string) => {
    setSelectedCommitPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const toggleAllCommitPaths = useCallback(() => {
    const changePaths = status?.changes.map((change) => change.path) ?? [];
    setSelectedCommitPaths((current) => (
      current.size === changePaths.length ? new Set() : new Set(changePaths)
    ));
  }, [status?.changes]);

  const pull = useCallback(() => {
    void runMutation('pull', true, (requestRoot) => git.pull(requestRoot), 'git.pullSuccess');
  }, [git, runMutation]);

  const push = useCallback(() => {
    void runMutation('push', false, (requestRoot) => git.push(requestRoot), 'git.pushSuccess');
  }, [git, runMutation]);

  const retry = useCallback(() => {
    if (panelReady) void refreshStatus();
    else setPreparationAttempt((attempt) => attempt + 1);
  }, [panelReady, refreshStatus]);

  return {
    status, statusLoading, panelReady, panelError, retry, operation, activeTab, setActiveTab,
    refreshStatus, workingDiffs: workingDiff.diffs, workingDiffLoading: workingDiff.loading,
    workingDiffError: workingDiff.error,
    history: gitHistory.items, historyLoading: gitHistory.loading, historyError: gitHistory.error,
    selectedCommitHash: gitHistory.selectedHash, selectedCommitDiff: gitHistory.diff,
    commitDiffLoading: gitHistory.diffLoading, selectCommit: gitHistory.select,
    commitMessage, setCommitMessage,
    useCurrentTimeAsMessage: () => setCommitMessage(createLocalDateTimeValue()),
    selectedCommitPaths, toggleCommitPath, toggleAllCommitPaths,
    commit, pull, push,
  };
}

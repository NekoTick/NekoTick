import { useCallback, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { useToastStore } from '@/stores/useToastStore';
import type { GitOperation, GitStatus } from './gitUiTypes';
import { saveOpenNotesBeforeGit } from './gitNotePreparation';

type GitOperationSuccessKey = 'git.commitSuccess' | 'git.pullSuccess' | 'git.pushSuccess';

export function useGitOperationRunner({
  applyStatus,
  reportFailure,
  rootPath,
}: {
  applyStatus: (requestRoot: string, status: GitStatus) => void;
  reportFailure: (error: unknown) => void;
  rootPath: string;
}) {
  const { t } = useI18n();
  const addToast = useToastStore((state) => state.addToast);
  const rootPathRef = useRef(rootPath);
  const operationRef = useRef<GitOperation | null>(null);
  const [operation, setOperation] = useState<GitOperation | null>(null);

  rootPathRef.current = rootPath;

  const prepareSavedNotes = useCallback(async () => {
    try {
      if (await saveOpenNotesBeforeGit()) return true;
    } catch {
      // Thrown and reported save failures share the same user-facing message.
    }
    addToast(t('git.saveBeforeOperationFailed'), 'error');
    return false;
  }, [addToast, t]);

  const runMutation = useCallback(async (
    nextOperation: GitOperation,
    saveBefore: boolean,
    task: (requestRoot: string) => Promise<GitStatus>,
    successKey: GitOperationSuccessKey,
  ) => {
    if (operationRef.current) return false;
    const requestRoot = rootPath;
    operationRef.current = nextOperation;
    setOperation(nextOperation);
    try {
      if (saveBefore && !await prepareSavedNotes()) return false;
      const nextStatus = await task(requestRoot);
      applyStatus(requestRoot, nextStatus);
      if (rootPathRef.current === requestRoot) addToast(t(successKey), 'success');
      return true;
    } catch (error) {
      if (rootPathRef.current === requestRoot) reportFailure(error);
      return false;
    } finally {
      operationRef.current = null;
      if (rootPathRef.current === requestRoot) setOperation(null);
    }
  }, [addToast, applyStatus, prepareSavedNotes, reportFailure, rootPath, t]);

  return { operation, runMutation };
}

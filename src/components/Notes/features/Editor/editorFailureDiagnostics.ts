import { getElectronBridge } from '@/lib/electron/bridge';
import { getErrorDiagnosticDetails } from '@/lib/diagnostics/errorDetails';
import { logDiagnostic } from '@/lib/diagnostics/diagnosticsLog';

export type NotesEditorFailureReason =
  | 'render-error'
  | 'content-sync'
  | 'creation-error'
  | 'activation-error'
  | 'init-timeout';

export interface NotesEditorFailure {
  reason: NotesEditorFailureReason;
  error?: unknown;
  componentStack?: string;
  contentLength?: number;
  diskRevision?: number;
}

const FAILURE_MESSAGES: Record<NotesEditorFailureReason, string> = {
  'render-error': 'The rendered Markdown editor threw during rendering.',
  'content-sync': 'The rendered Markdown editor could not synchronize note content.',
  'creation-error': 'The Markdown editor failed while creating its Milkdown instance.',
  'activation-error': 'The Markdown editor failed while activating its view.',
  'init-timeout': 'The Markdown editor did not become ready before the fallback timeout.',
};

function normalizeComponentStack(componentStack: string | undefined): string | undefined {
  if (!componentStack) return undefined;
  return componentStack.slice(0, 4000);
}

export function reportNotesEditorFailure(failure: NotesEditorFailure): void {
  const componentStack = normalizeComponentStack(failure.componentStack);
  const errorDetails = failure.error === undefined
    ? {}
    : getErrorDiagnosticDetails(failure.error);
  const details = {
    reason: failure.reason,
    ...(failure.contentLength === undefined ? {} : { contentLength: failure.contentLength }),
    ...(failure.diskRevision === undefined ? {} : { diskRevision: failure.diskRevision }),
    ...errorDetails,
    ...(componentStack ? { hasComponentStack: true } : {}),
  };

  logDiagnostic('notes-editor', `failure-${failure.reason}`, details);

  // React render errors are already persisted by ErrorBoundary with their full stack.
  if (failure.reason === 'render-error') return;

  const error = failure.error instanceof Error ? failure.error : undefined;
  void getElectronBridge()?.app?.reportRendererError?.({
    source: 'notes-editor',
    type: failure.reason,
    name: error?.name ?? 'NotesEditorFailure',
    message: error?.message || FAILURE_MESSAGES[failure.reason],
    stack: error?.stack,
    error: failure.error,
    componentStack,
  }).catch(() => undefined);
}

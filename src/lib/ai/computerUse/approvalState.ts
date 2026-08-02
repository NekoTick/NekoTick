import { useSyncExternalStore } from 'react';
import { getElectronBridge } from '@/lib/electron/bridge';
import { resolveSessionIdAlias } from '@/lib/ai/sessionIdAliases';

export interface ComputerCommandApprovalRequest {
  id: string;
  sessionId: string;
  messageId: string;
  commandId: string;
  command: string;
  cwd: string;
  workspaceRoot: string;
  purpose: string;
  timeoutSeconds: number;
}

export type ComputerCommandApprovalDecision = 'run_once' | 'always' | 'cancel';

type ComputerCommandAlwaysRunApproval = Pick<
  ComputerCommandApprovalRequest,
  'sessionId' | 'command' | 'cwd' | 'workspaceRoot'
>;

let pending: ComputerCommandApprovalRequest[] = [];
let alwaysRunApprovals: ComputerCommandAlwaysRunApproval[] = [];
let alwaysRunApprovalGeneration = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function publishComputerCommandApproval(
  requestId: string,
  event: Omit<ComputerCommandApprovalRequest, 'id'>,
) {
  const request = { id: requestId, ...event };
  pending = [...pending.filter((item) => item.id !== requestId), request];
  emit();
}

export function clearComputerCommandApproval(requestId: string) {
  const next = pending.filter((item) => item.id !== requestId);
  if (next.length === pending.length) return;
  pending = next;
  emit();
}

export function usePendingComputerCommandApprovals(): readonly ComputerCommandApprovalRequest[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => pending,
    () => pending,
  );
}

export function getPendingComputerCommandApprovalsSnapshot(): readonly ComputerCommandApprovalRequest[] {
  return pending;
}

export function isComputerCommandAlwaysRunApproved(
  request: ComputerCommandAlwaysRunApproval,
): boolean {
  if (!request.sessionId) return false;
  const sessionId = resolveSessionIdAlias(request.sessionId);
  return alwaysRunApprovals.some((approval) => (
    resolveSessionIdAlias(approval.sessionId) === sessionId
    && approval.command === request.command
    && approval.cwd === request.cwd
    && approval.workspaceRoot === request.workspaceRoot
  ));
}

export function clearComputerCommandAlwaysRunApprovals() {
  alwaysRunApprovals = [];
  alwaysRunApprovalGeneration += 1;
}

export function isComputerCommandApprovalForSession(
  approval: ComputerCommandApprovalRequest,
  sessionId: string | null | undefined,
): boolean {
  if (!approval.sessionId || !sessionId) return false;
  return resolveSessionIdAlias(approval.sessionId) === resolveSessionIdAlias(sessionId);
}

export async function respondToComputerCommandApproval(
  requestId: string,
  decision: ComputerCommandApprovalDecision,
): Promise<boolean> {
  const approval = pending.find((item) => item.id === requestId);
  if (decision === 'always' && !approval?.sessionId) return false;
  const approvalGeneration = alwaysRunApprovalGeneration;
  const bridgeDecision = decision === 'always' ? 'run_once' : decision;
  const accepted = await getElectronBridge()?.computer?.respondToApproval(requestId, bridgeDecision) ?? false;
  if (accepted) {
    if (
      decision === 'always'
      && approval
      && approvalGeneration === alwaysRunApprovalGeneration
      && !isComputerCommandAlwaysRunApproved(approval)
    ) {
      alwaysRunApprovals = [...alwaysRunApprovals, {
        sessionId: approval.sessionId,
        command: approval.command,
        cwd: approval.cwd,
        workspaceRoot: approval.workspaceRoot,
      }];
    }
    clearComputerCommandApproval(requestId);
  }
  return accepted;
}

export function resetComputerCommandApprovalsForTests() {
  pending = [];
  alwaysRunApprovals = [];
  alwaysRunApprovalGeneration += 1;
  emit();
}

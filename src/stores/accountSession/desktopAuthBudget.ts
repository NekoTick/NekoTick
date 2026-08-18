import type { ManagedBudgetPayload } from '@/lib/ai/managed/types';
import { normalizeManagedBudgetPayload } from '@/lib/ai/managed/normalizers';
import { useManagedAIStore } from '@/stores/useManagedAIStore';

export function applyDesktopAuthBudget(payload: unknown): void {
  const managedAI = useManagedAIStore.getState();
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    managedAI.clearBudget();
    return;
  }

  const budget = normalizeManagedBudgetPayload(payload as ManagedBudgetPayload);
  if (!Number.isFinite(budget.remainingPercent)) {
    managedAI.clearBudget();
    return;
  }

  managedAI.applyBudgetSnapshot(budget);
}

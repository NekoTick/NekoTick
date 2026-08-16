import { isManagedProviderId } from '@/lib/ai/managedService';
import { useAccountSessionStore } from '@/stores/accountSession';
import { useManagedAIStore } from '@/stores/useManagedAIStore';

export function refreshManagedBudgetIfNeeded(providerId: string): void {
  if (!isManagedProviderId(providerId)) {
    return;
  }
  if (!useAccountSessionStore.getState().isConnected) {
    return;
  }
  void useManagedAIStore.getState().refreshBudgetIfStale().catch(() => undefined);
}

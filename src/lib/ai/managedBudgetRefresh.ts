import { useAccountSessionStore } from '@/stores/accountSession';
import { useManagedAIStore } from '@/stores/useManagedAIStore';
import { isManagedProviderId } from './managedService';

export function refreshManagedBudgetIfNeeded(providerId: string): void {
  if (!isManagedProviderId(providerId)) {
    return;
  }
  if (!useAccountSessionStore.getState().isConnected) {
    return;
  }
  void useManagedAIStore.getState().refreshBudget().catch(() => undefined);
}

import { isManagedProviderId } from '@/lib/ai/managedService';
import { isStandaloneImageGenerationModel } from '@/lib/ai/modelCapabilities';
import type { UnifiedData } from '@/lib/storage/unifiedStorage';

export function getWebSearchAvailability(ai: UnifiedData['ai']): boolean | undefined {
  if (!ai) return undefined;
  const model = ai.models.find((item) => item.id === ai.selectedModelId);
  if (!model) return undefined;
  if (isStandaloneImageGenerationModel(model)) return false;

  const provider = ai.providers.find((item) => item.id === model.providerId);
  if (!provider) return undefined;
  return isManagedProviderId(provider.id);
}

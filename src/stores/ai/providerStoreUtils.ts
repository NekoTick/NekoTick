import type { AIModel, Provider } from '@/lib/ai/types';
import { MANAGED_PROVIDER_ID, createManagedProvider } from '@/lib/ai/managedService';

export function sortProviders(providers: Provider[]): Provider[] {
  return [
    ...providers.filter((provider) => provider.id === MANAGED_PROVIDER_ID),
    ...providers.filter((provider) => provider.id !== MANAGED_PROVIDER_ID),
  ]
}

export function ensureManagedProvider(providers: Provider[]): Provider[] {
  const now = Date.now()
  const managed = providers.find((provider) => provider.id === MANAGED_PROVIDER_ID)
  const nextManaged = managed ?? createManagedProvider(now)
  const nextProviders = providers.filter((provider) => provider.id !== MANAGED_PROVIDER_ID)
  nextProviders.unshift(nextManaged)
  return sortProviders(nextProviders)
}

export function chooseFallbackSelectedModelId(
  currentSelectedModelId: string | null,
  models: AIModel[],
  preferredProviderId?: string | null
): string | null {
  const enabledModels = models.filter((model) => model.enabled !== false)

  if (currentSelectedModelId && enabledModels.some((model) => model.id === currentSelectedModelId)) {
    return currentSelectedModelId
  }

  if (preferredProviderId) {
    const preferredDefaultModel = enabledModels.find((model) => model.providerId === preferredProviderId && model.isDefault === true)
    if (preferredDefaultModel) return preferredDefaultModel.id

    const preferredModel = enabledModels.find((model) => model.providerId === preferredProviderId)
    if (preferredModel) return preferredModel.id
  }

  return enabledModels[0]?.id || null
}

export function replaceProviderModels(allModels: AIModel[], providerId: string, nextModels: AIModel[]): AIModel[] {
  const otherModels = allModels.filter((model) => model.providerId !== providerId)
  const existingModels = new Map(
    allModels
      .filter((model) => model.providerId === providerId)
      .map((model) => [model.id, model] as const)
  )

  return [
    ...otherModels,
    ...nextModels.map((model) => {
      const existing = existingModels.get(model.id)
      if (!existing) return model

      if (
        existing.apiModelId === model.apiModelId &&
        existing.name === model.name &&
        existing.providerId === model.providerId &&
        existing.group === model.group &&
        existing.priceTier === model.priceTier &&
        existing.priceScore === model.priceScore &&
        existing.isDefault === model.isDefault
      ) {
        return existing
      }

      return {
        ...model,
        createdAt: existing.createdAt,
        endpointType: existing.endpointType,
        endpointTypeCheckedAt: existing.endpointTypeCheckedAt,
        enabled: existing.enabled,
        pinned: existing.pinned,
      }
    }),
  ]
}

export function areProvidersEqual(left: Provider[], right: Provider[]): boolean {
  if (left.length !== right.length) return false

  return left.every((provider, index) => {
    const other = right[index]
    return !!other && (
      provider.id === other.id &&
      provider.name === other.name &&
      provider.icon === other.icon &&
      provider.type === other.type &&
      provider.endpointType === other.endpointType &&
      provider.endpointTypeCheckedAt === other.endpointTypeCheckedAt &&
      provider.apiHost === other.apiHost &&
      provider.apiKey === other.apiKey &&
      provider.enabled === other.enabled &&
      provider.createdAt === other.createdAt &&
      provider.updatedAt === other.updatedAt
    )
  })
}

export function areModelsEqual(left: AIModel[], right: AIModel[]): boolean {
  if (left.length !== right.length) return false

  return left.every((model, index) => {
    const other = right[index]
    return !!other && (
      model.id === other.id &&
      model.apiModelId === other.apiModelId &&
      model.name === other.name &&
      model.providerId === other.providerId &&
      model.endpointType === other.endpointType &&
      model.endpointTypeCheckedAt === other.endpointTypeCheckedAt &&
      model.group === other.group &&
      model.priceTier === other.priceTier &&
      model.priceScore === other.priceScore &&
      model.isDefault === other.isDefault &&
      model.enabled === other.enabled &&
      model.pinned === other.pinned &&
      model.createdAt === other.createdAt
    )
  })
}

export function areModelExecutionContextsEqual(
  left: AIModel | undefined,
  right: AIModel | undefined,
): boolean {
  if (!left || !right) return left === right

  return left.id === right.id &&
    left.apiModelId === right.apiModelId &&
    left.name === right.name &&
    left.providerId === right.providerId &&
    left.endpointType === right.endpointType &&
    left.group === right.group &&
    left.enabled === right.enabled
}

export function filterModelsByEnabledProviders(models: AIModel[], providers: Provider[]): AIModel[] {
  const enabledProviderIds = new Set(
    providers.filter((provider) => provider.enabled !== false).map((provider) => provider.id)
  )
  return models.filter((model) => enabledProviderIds.has(model.providerId))
}

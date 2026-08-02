import { useState, useEffect, useMemo } from 'react';
import { useAIStore } from '@/stores/useAIStore';
import { ProviderDetail } from './ai/ProviderDetail';
import { AIBehaviorSettings } from './ai/AIBehaviorSettings';
import { MANAGED_PROVIDER_ID } from '@/lib/ai/managedService';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { useI18n } from '@/lib/i18n';
import { useAIChannelOrder } from './ai/AIChannelOrder';
import { AIChannelsSection } from './ai/AIChannelsSection';
import type { PendingDeleteProvider, ProviderCardDraft } from './ai/AIChannelTypes';

export function AITab() {
  const { t } = useI18n();
  const { providers, models, addProvider, updateProvider, deleteProvider, reorderCustomProviders } = useAIStore();
  const customProviders = useMemo(
    () => providers.filter((provider) => provider.id !== MANAGED_PROVIDER_ID),
    [providers]
  );
  const providerModelCounts = useMemo(() => {
    const counts = new Map<string, number>();
    models.forEach((model) => {
      counts.set(model.providerId, (counts.get(model.providerId) || 0) + 1);
    });
    return counts;
  }, [models]);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [providerDrafts, setProviderDrafts] = useState<Record<string, ProviderCardDraft>>({});
  const [pendingDelete, setPendingDelete] = useState<PendingDeleteProvider | null>(null);
  const [pendingBaseUrlFocusProviderId, setPendingBaseUrlFocusProviderId] = useState<string | null>(null);
  const {
    dragOverProviderId,
    draggingProviderId,
    handleChannelDragEnd,
    handleChannelDragEnter,
    handleChannelDragOver,
    handleChannelDragStart,
    handleChannelDrop,
    isChannelClickSuppressed,
    orderedCustomProviders,
  } = useAIChannelOrder(customProviders, reorderCustomProviders);

  useEffect(() => {
    if (customProviders.length === 0) {
      setSelectedProviderId(null);
      return;
    }

    const preferredId = customProviders[0].id;

    if (!selectedProviderId) {
      setSelectedProviderId(preferredId);
    } else {
      const exists = customProviders.some((provider) => provider.id === selectedProviderId);
      if (!exists) {
        setSelectedProviderId(preferredId);
      }
    }
  }, [customProviders, selectedProviderId]);

  useEffect(() => {
    const providerIds = new Set(customProviders.map((provider) => provider.id));
    setProviderDrafts((prev) => {
      const next = Object.fromEntries(
        Object.entries(prev).filter(([providerId]) => providerIds.has(providerId))
      );
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });
  }, [customProviders]);

  const currentProvider = selectedProviderId
    ? customProviders.find((provider) => provider.id === selectedProviderId)
    : undefined;

  const handleSelectProvider = (id: string) => {
    if (id === selectedProviderId) {
      return;
    }

    setSelectedProviderId(id);
  };

  const handleChannelClick = (id: string) => {
    if (isChannelClickSuppressed()) {
      return;
    }

    handleSelectProvider(id);
  };

  const handleAddCustomProvider = () => {
    const customIndex = customProviders.length + 1;
    const nextId = addProvider({
      name: `Channel ${customIndex}`,
      type: 'newapi',
      apiHost: '',
      apiKey: '',
      enabled: true,
    });
    setSelectedProviderId(nextId);
    setPendingBaseUrlFocusProviderId(nextId);
  };

  const handleToggleProviderEnabled = (id: string, enabled: boolean) => {
    updateProvider(id, { enabled, updatedAt: Date.now() });
  };

  const deleteCustomProviderById = (providerId: string) => {
    if (selectedProviderId === providerId) {
      const currentIndex = customProviders.findIndex((provider) => provider.id === providerId);
      const remainingProviders = customProviders.filter((provider) => provider.id !== providerId);
      const fallbackProvider =
        remainingProviders[currentIndex] ?? remainingProviders[currentIndex - 1] ?? null;

      if (fallbackProvider) {
        setSelectedProviderId(fallbackProvider.id);
      } else {
        setSelectedProviderId(null);
      }
    }

    setProviderDrafts((prev) => {
      const next = { ...prev };
      delete next[providerId];
      return next;
    });
    deleteProvider(providerId);
  };

  const handleDeleteCustomProvider = (id: string, name: string) => {
    const provider = customProviders.find((item) => item.id === id);
    if (!provider) {
      return;
    }

    const draft = providerDrafts[id];
    const apiHost = draft?.apiHost ?? provider.apiHost;
    const apiKey = draft?.apiKey ?? provider.apiKey;
    if (!apiHost.trim() && !apiKey.trim()) {
      deleteCustomProviderById(id);
      return;
    }

    setPendingDelete({ id, name });
  };

  const confirmDeleteCustomProvider = () => {
    if (!pendingDelete) {
      return;
    }

    deleteCustomProviderById(pendingDelete.id);
    setPendingDelete(null);
  };

  const handleProviderDraftChange = (providerId: string, draft: ProviderCardDraft) => {
    setProviderDrafts((prev) => ({
      ...prev,
      [providerId]: {
        ...prev[providerId],
        ...draft,
      },
    }));
  };

  const handleProviderDraftClear = (providerId: string) => {
    setProviderDrafts((prev) => {
      if (!prev[providerId]) {
        return prev;
      }
      const next = { ...prev };
      delete next[providerId];
      return next;
    });
  };

  const hasCustomProviders = customProviders.length > 0;

  return (
    <div
      className="h-full min-h-0 bg-[var(--vlaina-color-setting-panel)] text-[var(--vlaina-sidebar-notes-text)]"
      data-settings-tab-panel="ai"
    >
      <ConfirmDialog
        isOpen={!!pendingDelete}
        title={t('settings.ai.deleteChannelTitle', { name: pendingDelete?.name || t('settings.ai.thisChannel') })}
        description={t('settings.ai.deleteChannelDescription')}
        confirmText={t('settings.ai.deleteChannel')}
        cancelText={t('common.cancel')}
        variant="danger"
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDeleteCustomProvider}
      />

      <div
        className="h-full min-h-0 overflow-y-auto px-6 py-6 max-[900px]:px-4 max-[900px]:py-5"
        data-settings-scroll-root="ai"
      >
        <AIBehaviorSettings />

        <section className="mx-auto max-w-5xl">
          <AIChannelsSection
            dragOverProviderId={dragOverProviderId}
            draggingProviderId={draggingProviderId}
            hasCustomProviders={hasCustomProviders}
            orderedCustomProviders={orderedCustomProviders}
            providerDrafts={providerDrafts}
            providerModelCounts={providerModelCounts}
            selectedProviderId={selectedProviderId}
            onAddCustomProvider={handleAddCustomProvider}
            onChannelClick={handleChannelClick}
            onChannelDragEnd={handleChannelDragEnd}
            onChannelDragEnter={handleChannelDragEnter}
            onChannelDragOver={handleChannelDragOver}
            onChannelDragStart={handleChannelDragStart}
            onChannelDrop={handleChannelDrop}
            onDeleteCustomProvider={handleDeleteCustomProvider}
            onToggleProviderEnabled={handleToggleProviderEnabled}
          />

          {currentProvider ? (
            <ProviderDetail
              key={currentProvider.id}
              provider={currentProvider}
              focusBaseUrlOnMount={pendingBaseUrlFocusProviderId === currentProvider.id}
              onBaseUrlAutoFocusComplete={() => setPendingBaseUrlFocusProviderId(null)}
              onDraftChange={(draft) => handleProviderDraftChange(currentProvider.id, draft)}
              onDraftClear={() => handleProviderDraftClear(currentProvider.id)}
            />
          ) : null}
        </section>
      </div>
    </div>
  );
}

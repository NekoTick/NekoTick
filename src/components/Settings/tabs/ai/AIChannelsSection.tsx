import { type DragEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useI18n } from '@/lib/i18n';
import { themeMotionTokens } from '@/styles/themeTokens';
import { ChannelObject, CreateChannelObject } from './AIChannelObjects';
import type { ProviderCardDraft } from './AIChannelTypes';

interface AIChannelProvider {
  id: string;
  name: string;
  apiHost?: string;
  enabled?: boolean;
}

export function AIChannelsSection({
  dragOverProviderId,
  draggingProviderId,
  hasCustomProviders,
  orderedCustomProviders,
  providerDrafts,
  providerModelCounts,
  selectedProviderId,
  onAddCustomProvider,
  onChannelClick,
  onChannelDragEnd,
  onChannelDragEnter,
  onChannelDragOver,
  onChannelDragStart,
  onChannelDrop,
  onDeleteCustomProvider,
  onToggleProviderEnabled,
}: {
  dragOverProviderId: string | null;
  draggingProviderId: string | null;
  hasCustomProviders: boolean;
  orderedCustomProviders: AIChannelProvider[];
  providerDrafts: Record<string, ProviderCardDraft>;
  providerModelCounts: Map<string, number>;
  selectedProviderId: string | null;
  onAddCustomProvider: () => void;
  onChannelClick: (providerId: string) => void;
  onChannelDragEnd: () => void;
  onChannelDragEnter: (providerId: string, event: DragEvent<HTMLDivElement>) => void;
  onChannelDragOver: (providerId: string, event: DragEvent<HTMLDivElement>) => void;
  onChannelDragStart: (providerId: string, event: DragEvent<HTMLDivElement>) => void;
  onChannelDrop: (providerId: string, event: DragEvent<HTMLDivElement>) => void;
  onDeleteCustomProvider: (providerId: string, name: string) => void;
  onToggleProviderEnabled: (providerId: string, enabled: boolean) => void;
}) {
  const { t } = useI18n();

  return (
    <>
      <div className="mb-4 px-2">
        <h3 className="text-[var(--vlaina-font-13)] font-medium text-[var(--vlaina-sidebar-notes-text-soft)]">
          {t('settings.ai.customChannels')}
        </h3>
      </div>

      <AnimatePresence initial={false} mode="popLayout">
        {hasCustomProviders ? (
          <motion.div
            key="channels-populated"
            initial={{
              opacity: themeMotionTokens.opacityHidden,
              y: themeMotionTokens.aiChannelPopulatedInitialY,
            }}
            animate={{
              opacity: themeMotionTokens.opacityVisible,
              y: themeMotionTokens.toastVisibleY,
            }}
            exit={{
              opacity: themeMotionTokens.opacityHidden,
              y: themeMotionTokens.aiChannelPopulatedExitY,
            }}
            transition={{
              duration: themeMotionTokens.aiChannelPopulatedDuration,
              ease: themeMotionTokens.standardEase,
            }}
            className="mb-5"
          >
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,var(--vlaina-size-180px)),1fr))] gap-3">
              {orderedCustomProviders.map((provider) => (
                <motion.div
                  key={provider.id}
                  layout
                  transition={{
                    duration: themeMotionTokens.aiChannelPopulatedDuration,
                    ease: themeMotionTokens.standardEase,
                  }}
                >
                  {(() => {
                    const draft = providerDrafts[provider.id];
                    return (
                      <ChannelObject
                        providerId={provider.id}
                        name={draft?.name ?? provider.name}
                        baseUrl={draft?.apiHost ?? provider.apiHost ?? ''}
                        enabled={provider.enabled ?? true}
                        modelCount={providerModelCounts.get(provider.id) || 0}
                        active={provider.id === selectedProviderId}
                        dragging={provider.id === draggingProviderId}
                        dragOver={provider.id === dragOverProviderId}
                        onClick={() => onChannelClick(provider.id)}
                        onMiddleClick={() =>
                          onDeleteCustomProvider(provider.id, draft?.name ?? provider.name)
                        }
                        onToggleEnabled={(nextEnabled) =>
                          onToggleProviderEnabled(provider.id, nextEnabled)
                        }
                        onDelete={() =>
                          onDeleteCustomProvider(provider.id, draft?.name ?? provider.name)
                        }
                        onDragStart={(event) => onChannelDragStart(provider.id, event)}
                        onDragEnter={(event) => onChannelDragEnter(provider.id, event)}
                        onDragOver={(event) => onChannelDragOver(provider.id, event)}
                        onDrop={(event) => onChannelDrop(provider.id, event)}
                        onDragEnd={onChannelDragEnd}
                      />
                    );
                  })()}
                </motion.div>
              ))}
              <CreateChannelObject onClick={onAddCustomProvider} />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

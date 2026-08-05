import { type DragEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';
import { Icon } from '@/components/ui/icons';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
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
        ) : (
          <motion.div
            key="channels-empty"
            initial={{
              opacity: themeMotionTokens.opacityHidden,
              y: themeMotionTokens.aiChannelEmptyInitialY,
            }}
            animate={{
              opacity: themeMotionTokens.opacityVisible,
              y: themeMotionTokens.toastVisibleY,
            }}
            exit={{
              opacity: themeMotionTokens.opacityHidden,
              y: themeMotionTokens.aiChannelEmptyExitY,
            }}
            transition={{
              duration: themeMotionTokens.aiChannelEmptyDuration,
              ease: themeMotionTokens.standardEase,
            }}
            className="mb-8 px-1"
          >
            <motion.button
              type="button"
              onClick={onAddCustomProvider}
              aria-label={t('settings.ai.newChannel')}
              data-settings-ai-action="new-channel"
              transition={{
                duration: themeMotionTokens.aiChannelEmptyDuration,
                ease: themeMotionTokens.standardEase,
              }}
              className={cn(
                "w-full rounded-[var(--vlaina-ui-radius-group)] border border-transparent px-6 py-8 text-left transition-all duration-[var(--vlaina-duration-200)] shadow-[var(--vlaina-shadow-sm)] hover:shadow-[var(--vlaina-shadow-md)] active:scale-[var(--vlaina-scale-98)]",
                raisedPillSurfaceClass
              )}
            >
              <div className="mx-auto flex max-w-[var(--vlaina-size-420px)] items-center gap-4">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[var(--vlaina-radius-16px)] bg-[var(--vlaina-color-accent-soft-bg)] text-[var(--vlaina-color-accent)]">
                  <Icon name="common.add" size="lg" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <strong className="text-[var(--vlaina-font-sm)] text-[var(--vlaina-sidebar-notes-text)]">
                    {t('settings.ai.newChannel')}
                  </strong>
                  <span className="text-[var(--vlaina-font-xs)] leading-normal text-[var(--vlaina-sidebar-notes-text-soft)]">
                    {t('settings.ai.openaiCompatibleProviderDescription')}
                  </span>
                </span>
                <Icon name="nav.chevronRight" size="md" className="shrink-0 text-[var(--vlaina-sidebar-notes-text-soft)]" />
              </div>
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

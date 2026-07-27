import { useCallback, useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BlurBackdrop } from '@/components/common/BlurBackdrop';
import { useModalBehavior } from './hooks/useModalBehavior';
import { AboutTab } from './tabs/AboutTab';
import { MarkdownTab } from './tabs/MarkdownTab';
import { AppearanceTab } from './tabs/AppearanceTab';
import { AITab } from './tabs/AITab';
import { LanguageTab } from './tabs/LanguageTab';
import { cn } from '@/lib/utils';
import { useWindowDragGesture } from '@/hooks/useWindowDragGesture';
import { actions as aiActions } from '@/stores/ai/providerActions';
import { DialogCloseIconButton } from '@/components/common/DialogCloseIconButton';
import { SettingsSidebar } from './SettingsSidebar';
import {
  OPEN_SETTINGS_EVENT,
  REQUEST_CLOSE_SETTINGS_EVENT,
  SETTINGS_BEFORE_CLOSE_EVENT,
  SETTINGS_CLOSED_EVENT,
  resolveSettingsOpenTab,
  type OpenSettingsDetail,
  type SettingsOpenTab,
  type SettingsTab,
} from './settingsEvents';
import { useI18n } from '@/lib/i18n';
import type { CommunitySettings } from './tabs/aboutCommunitySettings';
import { themeBackdropTokens, themeMotionTokens } from '@/styles/themeTokens';
import { useDesktopUpdateIndicatorVersion } from '@/components/desktop/DesktopUpdateIndicator';
import { useNativeTitleBarOverlayHidden } from '@/hooks/useNativeTitleBarOverlayHidden';
import { flushPendingSave } from '@/lib/storage/unifiedStorage';

interface SettingsModalProps {
  open: boolean;
  communitySettings: CommunitySettings;
  requestedTab?: SettingsOpenTab;
  onClose: () => void;
}

export function SettingsModal({ open, communitySettings, requestedTab, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('markdown');
  const [isAppearanceFontPreviewing, setIsAppearanceFontPreviewing] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const isClosingRef = useRef(false);
  const updateIndicatorVersion = useDesktopUpdateIndicatorVersion();
  const { t } = useI18n();

  const handleClose = useCallback(async () => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    window.dispatchEvent(new Event(SETTINGS_BEFORE_CLOSE_EVENT));
    aiActions.deleteIncompleteCustomProviders();
    try {
      await flushPendingSave();
    } catch {
      // The persistence queue reports save failures to the user.
    } finally {
      onClose();
      window.dispatchEvent(new Event(SETTINGS_CLOSED_EVENT));
      isClosingRef.current = false;
    }
  }, [onClose]);

  useEffect(() => {
    const handleOpenSettings = (e: CustomEvent<OpenSettingsDetail>) => {
      const nextTab = resolveSettingsOpenTab(e.detail?.tab);
      if (nextTab) {
        setActiveTab(nextTab);
      }
    }
    window.addEventListener(OPEN_SETTINGS_EVENT, handleOpenSettings as EventListener)
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, handleOpenSettings as EventListener)
  }, [])

  useEffect(() => {
    window.addEventListener(REQUEST_CLOSE_SETTINGS_EVENT, handleClose);
    return () => window.removeEventListener(REQUEST_CLOSE_SETTINGS_EVENT, handleClose);
  }, [handleClose]);

  useEffect(() => {
    if (!open) return;
    const nextTab = resolveSettingsOpenTab(requestedTab);
    if (nextTab) {
      setActiveTab(nextTab);
    }
  }, [open, requestedTab])

  useModalBehavior({
    open,
    onClose: handleClose,
    modalRef,
  });
  useNativeTitleBarOverlayHidden(open);

  const { beginWindowDragTracking, stopWindowDragTracking } = useWindowDragGesture({
    errorLabel: 'settings modal drag',
  });

  useEffect(() => {
    if (open) return;
    stopWindowDragTracking();
    setIsAppearanceFontPreviewing(false);
  }, [open, stopWindowDragTracking]);

  useEffect(() => {
    if (activeTab === 'appearance') return;
    setIsAppearanceFontPreviewing(false);
  }, [activeTab]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <BlurBackdrop
            onClick={handleClose}
            duration={themeBackdropTokens.settingsModalDurationSeconds}
            blurPx={isAppearanceFontPreviewing ? 0 : themeBackdropTokens.settingsModalBlurPx}
            overlayClassName={isAppearanceFontPreviewing ? 'bg-transparent' : undefined}
          />

          <div className="fixed inset-0 flex items-center justify-center z-[var(--vlaina-z-100)] pointer-events-none p-4 max-[640px]:p-2">
            <div
              className="app-drag-region absolute top-0 left-0 right-0 h-14 z-[var(--vlaina-z-105)] pointer-events-auto cursor-grab active:cursor-grabbing select-none"
              onMouseDown={(e) => {
                if (e.button !== 0) return;
                beginWindowDragTracking(
                  { x: e.clientX, y: e.clientY },
                  { onReleaseWithoutDrag: handleClose }
                );
              }}
            />

            <motion.div
              ref={modalRef}
              initial={{
                opacity: themeMotionTokens.opacityHidden,
                scale: themeMotionTokens.settingsModalInitialScale,
                y: themeMotionTokens.settingsModalY,
              }}
              animate={{
                opacity: themeMotionTokens.opacityVisible,
                scale: themeMotionTokens.settingsModalVisibleScale,
                y: themeMotionTokens.settingsModalVisibleY,
              }}
              exit={{
                opacity: themeMotionTokens.opacityHidden,
                scale: themeMotionTokens.settingsModalInitialScale,
                y: themeMotionTokens.settingsModalY,
              }}
              transition={{
                duration: themeMotionTokens.settingsModalDuration,
                ease: themeMotionTokens.settingsModalEase,
              }}
              className={cn(
                "relative flex h-[var(--vlaina-size-720px)] max-h-[var(--vlaina-height-settings-modal-max)] w-[var(--vlaina-size-1080px)] max-w-full min-w-0 overflow-hidden rounded-[var(--vlaina-ui-radius-panel)] pointer-events-auto select-none transition-[background-color,box-shadow] duration-[var(--vlaina-duration-100)] max-[900px]:flex-col max-[640px]:max-h-[var(--vlaina-height-settings-modal-compact-max)]",
                isAppearanceFontPreviewing
                  ? "bg-transparent shadow-[var(--vlaina-shadow-none)] ring-0"
                  : "bg-[var(--vlaina-color-setting-panel)] shadow-[var(--vlaina-shadow-2xl)] ring-1 ring-[var(--vlaina-color-subtle-border)]",
              )}
              onMouseDownCapture={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                }
              }}
              onAuxClickCapture={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                }
              }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label={t('account.settings')}
              data-settings-modal="true"
              data-settings-active-tab={activeTab}
              tabIndex={-1}
            >
              <DialogCloseIconButton
                onClick={handleClose}
                label={t('common.close')}
                data-settings-action="close"
                className={cn(
                  "absolute right-5 top-5 z-[var(--vlaina-z-10)]",
                  isAppearanceFontPreviewing && "pointer-events-none opacity-[var(--vlaina-opacity-0)]",
                )}
              />

              <SettingsSidebar
                activeTab={activeTab}
                isAppearanceFontPreviewing={isAppearanceFontPreviewing}
                updateIndicatorVersion={updateIndicatorVersion}
                onTabChange={setActiveTab}
              />

              {/* Main Content Section */}
              <div className={cn(
                "relative flex min-h-0 min-w-0 flex-1 flex-col transition-[background-color,backdrop-filter] duration-[var(--vlaina-duration-100)]",
                isAppearanceFontPreviewing
                  ? "bg-transparent backdrop-blur-[var(--vlaina-backdrop-blur-none)]"
                  : "bg-[var(--vlaina-color-setting-content)] backdrop-blur-[var(--vlaina-backdrop-blur-sm)]",
              )}>
                <div
                  className="flex-1 overflow-y-auto w-full app-scrollbar"
                  data-settings-scroll-root="content"
                >
                  <div className={cn(
                    "w-full mx-auto",
                    activeTab === 'ai' 
                      ? "h-full" 
                      : "max-w-[var(--vlaina-size-860px)] px-16 py-14 max-[900px]:px-6 max-[900px]:py-6 max-[640px]:px-4 max-[640px]:py-5"
                  )}>
                    <div className={cn(
                      "animate-in fade-in slide-in-from-bottom-3 duration-[var(--vlaina-duration-75)] ease-out",
                      activeTab === 'ai' ? "h-full min-h-0" : "space-y-10"
                    )}>
                      {activeTab === 'about' && <AboutTab community={communitySettings} />}
                      {activeTab === 'markdown' && <MarkdownTab />}
                      {activeTab === 'appearance' && (
                        <AppearanceTab onFontSizePreviewingChange={setIsAppearanceFontPreviewing} />
                      )}
                      {activeTab === 'language' && <LanguageTab />}
                      {activeTab === 'ai' && <AITab />}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

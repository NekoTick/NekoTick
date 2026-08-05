import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isInsideMenuLayer } from '@/components/layout/sidebar/context-menu/shared';
import type { CustomIcon } from './UploadTab';
import {
  ACTIVE_TAB_KEY,
  RECENT_ICONS_KEY,
  SKIN_TONE_KEY,
  TabType,
  addToRecentIcons,
  loadActiveTab,
  loadRecentIcons,
  loadSkinTone,
  saveActiveTab,
  MAX_RECENT_EMOJIS,
  EMOJI_CATEGORIES,
} from './constants';
import {
  describeIconPickerDebugTarget,
  getIconPickerDebugLogText,
  logIconPickerDebug,
} from './debugLog';
import { hasIconImageScheme, hasIconSymbolScheme, isIconImageValue } from './iconImageValue';
import { themeDomStyleTokens, themeMotionTokens } from '@/styles/themeTokens';

export function useUniversalIconPickerController({
  onSelect,
  onPreview,
  onRemove,
  onClose,
  customIcons,
  customIconsLoading,
  onSkinToneChange,
  onPreviewSkinTone,
  embedded,
  emojiOnly,
  allowLegacyImageScheme,
  showUploadTab,
}: {
  onSelect: (emoji: string) => void;
  onPreview?: (emoji: string | null) => void;
  onRemove?: () => void;
  onClose: () => void;
  customIcons: CustomIcon[];
  customIconsLoading: boolean;
  onSkinToneChange?: (tone: number) => void;
  onPreviewSkinTone?: (tone: number | null) => void;
  embedded: boolean;
  emojiOnly: boolean;
  allowLegacyImageScheme: boolean;
  showUploadTab: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const onPreviewRef = useRef(onPreview);
  const uploadTabEnabled = !emojiOnly && showUploadTab;
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    const restoredTab = uploadTabEnabled ? loadActiveTab() : 'emoji';
    return restoredTab === 'upload' && !customIconsLoading && customIcons.length === 0
      ? 'emoji'
      : restoredTab;
  });
  const restoringPersistedUploadRef = useRef(activeTab === 'upload');
  const effectiveActiveTab = uploadTabEnabled ? activeTab : 'emoji';
  const [recentIcons, setRecentIcons] = useState<string[]>(loadRecentIcons);
  const [skinTone, setSkinTone] = useState(loadSkinTone);
  const [debugCopied, setDebugCopied] = useState(false);
  const [activeEmojiCategory, setActiveEmojiCategory] = useState<string>('people');
  const lastRandomIconRef = useRef<string | null>(null);

  const visibleRecentIcons = useMemo(() =>
    recentIcons
      .filter((icon) => allowLegacyImageScheme || !hasIconImageScheme(icon))
      .filter((icon) => (
        !emojiOnly ||
        (!hasIconSymbolScheme(icon) && !isIconImageValue(icon) && !hasIconImageScheme(icon))
      ))
      .slice(0, MAX_RECENT_EMOJIS),
    [allowLegacyImageScheme, emojiOnly, recentIcons]
  );

  const handleTabChange = useCallback((tab: TabType) => {
    if (tab === 'upload' && !uploadTabEnabled) return;
    restoringPersistedUploadRef.current = false;
    setActiveTab(tab);
  }, [uploadTabEnabled]);

  const recentIconsRef = useRef(recentIcons);
  recentIconsRef.current = recentIcons;
  onCloseRef.current = onClose;
  onPreviewRef.current = onPreview;

  const handleEmojiSelect = useCallback((emoji: string) => {
    lastRandomIconRef.current = null;
    const updated = addToRecentIcons(emoji, recentIconsRef.current);
    setRecentIcons(updated);
    logIconPickerDebug('select-emoji', { emoji });
    onSelect(emoji);
    onCloseRef.current();
  }, [onSelect]);

  const handleSkinToneChangeInternal = useCallback((tone: number) => {
    setSkinTone(tone);
    onSkinToneChange?.(tone);
  }, [onSkinToneChange]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key === ACTIVE_TAB_KEY) {
        if (!uploadTabEnabled) {
          restoringPersistedUploadRef.current = false;
          setActiveTab('emoji');
          return;
        }
        const restoredTab = loadActiveTab();
        restoringPersistedUploadRef.current = restoredTab === 'upload';
        setActiveTab(restoredTab);
        return;
      }

      if (event.key === RECENT_ICONS_KEY) {
        setRecentIcons(loadRecentIcons());
        return;
      }

      if (event.key === SKIN_TONE_KEY) {
        const nextTone = loadSkinTone();
        setSkinTone(nextTone);
        onSkinToneChange?.(nextTone);
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [onSkinToneChange, uploadTabEnabled]);

  useEffect(() => {
    if (!uploadTabEnabled || (activeTab === 'upload' && customIconsLoading)) {
      return;
    }

    const emptyUploadTab = activeTab === 'upload' && customIcons.length === 0;
    if (restoringPersistedUploadRef.current) {
      restoringPersistedUploadRef.current = false;
      if (emptyUploadTab) setActiveTab('emoji');
    }

    saveActiveTab(emptyUploadTab ? 'emoji' : activeTab);
  }, [activeTab, customIcons.length, customIconsLoading, uploadTabEnabled]);

  useEffect(() => {
    if (!uploadTabEnabled && activeTab !== 'emoji') {
      restoringPersistedUploadRef.current = false;
      setActiveTab('emoji');
    }
  }, [activeTab, uploadTabEnabled]);

  const handleUploadSelect = useCallback((assetUrl: string) => {
    lastRandomIconRef.current = null;
    const updated = addToRecentIcons(assetUrl, recentIconsRef.current);
    setRecentIcons(updated);
    saveActiveTab('upload');
    logIconPickerDebug('select-upload', { assetUrl });
    onSelect(assetUrl);
    onCloseRef.current();
  }, [onSelect]);

  const removeTriggeredRef = useRef(false);

  const handleRemove = useCallback(() => {
    if (removeTriggeredRef.current) return;
    removeTriggeredRef.current = true;
    lastRandomIconRef.current = null;
    onPreviewRef.current?.(null);
    onPreviewSkinTone?.(null);
    logIconPickerDebug('remove');
    onRemove?.();
    onCloseRef.current();
  }, [onPreviewSkinTone, onRemove]);

  const handleClose = useCallback((reason = 'close') => {
    logIconPickerDebug('close', {
      reason,
      lastRandomIcon: lastRandomIconRef.current,
    });
    if (lastRandomIconRef.current) {
      const updated = addToRecentIcons(lastRandomIconRef.current, recentIconsRef.current);
      setRecentIcons(updated);
      lastRandomIconRef.current = null;
    }
    onCloseRef.current();
  }, []);

  const handleRemoveEvent = useCallback((event: React.SyntheticEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    handleRemove();
  }, [handleRemove]);

  const handleRandom = useCallback(() => {
    if (effectiveActiveTab === 'emoji') {
      const currentCategory = EMOJI_CATEGORIES.find(c => c.id === activeEmojiCategory);
      const emojis = currentCategory?.emojis || [];
      if (emojis.length > 0) {
        const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
        lastRandomIconRef.current = randomEmoji.native;
        logIconPickerDebug('random-emoji', {
          icon: randomEmoji.native,
          category: activeEmojiCategory,
        });
        onSelect(randomEmoji.native);
      }
    } else if (effectiveActiveTab === 'upload') {
      if (customIcons.length > 0) {
        const randomEmoji = customIcons[Math.floor(Math.random() * customIcons.length)];
        lastRandomIconRef.current = randomEmoji.url;
        logIconPickerDebug('random-upload', { icon: randomEmoji.url });
        onSelect(randomEmoji.url);
      }
    }
  }, [activeEmojiCategory, effectiveActiveTab, onSelect, customIcons]);

  const handleCopyDebugLog = useCallback(async () => {
    const text = getIconPickerDebugLogText();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = themeDomStyleTokens.positionFixed;
        textArea.style.opacity = String(themeMotionTokens.opacityHidden);
        document.body.appendChild(textArea);
        try {
          textArea.focus();
          textArea.select();
          document.execCommand('copy');
        } finally {
          textArea.remove();
        }
      }
      setDebugCopied(true);
      window.setTimeout(() => setDebugCopied(false), 1200);
    } catch (error) {
      logIconPickerDebug('copy-debug-log-failed', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, []);

  useEffect(() => {
    if (embedded) return;

    const onPointerDownCapture = (e: PointerEvent) => {
      const target = e.target;
      const targetElement = target instanceof Element ? target : null;
      const insidePicker = Boolean(containerRef.current && target instanceof Node && containerRef.current.contains(target));
      const preventClose = Boolean(targetElement?.closest('[data-prevent-picker-close]'));
      const insideMenuLayer = isInsideMenuLayer(target);
      logIconPickerDebug('document-pointerdown-capture', {
        target: describeIconPickerDebugTarget(target),
        insidePicker,
        preventClose,
        insideMenuLayer,
      });

      if (preventClose) return;
      if (insideMenuLayer) return;
      if (!insidePicker) {
        onPreviewRef.current?.(null);
        handleClose('outside-pointerdown');
      }
    };
    document.addEventListener('pointerdown', onPointerDownCapture, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDownCapture, true);
    };
  }, [handleClose, embedded]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing) {
        return;
      }

      if (e.key === 'Escape') {
        onPreviewRef.current?.(null);
        handleClose('escape');
      }
      if (e.key === 'Tab' && e.ctrlKey) {
        if (!uploadTabEnabled) return;
        e.preventDefault();
        e.stopPropagation();
        const tabs: TabType[] = ['emoji', 'upload'];
        const currentIndex = tabs.indexOf(activeTab);
        const nextIndex = (currentIndex + 1) % tabs.length;
        handleTabChange(tabs[nextIndex]);
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [activeTab, handleClose, handleTabChange, uploadTabEnabled]);

  return {
    containerRef,
    uploadTabEnabled,
    effectiveActiveTab,
    visibleRecentIcons,
    skinTone,
    debugCopied,
    activeEmojiCategory,
    setActiveEmojiCategory,
    handleTabChange,
    handleEmojiSelect,
    handleSkinToneChangeInternal,
    handleUploadSelect,
    handleRemoveEvent,
    handleRandom,
    handleCopyDebugLog,
  };
}

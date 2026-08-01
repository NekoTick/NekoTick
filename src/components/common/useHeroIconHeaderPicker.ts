import { useCallback, useEffect, useRef, useState } from 'react';
import { useIconPreview } from '@/components/common/UniversalIconPicker/useIconPreview';
import { addToRecentIcons, loadRecentIcons } from '@/components/common/UniversalIconPicker/constants';
import { logIconPickerDebug } from '@/components/common/UniversalIconPicker/debugLog';
import { getRandomHeaderEmoji, preloadRandomEmojiData } from '@/components/common/UniversalIconPicker/randomEmoji';
import { notifyNotesOverlayOpen, onNotesOverlayOpen } from '@/components/Notes/features/overlays/notesOverlayEvents';
import { useUIStore } from '@/stores/uiSlice';
import { themeStyleResetTokens } from '@/styles/themeTokens';

export function useHeroIconHeaderPicker({
  id,
  icon,
  compact,
  readOnly,
  resolvedIconSize,
  sliderValue,
  onIconChange,
  onIconPickerOpen,
  onIconPickerClose,
  onRequestRandomIcon,
  onSizeChange,
  onSizeConfirm,
}: {
  id: string;
  icon: string | null;
  compact: boolean;
  readOnly: boolean;
  resolvedIconSize: number;
  sliderValue?: number;
  onIconChange: (icon: string | null) => void;
  onIconPickerOpen?: () => void | Promise<void>;
  onIconPickerClose?: () => void;
  onRequestRandomIcon?: () => string | null;
  onSizeChange?: (size: number) => void;
  onSizeConfirm?: (size: number) => void;
}) {
  const headerRef = useRef<HTMLDivElement>(null);
  const pickerOpenRef = useRef(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [isHoveringHeader, setIsHoveringHeader] = useState(false);
  const [committedIcon, setCommittedIcon] = useState<string | null>(icon ?? null);
  const lastIconPropRef = useRef<{ id: string; icon: string | null }>({ id, icon: icon ?? null });
  const pendingIconCommitRef = useRef<{
    id: string;
    icon: string | null;
    ignoredIcons: Array<string | null>;
  } | null>(null);
  const pendingRandomRecentIconRef = useRef<{ id: string; icon: string } | null>(null);

  const { handlePreview, handlePreviewTone, clearPreview } = useIconPreview(id);

  const universalPreviewTarget = useUIStore(s => s.universalPreviewTarget);
  const universalPreviewIconSize = useUIStore(s => s.universalPreviewIconSize);
  const isPreviewing = universalPreviewTarget === id;
  const effectiveSize = (!compact && isPreviewing && universalPreviewIconSize !== null)
    ? universalPreviewIconSize
    : resolvedIconSize;

  useEffect(() => {
    if (headerRef.current) {
      headerRef.current.style.setProperty('--vlaina-hero-icon-header-size', `${effectiveSize}px`);
    }
  }, [effectiveSize]);

  useEffect(() => {
    void preloadRandomEmojiData();
  }, []);

  const commitPendingRandomRecentIcon = useCallback((reason: string) => {
    const pendingIcon = pendingRandomRecentIconRef.current;
    if (!pendingIcon || pendingIcon.id !== id) {
      pendingRandomRecentIconRef.current = null;
      return;
    }

    logIconPickerDebug('header-commit-random-recent-icon', {
      id,
      icon: pendingIcon.icon,
      reason,
    });
    addToRecentIcons(pendingIcon.icon, loadRecentIcons());
    pendingRandomRecentIconRef.current = null;
  }, [id]);

  useEffect(() => {
    const nextIcon = icon ?? null;
    const pendingCommit = pendingIconCommitRef.current;

    if (pendingCommit?.id === id) {
      if (nextIcon === pendingCommit.icon) {
        logIconPickerDebug('header-prop-sync-accepted', { id, icon: nextIcon });
        pendingIconCommitRef.current = null;
      } else if (pendingCommit.ignoredIcons.includes(nextIcon)) {
        logIconPickerDebug('header-prop-sync-ignored-stale', {
          id,
          icon: nextIcon,
          pendingIcon: pendingCommit.icon,
          ignoredIcons: pendingCommit.ignoredIcons,
        });
        lastIconPropRef.current = { id, icon: nextIcon };
        return;
      } else {
        logIconPickerDebug('header-prop-sync-overridden', {
          id,
          icon: nextIcon,
          pendingIcon: pendingCommit.icon,
        });
        pendingIconCommitRef.current = null;
      }
    } else if (pendingCommit && pendingCommit.id !== id) {
      pendingIconCommitRef.current = null;
    }

    lastIconPropRef.current = { id, icon: nextIcon };
    logIconPickerDebug('header-prop-sync-applied', { id, icon: nextIcon });
    setCommittedIcon(nextIcon);
  }, [id, icon]);

  useEffect(() => {
    return onNotesOverlayOpen(({ source }) => {
      if (source === 'header-icon-picker') return;
      pickerOpenRef.current = false;
      setShowIconPicker(false);
      setIsHoveringHeader(false);
      clearPreview();
    });
  }, [clearPreview]);

  const commitIconChange = useCallback((newIcon: string | null) => {
    const previousPendingCommit = pendingIconCommitRef.current?.id === id
      ? pendingIconCommitRef.current
      : null;
    const ignoredIcons = Array.from(new Set<string | null>([
      ...(previousPendingCommit ? [previousPendingCommit.icon, ...previousPendingCommit.ignoredIcons] : []),
      lastIconPropRef.current.id === id ? lastIconPropRef.current.icon : icon ?? null,
      committedIcon,
    ])).filter((ignoredIcon) => ignoredIcon !== newIcon);

    pendingIconCommitRef.current = {
      id,
      icon: newIcon,
      ignoredIcons,
    };
    logIconPickerDebug('header-commit-icon', {
      id,
      newIcon,
      propIcon: icon ?? null,
      committedIcon,
      ignoredIcons,
    });
    setCommittedIcon(newIcon);
    onIconChange(newIcon);
  }, [committedIcon, icon, id, onIconChange]);

  const handleIconSelect = useCallback((newIcon: string) => {
    pendingRandomRecentIconRef.current = null;
    commitIconChange(newIcon);
  }, [commitIconChange]);

  const handleOpenIconPicker = useCallback(() => {
    if (readOnly) {
      return;
    }
    logIconPickerDebug('header-open-picker', { id, committedIcon });
    notifyNotesOverlayOpen('header-icon-picker');
    pickerOpenRef.current = true;
    setShowIconPicker(true);
    void Promise.resolve(onIconPickerOpen?.()).catch(() => undefined);
  }, [committedIcon, id, onIconPickerOpen, readOnly]);

  const handleRemoveIcon = useCallback(() => {
    pendingRandomRecentIconRef.current = null;
    logIconPickerDebug('header-remove-icon', { id, committedIcon });
    clearPreview();
    commitIconChange(null);
  }, [clearPreview, commitIconChange, committedIcon, id]);

  const handlePickerClose = useCallback(() => {
    if (!pickerOpenRef.current) return;
    pickerOpenRef.current = false;
    logIconPickerDebug('header-close-picker', { id, committedIcon });
    commitPendingRandomRecentIcon('picker-close');
    setShowIconPicker(false);
    setIsHoveringHeader(false);
    clearPreview();
    onIconPickerClose?.();
  }, [clearPreview, commitPendingRandomRecentIcon, committedIcon, id, onIconPickerClose]);

  const handleLocalSizeChange = useCallback((newSize: number) => {
    if (sliderValue === undefined && headerRef.current) {
      headerRef.current.style.transition = themeStyleResetTokens.transitionNone;
      headerRef.current.style.setProperty('--vlaina-hero-icon-header-size', `${newSize}px`);
    }
    onSizeChange?.(newSize);
  }, [onSizeChange, sliderValue]);

  const handleLocalSizeConfirm = useCallback((newSize: number) => {
    if (sliderValue === undefined && headerRef.current) {
      headerRef.current.style.transition = '';
    }
    onSizeConfirm?.(newSize);
  }, [onSizeConfirm, sliderValue]);

  const handleAddRandomIcon = useCallback(() => {
    const randomIcon = onRequestRandomIcon?.() ?? getRandomHeaderEmoji();
    if (!randomIcon) {
      return;
    }
    logIconPickerDebug('header-add-random-icon', { id, randomIcon });
    commitIconChange(randomIcon);
    pendingRandomRecentIconRef.current = { id, icon: randomIcon };
    handleOpenIconPicker();
  }, [commitIconChange, handleOpenIconPicker, id, onRequestRandomIcon]);

  const currentSliderValue = sliderValue !== undefined ? sliderValue : resolvedIconSize;

  return {
    headerRef,
    showIconPicker,
    isHoveringHeader,
    setIsHoveringHeader,
    committedIcon,
    currentSliderValue,
    handleIconSelect,
    handlePreview,
    handlePreviewTone,
    handleRemoveIcon,
    handlePickerClose,
    handleLocalSizeChange,
    handleLocalSizeConfirm,
    handleOpenIconPicker,
    handleAddRandomIcon,
  };
}

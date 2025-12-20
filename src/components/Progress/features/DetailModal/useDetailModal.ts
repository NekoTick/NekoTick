import { useState, useEffect, useRef, useCallback } from 'react';
import type { ProgressOrCounter, ProgressItem, CounterItem } from '@/stores/useProgressStore';

export type FocusTarget = 'title' | 'current' | 'total' | 'step' | 'unit' | 'resetFrequency';

interface UseDetailModalProps {
  item: ProgressOrCounter | null;
  onClose: () => void;
  onUpdate: (id: string, data: Partial<ProgressOrCounter>) => void;
  onPreviewChange?: (icon?: string, title?: string) => void;
}

interface UseDetailModalReturn {
  // State
  isEditing: boolean;
  focusTarget: FocusTarget;
  draft: Partial<ProgressOrCounter>;
  isPickingIcon: boolean;
  showMenu: boolean;
  displayItem: ProgressOrCounter | null;

  // Setters
  setIsEditing: (value: boolean) => void;
  setFocusTarget: (target: FocusTarget) => void;
  setIsPickingIcon: (value: boolean) => void;
  setShowMenu: (value: boolean) => void;

  // Actions
  handleClose: () => void;
  handleCommit: () => void;
  handleCancelEdit: () => void;
  handleIconChange: (newIcon: string | undefined) => void;
  updateDraft: (key: keyof ProgressItem | keyof CounterItem, value: unknown) => void;
  handleQuickUpdate: (delta: number) => void;
  startEditing: (target: FocusTarget) => void;
}

export function useDetailModal({
  item,
  onClose,
  onUpdate,
  onPreviewChange,
}: UseDetailModalProps): UseDetailModalReturn {
  // Global Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [focusTarget, setFocusTarget] = useState<FocusTarget>('title');
  const [draft, setDraft] = useState<Partial<ProgressOrCounter>>({});
  const [isPickingIcon, setIsPickingIcon] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  // Refs
  const prevItemId = useRef<string | null>(null);

  // Init Draft & State Management
  useEffect(() => {
    if (item) {
      if (item.id !== prevItemId.current) {
        // New Item Opened: Reset everything
        setDraft(item);
        setIsEditing(false);
        prevItemId.current = item.id;
      } else {
        // Same Item Updated:
        // If NOT editing, sync draft to keep it fresh.
        // If IS editing, do NOT touch draft to avoid overwriting user input.
        if (!isEditing) {
          setDraft(item);
        }
      }
    }
  }, [item, isEditing]);

  // Visual Computation
  // Display based on DRAFT if editing, else ITEM
  const displayItem = isEditing
    ? ({ ...item, ...draft } as ProgressOrCounter)
    : item;

  // Prepare preview values
  const previewIcon = displayItem?.icon;
  const previewTitle = displayItem?.title;

  // Real-time preview sync
  useEffect(() => {
    if (onPreviewChange) {
      onPreviewChange(previewIcon, previewTitle);
    }
  }, [previewIcon, previewTitle, onPreviewChange]);

  // Handlers
  const handleClose = useCallback(() => {
    onPreviewChange?.(undefined, undefined);
    onClose();
    setIsEditing(false);
    setIsPickingIcon(false);
    setShowMenu(false);
  }, [onClose, onPreviewChange]);

  const handleCommit = useCallback(() => {
    if (!item) return;
    onUpdate(item.id, draft);
    setIsEditing(false);
  }, [item, draft, onUpdate]);

  const handleCancelEdit = useCallback(() => {
    if (!item) return;
    setDraft(item);
    setIsEditing(false);
  }, [item]);

  const handleIconChange = useCallback(
    (newIcon: string | undefined) => {
      if (item) {
        onUpdate(item.id, { icon: newIcon });
      }
      setIsPickingIcon(false);
    },
    [item, onUpdate]
  );

  const updateDraft = useCallback(
    (key: keyof ProgressItem | keyof CounterItem, value: unknown) => {
      setDraft((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const handleQuickUpdate = useCallback(
    (delta: number) => {
      if (!item) return;

      const step =
        item.type === 'progress'
          ? item.direction === 'increment'
            ? item.step
            : -item.step
          : item.step;

      // Calculate new value based on DRAFT if editing, or item if not
      const baseValue = isEditing ? (draft.current ?? item.current) : item.current;

      let newValue = baseValue + step * delta;
      if (item.type === 'progress') {
        const total = isEditing
          ? ((draft as Partial<ProgressItem>).total ?? item.total)
          : item.total;
        newValue = Math.max(0, Math.min(total, newValue));
      } else {
        newValue = Math.max(0, newValue);
      }

      if (isEditing) {
        updateDraft('current', newValue);
      } else {
        onUpdate(item.id, { current: newValue });
      }
    },
    [item, isEditing, draft, updateDraft, onUpdate]
  );

  const startEditing = useCallback((target: FocusTarget) => {
    setFocusTarget(target);
    setIsEditing(true);
    setShowMenu(false);
  }, []);

  return {
    // State
    isEditing,
    focusTarget,
    draft,
    isPickingIcon,
    showMenu,
    displayItem,

    // Setters
    setIsEditing,
    setFocusTarget,
    setIsPickingIcon,
    setShowMenu,

    // Actions
    handleClose,
    handleCommit,
    handleCancelEdit,
    handleIconChange,
    updateDraft,
    handleQuickUpdate,
    startEditing,
  };
}

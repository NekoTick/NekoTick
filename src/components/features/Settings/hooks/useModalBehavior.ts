import { useEffect } from 'react';

interface UseModalBehaviorOptions {
  open: boolean;
  onClose: () => void;
  isEditing?: boolean;
  onCancelEdit?: () => void;
}

/**
 * Hook for common modal behaviors:
 * - ESC key to close (or cancel editing)
 * - Lock background scroll when open
 */
export function useModalBehavior({
  open,
  onClose,
  isEditing = false,
  onCancelEdit,
}: UseModalBehaviorOptions) {
  // ESC key handler
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isEditing && onCancelEdit) {
          onCancelEdit();
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose, isEditing, onCancelEdit]);

  // Lock background scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);
}

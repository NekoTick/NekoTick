import { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface SubTaskModalProps {
  isOpen: boolean;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

/**
 * Modal for adding subtasks with auto-resize textarea
 */
export function SubTaskModal({
  isOpen,
  value,
  onChange,
  onSubmit,
  onCancel,
}: SubTaskModalProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = inputRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [value]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onCancel}
          className="fixed inset-0 bg-black/20 dark:bg-black/40 flex items-center justify-center z-50"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl w-[500px] max-w-[90vw] p-4"
          >
            <textarea
              ref={inputRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onSubmit();
                } else if (e.key === 'Escape') {
                  onCancel();
                }
              }}
              placeholder="Enter subtask content... (Enter to confirm, Shift+Enter for new line, Esc to cancel)"
              rows={1}
              className="w-full bg-transparent border-none outline-none resize-none text-sm text-foreground placeholder:text-muted-foreground/50 leading-relaxed min-h-[60px] max-h-[400px] overflow-y-auto"
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

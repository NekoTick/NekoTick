import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGroupStore, type Priority } from '@/stores/useGroupStore';

const priorityColors = {
  red: { bg: 'bg-red-500', border: 'border-red-500', text: 'text-red-500', label: '红色 (最高)' },
  yellow: { bg: 'bg-yellow-500', border: 'border-yellow-500', text: 'text-yellow-500', label: '黄色' },
  purple: { bg: 'bg-purple-500', border: 'border-purple-500', text: 'text-purple-500', label: '紫色' },
  green: { bg: 'bg-green-500', border: 'border-green-500', text: 'text-green-500', label: '绿色' },
  default: { bg: 'bg-zinc-400', border: 'border-zinc-400', text: 'text-zinc-400', label: '默认 (最低)' },
};

export function TaskInput() {
  const [content, setContent] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [priority, setPriority] = useState<Priority>('default');
  const [showPriorityMenu, setShowPriorityMenu] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const priorityMenuRef = useRef<HTMLDivElement>(null);
  const { addTask, activeGroupId } = useGroupStore();

  const handleSubmit = () => {
    if (content.trim() && activeGroupId) {
      addTask(content.trim(), activeGroupId, priority);
      setContent('');
      // Keep the selected priority for next task (don't reset to default)
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    const textarea = inputRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [content]);

  // Close priority menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (priorityMenuRef.current && !priorityMenuRef.current.contains(e.target as Node)) {
        setShowPriorityMenu(false);
      }
    };
    if (showPriorityMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPriorityMenu]);

  return (
    <motion.div
      initial={false}
      animate={{
        backgroundColor: isFocused 
          ? 'hsl(var(--muted) / 0.3)' 
          : 'transparent',
      }}
      className={cn(
        'flex items-start gap-2 px-2 py-2 rounded-md',
        'border transition-all duration-200',
        isFocused 
          ? 'border-border/60' 
          : 'border-transparent hover:border-border/30'
      )}
    >
      {/* Priority Selector (Apple Style Circle) */}
      <div className="relative shrink-0 pt-1.5" ref={priorityMenuRef}>
        <div
          onClick={() => setShowPriorityMenu(!showPriorityMenu)}
          className="group flex items-center justify-center w-5 h-5 rounded-full border border-zinc-300 dark:border-zinc-600 hover:border-zinc-400 dark:hover:border-zinc-500 cursor-pointer transition-colors"
          role="button"
          tabIndex={0}
          aria-label="Set priority"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setShowPriorityMenu(!showPriorityMenu);
            }
          }}
        >
          <div
            className={cn(
              "w-3 h-3 rounded-full transition-colors",
              priority && priority !== 'default'
                ? priorityColors[priority].bg
                : "bg-transparent group-hover:bg-zinc-100 dark:group-hover:bg-zinc-800"
            )}
          />
        </div>
        
        {showPriorityMenu && (
          <div className="absolute left-0 top-full mt-2 w-fit bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl py-2 px-2 z-50 flex flex-col gap-1 min-w-[40px]">
            {/* Reverse order: default (lowest) to red (highest) */}
            {(['default', 'green', 'purple', 'yellow', 'red'] as Priority[]).map((p) => (
              <button
                key={p}
                onClick={() => {
                  setPriority(p);
                  setShowPriorityMenu(false);
                }}
                className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex justify-center"
                title={priorityColors[p].label}
              >
                <div
                  className={cn(
                    "w-3 h-3 rounded-full",
                    p && p !== 'default'
                      ? priorityColors[p].bg
                      : "border border-zinc-300 dark:border-zinc-600"
                  )}
                />
              </button>
            ))}
          </div>
        )}
      </div>
      
      <textarea
        ref={inputRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onKeyDown={handleKeyDown}
        placeholder="Type a new task..."
        rows={1}
        className={cn(
          'flex-1 bg-transparent border-none outline-none resize-none py-1',
          'text-sm text-foreground placeholder:text-muted-foreground/50',
          'focus:ring-0 leading-relaxed min-h-[24px] max-h-[200px]'
        )}
      />

      {/* Submit Button / Hint */}
      <AnimatePresence mode="wait">
        {content.trim() ? (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={handleSubmit}
            className="shrink-0 p-1.5 rounded-full bg-primary text-primary-foreground hover:opacity-90 transition-opacity mt-0.5"
            aria-label="Add task"
          >
            <Plus className="h-3.5 w-3.5" />
          </motion.button>
        ) : (
           <div className="w-7" /> // Spacer to prevent layout jump
        )}
      </AnimatePresence>
    </motion.div>
  );
}

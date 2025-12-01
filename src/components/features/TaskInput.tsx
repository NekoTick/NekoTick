import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGroupStore, type Priority } from '@/stores/useGroupStore';
import { Checkbox } from '@/components/ui/checkbox';

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
      {/* Plus Icon */}
      <AnimatePresence mode="wait">
        <motion.button
          onClick={handleSubmit}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          className={cn(
            'p-1 rounded transition-colors',
            content.trim() 
              ? 'text-foreground hover:bg-muted' 
              : 'text-muted-foreground/50'
          )}
          aria-label="Add task"
        >
          <Plus className="h-4 w-4" />
        </motion.button>
      </AnimatePresence>

      {/* Priority Selector */}
      <div className="relative shrink-0" ref={priorityMenuRef}>
        <button
          onClick={() => setShowPriorityMenu(!showPriorityMenu)}
          className="flex items-center gap-1 p-1 rounded hover:bg-muted transition-colors"
          aria-label="Set priority"
        >
          <Checkbox
            checked={false}
            className={cn(
              "h-4 w-4 rounded-sm transition-none pointer-events-none",
              priority && priority !== 'default'
                ? cn("border-2", priorityColors[priority].border)
                : "border border-muted-foreground/40"
            )}
          />
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
        
        {showPriorityMenu && (
          <div className="absolute left-0 top-full mt-1 w-fit bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl py-2 px-2 z-50">
            <div className="flex flex-col gap-1">
              {/* Reverse order: default (lowest) to red (highest) */}
              {(['default', 'green', 'purple', 'yellow', 'red'] as Priority[]).map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    setPriority(p);
                    setShowPriorityMenu(false);
                  }}
                  className="p-1 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  <Checkbox
                    checked={false}
                    className={cn(
                      "h-4 w-4 rounded-sm transition-none pointer-events-none",
                      p && p !== 'default'
                        ? cn("border-2", priorityColors[p].border)
                        : "border border-muted-foreground/40"
                    )}
                  />
                </button>
              ))}
            </div>
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
        placeholder="Type a new task... (Shift+Enter for new line)"
        rows={1}
        className={cn(
          'flex-1 bg-transparent border-none outline-none resize-none',
          'text-sm text-foreground placeholder:text-muted-foreground/50',
          'focus:ring-0 leading-relaxed min-h-[24px] max-h-[200px]'
        )}
      />

      {/* Character hint when typing */}
      <AnimatePresence>
        {content.trim() && (
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="text-xs text-muted-foreground/50 select-none"
          >
            ↵
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

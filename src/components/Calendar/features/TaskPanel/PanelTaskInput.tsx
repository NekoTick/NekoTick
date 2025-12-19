/**
 * PanelTaskInput - 面板内的任务输入框
 * 
 * 简洁版的任务输入，适配右侧面板的紧凑空间
 * 右侧包含更多菜单（颜色过滤、隐藏选项等）
 */

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, MoreHorizontal, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGroupStore, useUIStore, type ItemColor } from '@/stores/useGroupStore';

// 颜色配置
const colorConfig: Record<string, { bg: string; border: string }> = {
  red: { bg: 'bg-red-500', border: 'border-red-500' },
  yellow: { bg: 'bg-yellow-500', border: 'border-yellow-500' },
  purple: { bg: 'bg-purple-500', border: 'border-purple-500' },
  green: { bg: 'bg-green-500', border: 'border-green-500' },
  blue: { bg: 'bg-blue-500', border: 'border-blue-500' },
  default: { bg: 'bg-zinc-400', border: 'border-zinc-400' },
};

// 所有颜色选项
const allColors: ItemColor[] = ['red', 'yellow', 'purple', 'green', 'blue', 'default'];

interface PanelTaskInputProps {
  compact?: boolean;
}

export function PanelTaskInput({ compact = false }: PanelTaskInputProps) {
  const [content, setContent] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [color, setColor] = useState<ItemColor>('default');
  const [showColorMenu, setShowColorMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const colorMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  
  const { addTask, activeGroupId, deleteGroup, archiveCompletedTasks, deleteCompletedTasks } = useGroupStore();
  const { 
    hideCompleted, setHideCompleted, 
    hideActualTime, setHideActualTime,
    selectedColors, toggleColor, toggleAllColors 
  } = useUIStore();

  const handleSubmit = () => {
    if (content.trim() && activeGroupId) {
      addTask(content.trim(), activeGroupId, color);
      setContent('');
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // 自动调整高度
  useEffect(() => {
    const textarea = inputRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, compact ? 80 : 120)}px`;
    }
  }, [content, compact]);

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-color-option]')) return;
      
      if (colorMenuRef.current && !colorMenuRef.current.contains(target)) {
        setShowColorMenu(false);
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(target)) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 归档已完成
  const handleArchiveCompleted = async () => {
    if (!activeGroupId || activeGroupId === '__archive__') return;
    try {
      await archiveCompletedTasks(activeGroupId);
      setShowMoreMenu(false);
    } catch (error) {
      console.error('Failed to archive:', error);
    }
  };

  // 删除已完成
  const handleDeleteCompleted = () => {
    if (!activeGroupId || activeGroupId === '__archive__') return;
    deleteCompletedTasks(activeGroupId);
    setShowMoreMenu(false);
  };

  return (
    <div className="flex items-start gap-1">
      {/* 主输入区域 */}
      <div
        className={cn(
          'flex-1 flex items-start gap-2 px-2 py-1.5 rounded-md transition-all duration-200',
          'border',
          isFocused 
            ? 'border-zinc-200 dark:border-zinc-700 bg-muted/30' 
            : 'border-transparent hover:border-zinc-200 dark:hover:border-zinc-800'
        )}
      >
        {/* 颜色选择器 */}
        <div className="relative shrink-0 pt-1" ref={colorMenuRef}>
          <button
            onClick={() => setShowColorMenu(!showColorMenu)}
            className="flex items-center justify-center w-4 h-4 rounded-full border border-zinc-300 dark:border-zinc-600 hover:border-zinc-400 dark:hover:border-zinc-500 transition-colors"
          >
            <div
              className={cn(
                "w-2.5 h-2.5 rounded-full transition-colors",
                color && color !== 'default'
                  ? colorConfig[color].bg
                  : "bg-transparent"
              )}
            />
          </button>

          <AnimatePresence>
            {showColorMenu && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="absolute left-0 top-full mt-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl py-1.5 px-1.5 z-50 flex flex-col gap-0.5"
              >
                {(['default', 'blue', 'green', 'purple', 'yellow', 'red'] as ItemColor[]).map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      setColor(c);
                      setShowColorMenu(false);
                    }}
                    className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                  >
                    <div
                      className={cn(
                        "w-3 h-3 rounded-full",
                        c && c !== 'default'
                          ? colorConfig[c].bg
                          : "border border-zinc-300 dark:border-zinc-600"
                      )}
                    />
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        
        {/* 输入框 */}
        <textarea
          ref={inputRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onKeyDown={handleKeyDown}
          placeholder="New task..."
          rows={1}
          className={cn(
            'flex-1 bg-transparent border-none outline-none resize-none py-0.5',
            'text-sm text-foreground placeholder:text-muted-foreground/50',
            'focus:ring-0 leading-relaxed min-h-[20px]',
            compact ? 'max-h-[80px]' : 'max-h-[120px]'
          )}
        />

        {/* 提交按钮 */}
        <AnimatePresence mode="wait">
          {content.trim() && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={handleSubmit}
              className="shrink-0 p-1 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:opacity-90 transition-opacity mt-0.5"
            >
              <Plus className="h-3 w-3" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* 更多菜单按钮 */}
      <div className="relative shrink-0" ref={moreMenuRef}>
        <button
          onClick={() => setShowMoreMenu(!showMoreMenu)}
          className={cn(
            "p-1.5 rounded-md transition-colors mt-0.5",
            showMoreMenu
              ? "text-zinc-600 bg-zinc-100 dark:text-zinc-300 dark:bg-zinc-800"
              : "text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
          )}
        >
          <MoreHorizontal className="size-4" />
        </button>

        <AnimatePresence>
          {showMoreMenu && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl py-1 z-50"
            >
              {/* 颜色过滤 */}
              <div className="px-3 py-2 border-b border-zinc-200 dark:border-zinc-700">
                <div className="text-xs text-zinc-400 dark:text-zinc-500 mb-2">Color Filter</div>
                <div className="flex items-center gap-1.5">
                  {allColors.map(c => (
                    <button
                      key={c}
                      data-color-option
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleColor(c);
                      }}
                      className={cn(
                        "w-5 h-5 rounded-sm border-2 transition-all hover:scale-110",
                        selectedColors.includes(c) && "ring-2 ring-zinc-400 dark:ring-zinc-500 ring-offset-1"
                      )}
                      style={{
                        borderColor: c === 'red' ? '#ef4444' :
                                     c === 'yellow' ? '#eab308' :
                                     c === 'purple' ? '#a855f7' :
                                     c === 'green' ? '#22c55e' :
                                     c === 'blue' ? '#3b82f6' : '#d4d4d8',
                        backgroundColor: c === 'default' ? 'transparent' : undefined,
                      }}
                    />
                  ))}
                  <button
                    data-color-option
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleAllColors();
                    }}
                    className={cn(
                      "w-5 h-5 rounded-sm transition-all hover:scale-110 p-[2px]",
                      selectedColors.length === allColors.length && "ring-2 ring-zinc-400 ring-offset-1"
                    )}
                    style={{ background: 'linear-gradient(135deg, #22c55e, #a855f7, #eab308, #ef4444)' }}
                  >
                    <span className="block w-full h-full bg-white dark:bg-zinc-900 rounded-sm" />
                  </button>
                </div>
              </div>

              <button
                onClick={() => {
                  setHideCompleted(!hideCompleted);
                  setShowMoreMenu(false);
                }}
                className="w-full px-3 py-1.5 text-left text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center justify-between"
              >
                <span>Hide Completed</span>
                {hideCompleted && <Check className="size-4 text-blue-500" />}
              </button>

              <button
                onClick={() => {
                  setHideActualTime(!hideActualTime);
                  setShowMoreMenu(false);
                }}
                className="w-full px-3 py-1.5 text-left text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center justify-between"
              >
                <span>Hide Time Info</span>
                {hideActualTime && <Check className="size-4 text-blue-500" />}
              </button>

              {activeGroupId !== '__archive__' && (
                <>
                  <div className="h-px bg-zinc-200 dark:bg-zinc-700 my-1" />
                  <button
                    onClick={() => setShowMoreMenu(false)}
                    className="w-full px-3 py-1.5 text-left text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    Info
                  </button>
                  <button
                    onClick={() => setShowMoreMenu(false)}
                    className="w-full px-3 py-1.5 text-left text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    History...
                  </button>
                  <div className="h-px bg-zinc-200 dark:bg-zinc-700 my-1" />
                  <button
                    onClick={handleArchiveCompleted}
                    className="w-full px-3 py-1.5 text-left text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    Archive Completed
                  </button>
                  <button
                    onClick={handleDeleteCompleted}
                    className="w-full px-3 py-1.5 text-left text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    Delete Completed
                  </button>
                  <div className="h-px bg-zinc-200 dark:bg-zinc-700 my-1" />
                  <button
                    onClick={() => {
                      if (activeGroupId && activeGroupId !== 'default') {
                        deleteGroup(activeGroupId);
                      }
                      setShowMoreMenu(false);
                    }}
                    className="w-full px-3 py-1.5 text-left text-sm text-red-500 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    Move to Trash
                  </button>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

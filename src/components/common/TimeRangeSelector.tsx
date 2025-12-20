import { useRef, useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { type TimeView } from '@/lib/dateUtils';

interface TimeRangeSelectorProps {
  timeView: TimeView;
  currentRange: number | 'all';
  onRangeChange: (range: number | 'all') => void;
}

export function TimeRangeSelector({ timeView, currentRange, onRangeChange }: TimeRangeSelectorProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const originalRangeRef = useRef<number | 'all'>(currentRange);

  // Get range options based on time view
  const getRangeOptions = () => {
    if (timeView === 'day') return [1, 3, 7, 14, 30, 'all' as const];
    if (timeView === 'week') return [1, 2, 4, 8, 12, 'all' as const];
    return [1, 2, 3, 6, 12, 'all' as const];
  };

  // Format range display text
  const formatRangeText = (range: number | 'all') => {
    if (range === 'all') return 'All';
    if (timeView === 'day') return `${range}d`;
    if (timeView === 'week') return `${range}w`;
    return `${range}mo`;
  };

  // Parse custom range input
  const parseCustomRange = (input: string): number | null => {
    const trimmed = input.trim();
    if (!trimmed) return null;
    const num = parseInt(trimmed, 10);
    return !isNaN(num) && num > 0 ? num : null;
  };

  // Save original value when menu opens
  useEffect(() => {
    if (showMenu) {
      originalRangeRef.current = currentRange;
      setCustomInput('');
    }
  }, [showMenu, currentRange]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        // Restore original value if there's uncommitted input
        if (customInput.trim()) {
          onRangeChange(originalRangeRef.current);
        }
        setShowMenu(false);
        setCustomInput('');
      }
    };
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMenu, customInput, onRangeChange]);

  // Focus input when menu opens
  useEffect(() => {
    if (showMenu && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [showMenu]);

  const handleSubmitCustom = () => {
    const parsed = parseCustomRange(customInput);
    if (parsed !== null) {
      onRangeChange(parsed);
      setShowMenu(false);
      setCustomInput('');
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setShowMenu(!showMenu);
        }}
        className={`px-2 py-1 text-xs rounded-md transition-colors flex items-center gap-1 ${
          showMenu
            ? 'text-zinc-600 bg-zinc-100 dark:text-zinc-300 dark:bg-zinc-800'
            : 'text-zinc-500 hover:text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:text-zinc-300 dark:hover:bg-zinc-800'
        }`}
      >
        {formatRangeText(currentRange)}
        <ChevronDown className="h-3 w-3" />
      </button>
      {showMenu && (
        <div className="absolute right-0 top-full mt-1 w-32 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl py-1 z-50">
          {getRangeOptions().map(option => (
            <button
              key={String(option)}
              onClick={() => {
                onRangeChange(option);
                setShowMenu(false);
                setCustomInput('');
              }}
              className={`w-full px-3 py-1.5 text-left text-sm transition-colors flex items-center ${
                currentRange === option
                  ? 'text-zinc-900 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-800'
                  : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'
              }`}
            >
              {currentRange === option && <span className="mr-1">✓</span>}
              {formatRangeText(option)}
            </button>
          ))}
          
          {/* Custom input */}
          <div className="border-t border-zinc-200 dark:border-zinc-700 mt-1 pt-1 px-2">
            <div className="flex gap-1">
              <input
                ref={inputRef}
                type="text"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSubmitCustom();
                  } else if (e.key === 'Escape') {
                    setShowMenu(false);
                    setCustomInput('');
                  }
                }}
                placeholder="Custom"
                className="w-full px-2 py-1 text-xs border border-zinc-200 dark:border-zinc-700 rounded bg-transparent focus:outline-none focus:ring-1 focus:ring-zinc-400"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

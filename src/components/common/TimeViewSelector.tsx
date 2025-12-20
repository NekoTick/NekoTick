import { useRef, useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { type TimeView } from '@/lib/dateUtils';

interface TimeViewSelectorProps {
  timeView: TimeView;
  onTimeViewChange: (view: TimeView) => void;
}

export function TimeViewSelector({ timeView, onTimeViewChange }: TimeViewSelectorProps) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMenu]);

  const getLabel = (view: TimeView) => {
    switch (view) {
      case 'day': return 'Day';
      case 'week': return 'Week';
      case 'month': return 'Month';
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setShowMenu(!showMenu);
        }}
        className={`px-2 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
          showMenu
            ? 'text-zinc-600 bg-zinc-100 dark:text-zinc-300 dark:bg-zinc-800'
            : 'text-zinc-500 hover:text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:text-zinc-300 dark:hover:bg-zinc-800'
        }`}
      >
        {getLabel(timeView)}
        <ChevronDown className="h-3 w-3" />
      </button>
      {showMenu && (
        <div className="absolute right-0 top-full mt-1 w-20 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl py-1 z-50">
          {(['day', 'week', 'month'] as TimeView[]).map((view) => (
            <button
              key={view}
              onClick={() => {
                onTimeViewChange(view);
                setShowMenu(false);
              }}
              className={`w-full px-3 py-1.5 text-left text-sm transition-colors flex items-center ${
                timeView === view
                  ? 'text-zinc-900 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-800'
                  : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'
              }`}
            >
              {timeView === view && <span className="mr-1">✓</span>}
              {getLabel(view)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

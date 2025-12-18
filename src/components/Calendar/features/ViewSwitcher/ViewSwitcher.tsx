import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CaretDown, CaretLeft, CaretRight, Check, MagnifyingGlass, SidebarSimple } from '@phosphor-icons/react';
import { useCalendarStore, type ViewMode } from '@/stores/useCalendarStore';
import { addDays, addMonths } from 'date-fns';

// View mode labels
const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
};

// Keyboard shortcuts display
const VIEW_MODE_SHORTCUTS: Record<ViewMode, string> = {
  day: '1 or D',
  week: '0 or W',
  month: 'M',
};

// View mode order for dropdown
const VIEW_MODE_ORDER: ViewMode[] = ['day', 'week', 'month'];

// Day count options (2-9)
const DAY_COUNT_OPTIONS = [2, 3, 4, 5, 6, 7, 8, 9];

export function ViewSwitcher() {
  const { viewMode, setViewMode, selectedDate, setSelectedDate, dayCount, setDayCount, showSidebar, toggleSidebar, showContextPanel, toggleContextPanel } = useCalendarStore();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const [showDayCountSubmenu, setShowDayCountSubmenu] = useState(false);
  const [showCustomDayModal, setShowCustomDayModal] = useState(false);
  const [customDayInput, setCustomDayInput] = useState('');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const dayCountItemRef = useRef<HTMLButtonElement>(null);
  const customInputRef = useRef<HTMLInputElement>(null);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      
      // Check if click is inside any of our elements
      const isInsideDropdown = dropdownRef.current?.contains(target);
      const isInsideSubmenu = submenuRef.current?.contains(target);
      const isInsideButton = buttonRef.current?.contains(target);
      
      if (!isInsideDropdown && !isInsideSubmenu && !isInsideButton) {
        setIsDropdownOpen(false);
        setShowDayCountSubmenu(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isDropdownOpen]);

  // Update dropdown position when opened
  useEffect(() => {
    if (isDropdownOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 4,
        left: rect.left,
      });
    }
  }, [isDropdownOpen]);

  // Focus custom input when modal opens
  useEffect(() => {
    if (showCustomDayModal && customInputRef.current) {
      customInputRef.current.focus();
    }
  }, [showCustomDayModal]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if input/textarea is focused
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      const key = e.key.toUpperCase();
      const numKey = parseInt(e.key);
      
      if (key === '1' || key === 'D') {
        e.preventDefault();
        setDayCount(1); // Reset to single day
        setViewMode('day');
      } else if (key === '0' || key === 'W') {
        e.preventDefault();
        setViewMode('week');
      } else if (key === 'M') {
        e.preventDefault();
        setViewMode('month');
      } else if (numKey >= 2 && numKey <= 9) {
        // Day count shortcuts
        e.preventDefault();
        setDayCount(numKey);
        setViewMode('day');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setViewMode, setDayCount]);

  // Handle view mode selection
  const handleSelectViewMode = (mode: ViewMode) => {
    // When selecting "day" mode from the main menu, reset to single day
    if (mode === 'day') {
      setDayCount(1);
    }
    setViewMode(mode);
    setIsDropdownOpen(false);
    setShowDayCountSubmenu(false);
  };

  // Handle day count selection
  const handleSelectDayCount = (count: number) => {
    setDayCount(count);
    setViewMode('day');
    setIsDropdownOpen(false);
    setShowDayCountSubmenu(false);
  };

  // Handle custom day count
  const handleCustomDaySubmit = () => {
    const count = parseInt(customDayInput);
    if (count >= 1 && count <= 14) {
      setDayCount(count);
      setViewMode('day');
      setShowCustomDayModal(false);
      setIsDropdownOpen(false);
      setShowDayCountSubmenu(false);
      setCustomDayInput('');
    }
  };

  // Navigate to today
  const handleTodayClick = () => {
    setSelectedDate(new Date());
  };

  // Navigate prev/next based on view mode
  const handleNavigate = (direction: 'prev' | 'next') => {
    const multiplier = direction === 'prev' ? -1 : 1;
    
    let newDate: Date;
    switch (viewMode) {
      case 'day':
        newDate = addDays(selectedDate, multiplier * (dayCount || 1));
        break;
      case 'week':
        newDate = addDays(selectedDate, multiplier * 7);
        break;
      case 'month':
        newDate = addMonths(selectedDate, multiplier * 1);
        break;
    }
    
    setSelectedDate(newDate);
  };

  // Get submenu position
  const getSubmenuPosition = () => {
    if (!dayCountItemRef.current) return { top: 0, left: 0 };
    const rect = dayCountItemRef.current.getBoundingClientRect();
    return {
      top: rect.top,
      left: rect.right + 4,
    };
  };

  // Get display label for current view
  const getDisplayLabel = () => {
    if (viewMode === 'day' && dayCount && dayCount > 1) {
      return `${dayCount} Days`;
    }
    return VIEW_MODE_LABELS[viewMode];
  };

  return (
    <div className="flex items-center gap-1">
      {/* Left Sidebar Toggle */}
      <button
        onClick={toggleSidebar}
        className={`p-1.5 rounded-md transition-colors ${
          showSidebar 
            ? 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800' 
            : 'text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
        }`}
        title={showSidebar ? 'Hide left sidebar' : 'Show left sidebar'}
      >
        <SidebarSimple weight={showSidebar ? 'duotone' : 'light'} className="size-5" />
      </button>

      {/* Search Button */}
      <button
        className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        title="Search"
      >
        <MagnifyingGlass weight="regular" className="size-5" />
      </button>

      {/* View Mode Dropdown */}
      <div className="relative">
        <button
          ref={buttonRef}
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
        >
          <span>{getDisplayLabel()}</span>
          <CaretDown 
            weight="bold" 
            className={`size-3 text-zinc-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} 
          />
        </button>

        {/* Dropdown Menu - Rendered via Portal */}
        {isDropdownOpen && createPortal(
          <div 
            ref={dropdownRef}
            className="fixed w-52 bg-zinc-900 rounded-xl shadow-2xl py-2 overflow-hidden"
            style={{ 
              zIndex: 99999,
              top: dropdownPosition.top,
              left: dropdownPosition.left,
            }}
          >
            {/* View Mode Options */}
            {VIEW_MODE_ORDER.map((mode) => (
              <button
                key={mode}
                onClick={() => handleSelectViewMode(mode)}
                className="w-full px-4 py-2.5 flex items-center justify-between text-sm text-zinc-100 hover:bg-zinc-800 transition-colors"
              >
                <span className="flex items-center gap-3">
                  <span className="w-4 flex justify-center">
                    {viewMode === mode && (!dayCount || dayCount === 1 || mode !== 'day') && (
                      <Check weight="bold" className="size-4" />
                    )}
                  </span>
                  <span className="text-base">{VIEW_MODE_LABELS[mode]}</span>
                </span>
                <span className="text-zinc-500 text-sm">{VIEW_MODE_SHORTCUTS[mode]}</span>
              </button>
            ))}
            
            {/* Divider */}
            <div className="h-px bg-zinc-700 my-2" />
            
            {/* Day Count Option with Submenu */}
            <button 
              ref={dayCountItemRef}
              onMouseEnter={() => setShowDayCountSubmenu(true)}
              className={`w-full px-4 py-2.5 flex items-center justify-between text-sm text-zinc-100 transition-colors ${showDayCountSubmenu ? 'bg-zinc-800' : 'hover:bg-zinc-800'}`}
            >
              <span className="flex items-center gap-3">
                <span className="w-4 flex justify-center">
                  {viewMode === 'day' && dayCount && dayCount > 1 && (
                    <Check weight="bold" className="size-4" />
                  )}
                </span>
                <span className="text-base">Days</span>
              </span>
              <CaretRight weight="bold" className="size-4 text-zinc-500" />
            </button>
            
            {/* Divider */}
            <div className="h-px bg-zinc-700 my-2" />
            
            <button className="w-full px-4 py-2.5 flex items-center justify-between text-sm text-zinc-100 hover:bg-zinc-800 transition-colors">
              <span className="flex items-center gap-3">
                <span className="w-4" />
                <span className="text-base">View Settings</span>
              </span>
              <CaretRight weight="bold" className="size-4 text-zinc-500" />
            </button>
          </div>,
          document.body
        )}

        {/* Day Count Submenu */}
        {isDropdownOpen && showDayCountSubmenu && createPortal(
          <div 
            ref={submenuRef}
            className="fixed w-40 bg-zinc-900 rounded-xl shadow-2xl py-2 overflow-hidden"
            style={{ 
              zIndex: 100000,
              ...getSubmenuPosition(),
            }}
            onMouseLeave={() => setShowDayCountSubmenu(false)}
          >
            {DAY_COUNT_OPTIONS.map((count) => (
              <button
                key={count}
                onClick={() => handleSelectDayCount(count)}
                className="w-full px-4 py-2 flex items-center justify-between text-sm text-zinc-100 hover:bg-zinc-800 transition-colors"
              >
                <span>{count} days</span>
                <span className="text-zinc-500">{count}</span>
              </button>
            ))}
            
            {/* Divider */}
            <div className="h-px bg-zinc-700 my-2" />
            
            {/* Custom Option */}
            <button
              onClick={() => {
                setShowCustomDayModal(true);
                setIsDropdownOpen(false);
                setShowDayCountSubmenu(false);
              }}
              className="w-full px-4 py-2 text-left text-sm text-zinc-100 hover:bg-zinc-800 transition-colors"
            >
              Other...
            </button>
          </div>,
          document.body
        )}
      </div>

      {/* Custom Day Count Modal */}
      {showCustomDayModal && createPortal(
        <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 100001 }}>
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/20"
            onClick={() => {
              setShowCustomDayModal(false);
              setCustomDayInput('');
            }}
          />
          
          {/* Modal */}
          <div className="relative bg-white dark:bg-zinc-100 rounded-xl shadow-2xl w-80 overflow-hidden">
            {/* Search Input */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-200">
              <MagnifyingGlass weight="regular" className="size-4 text-zinc-400" />
              <input
                ref={customInputRef}
                type="text"
                value={customDayInput}
                onChange={(e) => setCustomDayInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCustomDaySubmit();
                  } else if (e.key === 'Escape') {
                    setShowCustomDayModal(false);
                    setCustomDayInput('');
                  }
                }}
                placeholder="Set number of days..."
                className="flex-1 bg-transparent text-sm text-zinc-900 placeholder-zinc-400 outline-none"
              />
            </div>
            
            {/* Options List */}
            <div className="max-h-80 overflow-y-auto">
              {Array.from({ length: 11 }, (_, i) => i + 1).map((count) => (
                <button
                  key={count}
                  onClick={() => {
                    setDayCount(count);
                    setViewMode('day');
                    setShowCustomDayModal(false);
                    setCustomDayInput('');
                  }}
                  className="w-full px-4 py-2.5 text-left text-sm text-zinc-700 hover:bg-zinc-100 transition-colors"
                >
                  {count}
                </button>
              ))}
            </div>
            
            {/* Footer */}
            <div className="px-4 py-2 border-t border-zinc-200 flex items-center gap-4 text-xs text-zinc-400">
              <span>↑↓ Navigate</span>
              <span>↵ Select</span>
              <span>Esc Close</span>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Today Button */}
      <button
        onClick={handleTodayClick}
        className="px-3 py-1.5 text-sm font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
      >
        Today
      </button>

      {/* Navigation Arrows */}
      <div className="flex items-center">
        <button
          onClick={() => handleNavigate('prev')}
          className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md text-zinc-500 transition-colors"
        >
          <CaretLeft weight="bold" className="size-4" />
        </button>
        <button
          onClick={() => handleNavigate('next')}
          className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md text-zinc-500 transition-colors"
        >
          <CaretRight weight="bold" className="size-4" />
        </button>
      </div>

      {/* Context Panel Toggle */}
      <button
        onClick={toggleContextPanel}
        className={`p-1.5 rounded-md transition-colors ${
          showContextPanel 
            ? 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800' 
            : 'text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
        }`}
        title={showContextPanel ? 'Hide sidebar' : 'Show sidebar'}
      >
        <SidebarSimple weight={showContextPanel ? 'duotone' : 'light'} className="size-5 -scale-x-100" />
      </button>
    </div>
  );
}

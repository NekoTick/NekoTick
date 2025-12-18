/**
 * EventEditForm - Event edit form
 * 
 * Supports two modes:
 * 1. Embedded (in the right panel)
 * 2. Floating (when the right panel is hidden)
 */

import { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { Clock, Folder, ChevronDown, X } from 'lucide-react';
import { useCalendarStore, type CalendarEvent } from '@/stores/useCalendarStore';
import { cn } from '@/lib/utils';
import type { ItemColor } from '@/stores/types';

// ============ Color Configuration ============

const COLOR_OPTIONS: ItemColor[] = ['default', 'blue', 'green', 'purple', 'yellow', 'red'];
const COLOR_VALUES: Record<ItemColor, string> = {
  red: '#ef4444',
  yellow: '#eab308',
  purple: '#a855f7',
  green: '#22c55e',
  blue: '#3b82f6',
  default: '#d4d4d8',
};

// ============ Types ============

interface EventEditFormProps {
  event: CalendarEvent;
  mode?: 'embedded' | 'floating';
  position?: { x: number; y: number };
}

// ============ Component ============

export function EventEditForm({ event, mode = 'embedded', position }: EventEditFormProps) {
  const { updateEvent, closeEditingEvent, groups } = useCalendarStore();
  const [title, setTitle] = useState(event.title);
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const groupPickerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isNewEvent = useRef(!event.title.trim());

  const currentGroup = groups.find(g => g.id === event.groupId) || groups[0];

  // Sync title
  useEffect(() => {
    setTitle(event.title);
  }, [event.title]);

  // Auto-focus for new events
  useEffect(() => {
    if (isNewEvent.current && inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // Close group picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (groupPickerRef.current && !groupPickerRef.current.contains(e.target as Node)) {
        setShowGroupPicker(false);
      }
    };
    if (showGroupPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showGroupPicker]);

  // ============ Event Handlers ============

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    updateEvent(event.id, { content: newTitle });
  };

  const handleColorChange = (color: ItemColor) => {
    updateEvent(event.id, { color });
  };

  const handleGroupChange = (groupId: string) => {
    updateEvent(event.id, { groupId });
    setShowGroupPicker(false);
  };

  // ============ Time Formatting ============

  const startDate = new Date(event.startDate);
  const endDate = new Date(event.endDate);
  const durationMs = endDate.getTime() - startDate.getTime();
  const durationHours = Math.floor(durationMs / (1000 * 60 * 60));
  const durationMinutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));

  const formatDuration = () => {
    if (durationHours > 0 && durationMinutes > 0) return `${durationHours}h ${durationMinutes}m`;
    if (durationHours > 0) return `${durationHours}h`;
    return `${durationMinutes}m`;
  };

  // ============ Floating Mode Position Calculation ============

  const getFloatingStyle = () => {
    if (mode !== 'floating' || !position) {
      return {};
    }

    const windowHeight = window.innerHeight;
    const windowWidth = window.innerWidth;
    const panelWidth = 280;
    const panelHeight = 240;

    let top = position.y;
    let left = position.x + 20;

    if (left + panelWidth > windowWidth - 20) {
      left = position.x - panelWidth - 20;
    }

    if (top + panelHeight > windowHeight - 20) {
      top = windowHeight - panelHeight - 20;
    }

    if (top < 20) {
      top = 20;
    }

    return { top: `${top}px`, left: `${left}px` };
  };

  // ============ Render ============

  const containerClass = mode === 'floating'
    ? 'fixed z-[100] w-[280px] bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden'
    : 'h-full flex flex-col bg-white dark:bg-zinc-900';

  return (
    <div
      ref={containerRef}
      data-context-panel
      style={mode === 'floating' ? getFloatingStyle() : undefined}
      className={containerClass}
    >
      {/* Header */}
      <div className={`p-4 border-b border-zinc-200 dark:border-zinc-800 ${mode === 'floating' ? 'p-3' : ''}`}>
        <div className="flex items-center justify-end mb-2">
          <button
            onClick={closeEditingEvent}
            className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
          >
            <X className="size-4 text-zinc-400" />
          </button>
        </div>

        {/* Title input */}
        <input
          ref={inputRef}
          type="text"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              closeEditingEvent();
            }
          }}
          placeholder="Add title"
          className="w-full bg-zinc-100 dark:bg-zinc-800 rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />

        {/* Color picker */}
        <div className="flex items-center justify-between gap-1.5 mt-3">
          {COLOR_OPTIONS.map((color) => (
            <button
              key={color}
              onClick={() => handleColorChange(color)}
              className={cn(
                'w-6 h-6 rounded-md border-2 transition-all hover:scale-110',
                event.color === color || (!event.color && color === 'default')
                  ? 'ring-2 ring-zinc-400 dark:ring-zinc-500 ring-offset-1 dark:ring-offset-zinc-900'
                  : ''
              )}
              style={{
                borderColor: COLOR_VALUES[color],
                backgroundColor: color === 'default' ? 'transparent' : undefined,
              }}
              title={color === 'default' ? 'Default' : color}
            />
          ))}
        </div>
      </div>

      {/* Content */}
      <div className={`flex-1 overflow-visible p-4 space-y-4 ${mode === 'floating' ? 'p-3 space-y-3' : ''}`}>
        {/* Time */}
        <div className="flex items-start gap-3">
          <Clock className="size-4 text-zinc-400 mt-0.5" />
          <div className="text-sm text-zinc-700 dark:text-zinc-300">
            {format(startDate, 'h:mm a').toUpperCase()}
            <span className="mx-2 text-zinc-400">→</span>
            {format(endDate, 'h:mm a').toUpperCase()}
            <span className="ml-2 text-zinc-400">{formatDuration()}</span>
          </div>
        </div>

        {/* Group picker */}
        <div className="flex items-center gap-3 relative" ref={groupPickerRef}>
          <Folder className="size-4 text-zinc-400" />
          <button
            onClick={() => setShowGroupPicker(!showGroupPicker)}
            className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300 hover:text-zinc-800 dark:hover:text-zinc-100 transition-colors"
          >
            <span>{currentGroup?.name || 'Inbox'}</span>
            <ChevronDown className={`size-3.5 text-zinc-400 transition-transform ${showGroupPicker ? 'rotate-180' : ''}`} />
          </button>

          {showGroupPicker && (
            <div className="absolute left-7 top-full mt-1 w-40 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg py-1 z-50">
              {groups.map((group) => (
                <button
                  key={group.id}
                  onClick={() => handleGroupChange(group.id)}
                  className={`w-full px-3 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors ${
                    group.id === event.groupId
                      ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                      : 'text-zinc-600 dark:text-zinc-300'
                  }`}
                >
                  {group.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

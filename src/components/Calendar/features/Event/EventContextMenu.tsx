import { createPortal } from 'react-dom';
import { Scissors, Copy, CopyPlus, Trash2, Check, Play, Pause, Square } from 'lucide-react';
import { useCalendarStore } from '@/stores/useCalendarStore';

interface EventContextMenuProps {
  eventId: string;
  position: { x: number; y: number };
  currentColor?: string;
  timerState?: 'idle' | 'running' | 'paused';
  onClose: () => void;
}

// Unified color system - Apple style colors
type ColorName = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'brown' | 'default';
const COLORS: { name: ColorName; bg: string }[] = [
  { name: 'red', bg: 'bg-[#FE002D]' },
  { name: 'orange', bg: 'bg-[#FF8500]' },
  { name: 'yellow', bg: 'bg-[#FEC900]' },
  { name: 'green', bg: 'bg-[#63DA38]' },
  { name: 'blue', bg: 'bg-[#008BFE]' },
  { name: 'purple', bg: 'bg-[#DD11E8]' },
  { name: 'brown', bg: 'bg-[#B47D58]' },
  { name: 'default', bg: 'bg-[#9F9FA9]' },
];

export function EventContextMenu({ eventId, position, currentColor = 'blue', timerState = 'idle', onClose }: EventContextMenuProps) {
  const { updateEvent, deleteEvent, events, addEvent, startTimer, pauseTimer, resumeTimer, stopTimer } = useCalendarStore();

  const handleColorChange = (color: ColorName) => {
    updateEvent(eventId, { color });
    onClose();
  };

  const handleDelete = () => {
    deleteEvent(eventId);
    onClose();
  };

  const handleDuplicate = () => {
    const event = events.find(e => e.id === eventId);
    if (event) {
      addEvent({
        content: event.content,
        startDate: event.startDate,
        endDate: event.endDate,
        isAllDay: event.isAllDay,
        color: event.color,
      });
    }
    onClose();
  };

  const handleStartTimer = () => {
    startTimer(eventId);
    onClose();
  };

  const handlePauseTimer = () => {
    pauseTimer(eventId);
    onClose();
  };

  const handleResumeTimer = () => {
    resumeTimer(eventId);
    onClose();
  };

  const handleStopTimer = () => {
    stopTimer(eventId);
    onClose();
  };

  return createPortal(
    <>
      {/* Backdrop */}
      <div 
        data-event-context-menu 
        className="fixed inset-0 z-[99998]" 
        onClick={onClose} 
        onContextMenu={(e) => { e.preventDefault(); onClose(); }} 
      />
      
      {/* Menu */}
      <div
        data-event-context-menu
        className="fixed z-[99999] w-56 bg-zinc-900 rounded-xl shadow-2xl py-2 overflow-hidden"
        style={{ top: position.y, left: position.x }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Color Picker */}
        <div className="px-4 py-2 flex gap-2">
          {COLORS.map((color) => (
            <button
              key={color.name}
              onClick={() => handleColorChange(color.name)}
              className={`w-6 h-6 rounded-md ${color.bg} flex items-center justify-center hover:scale-110 transition-transform`}
            >
              {currentColor === color.name && <Check className="size-4 text-white" />}
            </button>
          ))}
        </div>

        <div className="h-px bg-zinc-700 my-2" />

        {/* Timer Actions */}
        {timerState === 'idle' && (
          <button 
            onClick={handleStartTimer}
            className="w-full px-4 py-2 flex items-center gap-3 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            <Play className="size-4" />
            <span className="flex-1 text-left">Start Timer</span>
          </button>
        )}
        
        {timerState === 'running' && (
          <>
            <button 
              onClick={handlePauseTimer}
              className="w-full px-4 py-2 flex items-center gap-3 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              <Pause className="size-4" />
              <span className="flex-1 text-left">Pause Timer</span>
            </button>
            <button 
              onClick={handleStopTimer}
              className="w-full px-4 py-2 flex items-center gap-3 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              <Square className="size-4" />
              <span className="flex-1 text-left">Stop Timer</span>
            </button>
          </>
        )}
        
        {timerState === 'paused' && (
          <>
            <button 
              onClick={handleResumeTimer}
              className="w-full px-4 py-2 flex items-center gap-3 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              <Play className="size-4" />
              <span className="flex-1 text-left">Resume Timer</span>
            </button>
            <button 
              onClick={handleStopTimer}
              className="w-full px-4 py-2 flex items-center gap-3 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              <Square className="size-4" />
              <span className="flex-1 text-left">Stop Timer</span>
            </button>
          </>
        )}

        <div className="h-px bg-zinc-700 my-2" />

        {/* Actions */}
        <button className="w-full px-4 py-2 flex items-center gap-3 text-sm text-zinc-300 hover:bg-zinc-800">
          <Scissors className="size-4" />
          <span className="flex-1 text-left">Cut</span>
          <span className="text-zinc-500 text-xs">Ctrl X</span>
        </button>

        <button className="w-full px-4 py-2 flex items-center gap-3 text-sm text-zinc-300 hover:bg-zinc-800">
          <Copy className="size-4" />
          <span className="flex-1 text-left">Copy</span>
          <span className="text-zinc-500 text-xs">Ctrl C</span>
        </button>

        <button 
          onClick={handleDuplicate}
          className="w-full px-4 py-2 flex items-center gap-3 text-sm text-zinc-300 hover:bg-zinc-800"
        >
          <CopyPlus className="size-4" />
          <span className="flex-1 text-left">Duplicate</span>
          <span className="text-zinc-500 text-xs">Ctrl D</span>
        </button>

        <div className="h-px bg-zinc-700 my-2" />

        <button 
          onClick={handleDelete}
          className="w-full px-4 py-2 flex items-center gap-3 text-sm text-red-400 hover:bg-zinc-800"
        >
          <Trash2 className="size-4" />
          <span className="flex-1 text-left">Delete</span>
          <span className="text-zinc-500 text-xs">Del</span>
        </button>
      </div>
    </>,
    document.body
  );
}

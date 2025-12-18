import { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { Clock, Folder, ChevronDown, X } from 'lucide-react';
import { useCalendarStore, type CalendarEvent } from '@/stores/useCalendarStore';

interface FloatingEventEditorProps {
  event: CalendarEvent;
  position?: { x: number; y: number };
}

export function FloatingEventEditor({ event, position }: FloatingEventEditorProps) {
  const { updateEvent, closeEditingEvent, groups } = useCalendarStore();
  const [title, setTitle] = useState(event.title);
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const groupPickerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isNewEvent = useRef(!event.title.trim());
  
  const currentGroup = groups.find(g => g.id === event.groupId) || groups[0];

  useEffect(() => {
    setTitle(event.title);
  }, [event.title]);
  
  useEffect(() => {
    if (isNewEvent.current && inputRef.current) {
      inputRef.current.focus();
    }
  }, []);
  
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
  
  const handleGroupChange = (groupId: string) => {
    updateEvent(event.id, { groupId });
    setShowGroupPicker(false);
  };

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    updateEvent(event.id, { content: newTitle });
  };

  const startDate = new Date(event.startDate);
  const endDate = new Date(event.endDate);
  const durationMs = endDate.getTime() - startDate.getTime();
  const durationHours = Math.floor(durationMs / (1000 * 60 * 60));
  const durationMinutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));

  const formatDuration = () => {
    if (durationHours > 0 && durationMinutes > 0) return `${durationHours}h${durationMinutes}m`;
    if (durationHours > 0) return `${durationHours}h`;
    return `${durationMinutes}m`;
  };

  // 计算浮动窗口位置
  const getStyle = () => {
    if (!position) return { top: '50%', right: '20px', transform: 'translateY(-50%)' };
    
    // 确保窗口不超出屏幕
    const windowHeight = window.innerHeight;
    const windowWidth = window.innerWidth;
    const panelWidth = 280;
    const panelHeight = 200;
    
    let top = position.y;
    let left = position.x + 20; // 偏移一点避免遮挡事件块
    
    // 如果右边空间不够，放到左边
    if (left + panelWidth > windowWidth - 20) {
      left = position.x - panelWidth - 20;
    }
    
    // 确保不超出底部
    if (top + panelHeight > windowHeight - 20) {
      top = windowHeight - panelHeight - 20;
    }
    
    // 确保不超出顶部
    if (top < 20) {
      top = 20;
    }
    
    return { top: `${top}px`, left: `${left}px` };
  };

  return (
    <div 
      ref={containerRef}
      data-context-panel
      style={getStyle()}
      className="fixed z-[100] w-[280px] bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-700 overflow-hidden"
    >
      {/* Header */}
      <div className="p-3 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center justify-end mb-2">
          <button 
            onClick={closeEditingEvent} 
            className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
          >
            <X className="size-4 text-zinc-400" />
          </button>
        </div>
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
          placeholder="添加标题"
          className="w-full bg-zinc-100 dark:bg-zinc-800 rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Content */}
      <div className="p-3 space-y-3">
        {/* Time */}
        <div className="flex items-center gap-2">
          <Clock className="size-4 text-zinc-400" />
          <span className="text-sm text-zinc-600 dark:text-zinc-300">
            {format(startDate, 'h:mm a').toUpperCase()}
            <span className="mx-1.5 text-zinc-400">→</span>
            {format(endDate, 'h:mm a').toUpperCase()}
            <span className="ml-1.5 text-zinc-400">{formatDuration()}</span>
          </span>
        </div>

        {/* Group Picker */}
        <div className="flex items-center gap-2 relative" ref={groupPickerRef}>
          <Folder className="size-4 text-zinc-400" />
          <button
            onClick={() => setShowGroupPicker(!showGroupPicker)}
            className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-300 hover:text-zinc-800 dark:hover:text-zinc-100 transition-colors"
          >
            <span>{currentGroup?.name || '收集箱'}</span>
            <ChevronDown className={`size-3 text-zinc-400 transition-transform ${showGroupPicker ? 'rotate-180' : ''}`} />
          </button>
          
          {showGroupPicker && (
            <div className="absolute left-6 top-full mt-1 w-36 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg py-1 z-50">
              {groups.map(group => (
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

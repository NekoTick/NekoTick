/**
 * EventBlock - Calendar event block component
 * 
 * Responsibilities: Rendering + drag interaction dispatch
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { Check, Pause } from 'lucide-react';
import { useCalendarStore } from '@/stores/useCalendarStore';
import { EventContextMenu } from './EventContextMenu';
import { type EventLayoutInfo } from '../../utils/eventLayout';
import { type CalendarDisplayItem } from '../../hooks/useCalendarEvents';
import { calculateEventTop, calculateEventHeight, CALENDAR_CONSTANTS } from '../../utils/timeUtils';

const GAP = CALENDAR_CONSTANTS.GAP as number;
const RESIZE_HANDLE_HEIGHT = CALENDAR_CONSTANTS.RESIZE_HANDLE_HEIGHT as number;

// ============ Color System ============

const COLOR_STYLES: Record<string, { bg: string; text: string; border: string; ring: string; fill: string; overtime: string }> = {
  blue: {
    bg: 'bg-blue-50/90 dark:bg-blue-950/40',
    text: 'text-blue-700 dark:text-blue-200',
    border: 'border-blue-400 dark:border-blue-500',
    ring: 'ring-blue-300/50 dark:ring-blue-600/30',
    fill: 'bg-blue-200/80 dark:bg-blue-800/60',
    overtime: 'border-blue-400',
  },
  red: {
    bg: 'bg-rose-50/90 dark:bg-rose-950/40',
    text: 'text-rose-700 dark:text-rose-200',
    border: 'border-rose-400 dark:border-rose-500',
    ring: 'ring-rose-300/50 dark:ring-rose-600/30',
    fill: 'bg-rose-200/80 dark:bg-rose-800/60',
    overtime: 'border-rose-400',
  },
  green: {
    bg: 'bg-emerald-50/90 dark:bg-emerald-950/40',
    text: 'text-emerald-700 dark:text-emerald-200',
    border: 'border-emerald-400 dark:border-emerald-500',
    ring: 'ring-emerald-300/50 dark:ring-emerald-600/30',
    fill: 'bg-emerald-200/80 dark:bg-emerald-800/60',
    overtime: 'border-emerald-400',
  },
  yellow: {
    bg: 'bg-amber-50/90 dark:bg-amber-950/40',
    text: 'text-amber-700 dark:text-amber-200',
    border: 'border-amber-400 dark:border-amber-500',
    ring: 'ring-amber-300/50 dark:ring-amber-600/30',
    fill: 'bg-amber-200/80 dark:bg-amber-800/60',
    overtime: 'border-amber-400',
  },
  purple: {
    bg: 'bg-violet-50/90 dark:bg-violet-950/40',
    text: 'text-violet-700 dark:text-violet-200',
    border: 'border-violet-400 dark:border-violet-500',
    ring: 'ring-violet-300/50 dark:ring-violet-600/30',
    fill: 'bg-violet-200/80 dark:bg-violet-800/60',
    overtime: 'border-violet-400',
  },
  default: {
    bg: 'bg-zinc-50/90 dark:bg-zinc-800/40',
    text: 'text-zinc-700 dark:text-zinc-200',
    border: 'border-zinc-400 dark:border-zinc-500',
    ring: 'ring-zinc-300/50 dark:ring-zinc-600/30',
    fill: 'bg-zinc-300/80 dark:bg-zinc-600/60',
    overtime: 'border-zinc-400',
  },
};

// ============ Types ============

interface EventBlockProps {
  event: CalendarDisplayItem;
  layout?: EventLayoutInfo;
  hourHeight: number;
  onToggle?: (id: string) => void;
  onDragStart?: (eventId: string, edge: 'top' | 'bottom' | null, clientY: number) => void;
}

// ============ Component ============

export function EventBlock({ event, layout, hourHeight, onToggle, onDragStart }: EventBlockProps) {
  const { 
    setEditingEventId, editingEventId, 
    setSelectedEventId, closeEditingEvent,
    use24Hour
  } = useCalendarStore();

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [resizeEdge, setResizeEdge] = useState<'top' | 'bottom' | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const blockRef = useRef<HTMLDivElement>(null);

  const isActive = editingEventId === event.id;
  const isCompleted = event.completed;
  const isTimerRunning = event.timerState === 'running';
  const isTimerPaused = event.timerState === 'paused';
  const isTimerActive = isTimerRunning || isTimerPaused;

  // Timer tick effect
  useEffect(() => {
    // 非计时状态，清除 elapsed
    if (!isTimerRunning && !isTimerPaused) {
      setElapsedMs(0);
      return;
    }
    
    // 暂停时显示累计时间
    if (isTimerPaused) {
      setElapsedMs(event.timerAccumulated || 0);
      return;
    }

    // 计时中：每秒更新
    const updateElapsed = () => {
      const accumulated = event.timerAccumulated || 0;
      const startedAt = event.timerStartedAt || Date.now();
      const sinceStart = Date.now() - startedAt;
      setElapsedMs(accumulated + sinceStart);
    };

    // 立即更新一次
    updateElapsed();
    
    // 设置定时器
    const interval = setInterval(updateElapsed, 100); // 100ms 更新一次，更流畅
    return () => clearInterval(interval);
  }, [isTimerRunning, isTimerPaused, event.timerStartedAt, event.timerAccumulated]);

  // Calculate position and size
  const top = calculateEventTop(event.startDate, hourHeight);
  const plannedDuration = event.endDate - event.startDate;
  const plannedHeight = calculateEventHeight(event.startDate, event.endDate, hourHeight);
  
  // 计算实际高度（包括超时部分）
  const actualHeight = useMemo(() => {
    if (!isTimerActive) return plannedHeight;
    const elapsedHeight = (elapsedMs / 3600000) * hourHeight;
    return Math.max(plannedHeight, elapsedHeight);
  }, [isTimerActive, elapsedMs, plannedHeight, hourHeight]);

  const height = actualHeight;

  // Height level
  const heightLevel = useMemo(() => {
    if (height < 20) return 'micro';
    if (height < 32) return 'tiny';
    if (height < 48) return 'small';
    if (height < 80) return 'medium';
    return 'large';
  }, [height]);

  // Color
  const colorStyles = COLOR_STYLES[event.color || 'blue'] || COLOR_STYLES.blue;

  // Position calculation
  // Ensure events don't overlap by applying consistent gaps
  const positioning = useMemo(() => {
    if (!layout) {
      return { left: `${GAP}px`, width: `calc(100% - ${GAP * 2}px)` };
    }

    const { leftPercent, widthPercent, totalColumns, column } = layout;
    
    // Each event gets GAP on the outside edges, and GAP/2 between adjacent events
    // This ensures a total gap of GAP between any two adjacent events
    const isFirstColumn = column === 0;
    const isLastColumn = column === totalColumns - 1;

    // Left padding: GAP for first column, GAP/2 for others
    const leftPadding = isFirstColumn ? GAP : GAP / 2;
    // Right padding: GAP for last column, GAP/2 for others  
    const rightPadding = isLastColumn ? GAP : GAP / 2;
    
    // Total horizontal padding for this event
    const totalPadding = leftPadding + rightPadding;

    return {
      left: `calc(${leftPercent}% + ${leftPadding}px)`,
      width: `calc(${widthPercent}% - ${totalPadding}px)`,
    };
  }, [layout]);

  // z-index
  const zIndex = useMemo(() => {
    const column = layout?.column || 0;
    const baseZ = column + 10;
    if (isDragging) return 50;
    if (isActive) return 100;
    if (isHovered) return 40;
    return baseZ;
  }, [layout?.column, isActive, isHovered, isDragging]);

  // Shadow
  const shadowClass = useMemo(() => {
    if (isDragging) return 'shadow-xl shadow-black/15 dark:shadow-black/40';
    if (isActive) return 'shadow-lg shadow-black/10 dark:shadow-black/30';
    if (isHovered) return 'shadow-md shadow-black/8 dark:shadow-black/25';
    return 'shadow-sm shadow-black/5 dark:shadow-black/15';
  }, [isActive, isHovered, isDragging]);

  // Cursor
  const cursorClass = useMemo(() => {
    if (isDragging) return 'cursor-grabbing';
    if (resizeEdge) return 'cursor-row-resize';
    return 'cursor-default';
  }, [resizeEdge, isDragging]);

  // ============ Event Handlers ============

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const relativeY = e.clientY - rect.top;

    if (relativeY <= RESIZE_HANDLE_HEIGHT) {
      setResizeEdge('top');
    } else if (relativeY >= rect.height - RESIZE_HANDLE_HEIGHT) {
      setResizeEdge('bottom');
    } else {
      setResizeEdge(null);
    }
  }, [isDragging]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const startY = e.clientY;
    const LONG_PRESS_DELAY = 150; // Long press threshold (ms)
    let longPressTimer: ReturnType<typeof setTimeout> | null = null;

    // Trigger drag mode after long press
    longPressTimer = setTimeout(() => {
      setIsDragging(true);
      onDragStart?.(event.id, resizeEdge, startY);
    }, LONG_PRESS_DELAY);

    const handleMouseUp = () => {
      // Clear long press timer
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      setIsDragging(false);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mouseup', handleMouseUp);
  }, [event.id, resizeEdge, onDragStart]);

  const handleClick = useCallback(() => {
    if (isDragging) return;
    if (resizeEdge) return;

    if (editingEventId && editingEventId !== event.id) {
      closeEditingEvent();
    }

    setSelectedEventId(event.id);
    setEditingEventId(event.id);
  }, [isDragging, resizeEdge, editingEventId, event.id, closeEditingEvent, setSelectedEventId, setEditingEventId]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  // ============ Render ============

  const showTime = heightLevel !== 'micro' && heightLevel !== 'tiny';
  const showEndTime = heightLevel === 'large' || heightLevel === 'medium';
  const showCheckbox = heightLevel !== 'micro';

  // 计时相关计算
  const plannedMinutes = Math.round(plannedDuration / 60000);
  const isOvertime = elapsedMs > plannedDuration;
  const fillPercent = isTimerActive 
    ? Math.min((elapsedMs / plannedDuration) * 100, 100) 
    : 0;

  // 格式化计时显示（以秒为单位）
  const formatElapsed = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <>
      <div
        ref={blockRef}
        style={{
          top: `${top}px`,
          height: `${Math.max(height, 18)}px`,
          left: positioning.left,
          width: positioning.width,
          zIndex,
        }}
        className={`absolute ${cursorClass} select-none`}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => {
          setIsHovered(false);
          if (!isDragging) setResizeEdge(null);
        }}
        onContextMenu={handleContextMenu}
      >
        <div
          className={`
            w-full h-full flex flex-col relative overflow-hidden
            border-l-[3px] ${colorStyles.border}
            ${isTimerActive ? 'opacity-60' : ''} ${colorStyles.bg}
            rounded-[5px]
            transition-shadow duration-200 ease-out
            ${shadowClass}
            ${isActive ? `ring-2 ${colorStyles.ring}` : ''}
            ${isHovered && !isActive ? `ring-1 ${colorStyles.ring}` : ''}
            ${isTimerActive ? 'border-dashed' : ''}
          `}
          style={{ opacity: isCompleted ? 0.6 : 1 }}
        >
          {/* Timer fill layer - 扫描线效果 */}
          {isTimerActive && (
            <div 
              className={`absolute inset-0 ${colorStyles.fill} transition-all duration-1000 ease-linear rounded-r-[4px]`}
              style={{ 
                height: `${fillPercent}%`,
                opacity: 1,
              }}
            />
          )}
          
          {/* 超时分界线 */}
          {isOvertime && (
            <div 
              className={`absolute left-0 right-0 border-t-2 ${colorStyles.overtime}`}
              style={{ top: `${plannedHeight}px` }}
            />
          )}

          {/* Content layer */}
          <div className={`relative z-10 flex items-start gap-1.5 px-2 py-1 ${heightLevel === 'tiny' ? 'items-center' : ''}`}>
            {showCheckbox && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle?.(event.id);
                }}
                className={`
                  flex-shrink-0 w-3.5 h-3.5 rounded-[3px] border flex items-center justify-center transition-all duration-150 mt-0.5
                  ${isCompleted
                    ? 'bg-zinc-400 border-zinc-400 dark:bg-zinc-500 dark:border-zinc-500'
                    : 'border-current opacity-50 bg-white/50 dark:bg-zinc-800/50 hover:opacity-80'
                  }
                `}
              >
                {isCompleted && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
              </button>
            )}
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <div className="flex items-center gap-1">
                {isTimerPaused && <Pause className="w-2.5 h-2.5 flex-shrink-0 opacity-70" />}
                <p
                  className={`font-medium leading-tight truncate ${colorStyles.text} ${isCompleted ? 'line-through opacity-60' : ''} ${heightLevel === 'micro' ? 'text-[9px]' : 'text-[11px]'}`}
                >
                  {event.content || 'Untitled'}
                </p>
              </div>
              {showTime && (
                <p className={`mt-0.5 tabular-nums font-medium ${colorStyles.text} opacity-70 ${heightLevel === 'small' ? 'text-[8px]' : 'text-[9px]'}`}>
                  {isTimerActive ? (
                    // 计时中显示：已用时间 / 计划时间
                    <>
                      <span className={isOvertime ? 'text-red-500' : ''}>
                        {formatElapsed(elapsedMs)}
                      </span>
                      <span className="opacity-50"> / {plannedMinutes}m</span>
                    </>
                  ) : (
                    // 正常显示时间范围
                    <>
                      {use24Hour ? format(event.startDate, 'H:mm') : format(event.startDate, 'h:mma').toLowerCase()}
                      {showEndTime && ` - ${use24Hour ? format(event.endDate, 'H:mm') : format(event.endDate, 'h:mma').toLowerCase()}`}
                    </>
                  )}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {contextMenu && (
        <EventContextMenu
          eventId={event.id}
          position={contextMenu}
          currentColor={event.color}
          timerState={event.timerState}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}

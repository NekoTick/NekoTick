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
import { calculateEventTop, calculateEventHeight, CALENDAR_CONSTANTS, DEFAULT_DAY_START_MINUTES } from '../../utils/timeUtils';

const GAP = CALENDAR_CONSTANTS.GAP as number;
const RESIZE_HANDLE_HEIGHT = CALENDAR_CONSTANTS.RESIZE_HANDLE_HEIGHT as number;

// ============ Color System - Apple Style Colors ============

const COLOR_STYLES: Record<string, { bg: string; text: string; border: string; ring: string; fill: string; overtime: string; accent: string }> = {
  red: {
    bg: 'bg-[#FE002D]/10 dark:bg-[#FE002D]/20',
    text: 'text-[#FE002D] dark:text-[#FF6B6B]',
    border: 'border-[#FE002D]/40 dark:border-[#FE002D]/50',
    ring: 'ring-[#FE002D]/30 dark:ring-[#FE002D]/20',
    fill: 'bg-[#FE002D]/30 dark:bg-[#FE002D]/40',
    overtime: 'border-[#FE002D]',
    accent: 'bg-[#FE002D]',
  },
  orange: {
    bg: 'bg-[#FF8500]/10 dark:bg-[#FF8500]/20',
    text: 'text-[#FF8500] dark:text-[#FFB366]',
    border: 'border-[#FF8500]/40 dark:border-[#FF8500]/50',
    ring: 'ring-[#FF8500]/30 dark:ring-[#FF8500]/20',
    fill: 'bg-[#FF8500]/30 dark:bg-[#FF8500]/40',
    overtime: 'border-[#FF8500]',
    accent: 'bg-[#FF8500]',
  },
  yellow: {
    bg: 'bg-[#FEC900]/10 dark:bg-[#FEC900]/20',
    text: 'text-[#B8920A] dark:text-[#FEC900]',
    border: 'border-[#FEC900]/40 dark:border-[#FEC900]/50',
    ring: 'ring-[#FEC900]/30 dark:ring-[#FEC900]/20',
    fill: 'bg-[#FEC900]/30 dark:bg-[#FEC900]/40',
    overtime: 'border-[#FEC900]',
    accent: 'bg-[#FEC900]',
  },
  green: {
    bg: 'bg-[#63DA38]/10 dark:bg-[#63DA38]/20',
    text: 'text-[#4CAF2A] dark:text-[#63DA38]',
    border: 'border-[#63DA38]/40 dark:border-[#63DA38]/50',
    ring: 'ring-[#63DA38]/30 dark:ring-[#63DA38]/20',
    fill: 'bg-[#63DA38]/30 dark:bg-[#63DA38]/40',
    overtime: 'border-[#63DA38]',
    accent: 'bg-[#63DA38]',
  },
  blue: {
    bg: 'bg-[#008BFE]/10 dark:bg-[#008BFE]/20',
    text: 'text-[#008BFE] dark:text-[#66B8FF]',
    border: 'border-[#008BFE]/40 dark:border-[#008BFE]/50',
    ring: 'ring-[#008BFE]/30 dark:ring-[#008BFE]/20',
    fill: 'bg-[#008BFE]/30 dark:bg-[#008BFE]/40',
    overtime: 'border-[#008BFE]',
    accent: 'bg-[#008BFE]',
  },
  purple: {
    bg: 'bg-[#DD11E8]/10 dark:bg-[#DD11E8]/20',
    text: 'text-[#DD11E8] dark:text-[#E866F0]',
    border: 'border-[#DD11E8]/40 dark:border-[#DD11E8]/50',
    ring: 'ring-[#DD11E8]/30 dark:ring-[#DD11E8]/20',
    fill: 'bg-[#DD11E8]/30 dark:bg-[#DD11E8]/40',
    overtime: 'border-[#DD11E8]',
    accent: 'bg-[#DD11E8]',
  },
  brown: {
    bg: 'bg-[#B47D58]/10 dark:bg-[#B47D58]/20',
    text: 'text-[#B47D58] dark:text-[#D4A484]',
    border: 'border-[#B47D58]/40 dark:border-[#B47D58]/50',
    ring: 'ring-[#B47D58]/30 dark:ring-[#B47D58]/20',
    fill: 'bg-[#B47D58]/30 dark:bg-[#B47D58]/40',
    overtime: 'border-[#B47D58]',
    accent: 'bg-[#B47D58]',
  },
  default: {
    bg: 'bg-[#9F9FA9]/10 dark:bg-[#9F9FA9]/20',
    text: 'text-[#6B6B73] dark:text-[#9F9FA9]',
    border: 'border-[#9F9FA9]/40 dark:border-[#9F9FA9]/50',
    ring: 'ring-[#9F9FA9]/30 dark:ring-[#9F9FA9]/20',
    fill: 'bg-[#9F9FA9]/30 dark:bg-[#9F9FA9]/40',
    overtime: 'border-[#9F9FA9]',
    accent: 'bg-[#9F9FA9]',
  },
};

// ============ Types ============

interface EventBlockProps {
  event: CalendarDisplayItem;
  layout?: EventLayoutInfo;
  hourHeight: number;
  onToggle?: (id: string) => void;
  onDragStart?: (eventId: string, edge: 'top' | 'bottom' | null, clientY: number) => void;
  dayStartMinutes?: number;
}

// ============ Component ============

export function EventBlock({ event, layout, hourHeight, onToggle, onDragStart, dayStartMinutes = DEFAULT_DAY_START_MINUTES }: EventBlockProps) {
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
  const top = calculateEventTop(event.startDate, hourHeight, dayStartMinutes);
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
  const colorStyles = COLOR_STYLES[event.color || 'default'] || COLOR_STYLES.default;

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
            ${isTimerActive && !isCompleted ? 'opacity-60' : ''} ${colorStyles.bg}
            rounded-[5px]
            transition-shadow duration-200 ease-out
            ${shadowClass}
            ${isActive ? `ring-2 ${colorStyles.ring}` : ''}
            ${isHovered && !isActive ? `ring-1 ${colorStyles.ring}` : ''}
          `}
          style={{ opacity: isCompleted ? 0.6 : 1 }}
        >
          {/* Apple Calendar style - left accent bar */}
          <div 
            className={`absolute left-1 top-1 bottom-1 w-[3px] rounded-full ${colorStyles.accent} ${isTimerActive && !isCompleted ? 'opacity-60' : ''}`}
          />

          {/* Timer fill layer - 扫描线效果（已完成不显示） */}
          {isTimerActive && !isCompleted && (
            <div 
              className={`absolute inset-0 ${colorStyles.fill} transition-all duration-1000 ease-linear rounded-[4px]`}
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
          <div className={`relative z-10 flex items-start gap-1.5 pl-3 pr-2 py-1 ${heightLevel === 'tiny' ? 'items-center' : ''}`}>
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
                    // 计时中显示：已用时间 / 计划时间（都用时:分:秒格式）
                    <>
                      <span className={isOvertime ? 'text-red-500' : ''}>
                        {formatElapsed(elapsedMs)}
                      </span>
                      <span className="opacity-50"> / {formatElapsed(plannedDuration)}</span>
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

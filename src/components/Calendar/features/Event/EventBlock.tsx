import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { useCalendarStore, type CalendarEvent } from '@/stores/useCalendarStore';
import { Check } from 'lucide-react';
import { EventContextMenu } from './EventContextMenu';
import { type EventLayoutInfo } from '../../utils/eventLayout';

const GAP = 3;
const RESIZE_HANDLE_HEIGHT = 6;
const AUTO_SCROLL_THRESHOLD = 5; // 距离边缘多少像素开始自动滚动（几乎触碰边缘）
const AUTO_SCROLL_SPEED = 10; // 滚动速度
const STORE_UPDATE_INTERVAL = 100; // store 更新间隔（毫秒）

// 根据缩放级别动态计算时间精度
function getSnapMinutes(hourHeight: number): number {
  if (hourHeight >= 400) return 1;      // 最大放大：1分钟精度
  if (hourHeight >= 256) return 5;      // 大放大：5分钟精度
  if (hourHeight >= 128) return 10;     // 中等放大：10分钟精度
  if (hourHeight >= 64) return 15;      // 默认：15分钟精度
  return 30;                            // 缩小：30分钟精度
}

// 获取滚动容器
const getScrollContainer = () => document.getElementById('time-grid-scroll');

interface EventBlockProps {
  event: CalendarEvent & { type?: 'event' | 'task'; originalTask?: any };
  onToggle?: (id: string) => void;
  layout?: EventLayoutInfo;
}

export function EventBlock({ event, onToggle, layout }: EventBlockProps) {
  const { setEditingEventId, editingEventId, updateEvent, hourHeight, selectedEventId, setSelectedEventId, closeEditingEvent } = useCalendarStore();
  
  // 使用动态的 hourHeight
  const HOUR_HEIGHT = hourHeight;
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  // 边缘拖拽调整时长
  const [resizeEdge, setResizeEdge] = useState<'top' | 'bottom' | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeStartY, setResizeStartY] = useState(0);
  const [originalTimes, setOriginalTimes] = useState({ start: 0, end: 0 });

  // 整体拖拽移动
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartY, setDragStartY] = useState(0);
  
  // 拖拽过程中的临时时间（用于平滑显示，避免闪烁）
  const [tempTimes, setTempTimes] = useState<{ start: number; end: number } | null>(null);
  
  // 记录拖拽开始时的滚动位置
  const startScrollTop = useRef(0);
  // 自动滚动定时器
  const autoScrollRef = useRef<number | null>(null);
  // 事件块 DOM 引用
  const blockRef = useRef<HTMLDivElement>(null);

  const isActive = editingEventId === event.id;
  const isSelected = selectedEventId === event.id;
  const isTask = event.type === 'task';

  // 使用临时时间（拖拽中）或实际时间来计算位置
  const displayStartDate = tempTimes?.start ?? event.startDate;
  const displayEndDate = tempTimes?.end ?? event.endDate;
  
  // 计算尺寸
  const durationInMinutes = (displayEndDate - displayStartDate) / (1000 * 60);
  const startHour = new Date(displayStartDate).getHours();
  const startMinute = new Date(displayStartDate).getMinutes();
  const top = startHour * HOUR_HEIGHT + (startMinute / 60) * HOUR_HEIGHT;
  const height = (durationInMinutes / 60) * HOUR_HEIGHT;

  // 检测鼠标位置
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isResizing || isDragging || isTask) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const relativeY = e.clientY - rect.top;

      if (relativeY <= RESIZE_HANDLE_HEIGHT) {
        setResizeEdge('top');
      } else if (relativeY >= rect.height - RESIZE_HANDLE_HEIGHT) {
        setResizeEdge('bottom');
      } else {
        setResizeEdge(null);
      }
    },
    [isResizing, isDragging, isTask]
  );

  // 边缘拖拽调整时长
  useEffect(() => {
    if (!isResizing) return;

    const scrollContainer = getScrollContainer();
    let lastMouseY = resizeStartY;
    let currentTempTimes = { start: originalTimes.start, end: originalTimes.end };
    let lastStoreUpdate = 0;

    const snapMinutes = getSnapMinutes(HOUR_HEIGHT);
    
    const calculateNewTimes = (mouseY: number) => {
      const scrollDelta = scrollContainer ? scrollContainer.scrollTop - startScrollTop.current : 0;
      const deltaY = mouseY - resizeStartY + scrollDelta;
      const deltaMinutes = Math.round(((deltaY / HOUR_HEIGHT) * 60) / snapMinutes) * snapMinutes;

      if (resizeEdge === 'top') {
        const newStartDate = originalTimes.start + deltaMinutes * 60 * 1000;
        // 最小时长根据精度动态调整，但至少 5 分钟
        const minDuration = Math.max(snapMinutes, 5) * 60 * 1000;
        if (newStartDate < originalTimes.end - minDuration) {
          return { start: newStartDate, end: originalTimes.end };
        }
      } else if (resizeEdge === 'bottom') {
        const newEndDate = originalTimes.end + deltaMinutes * 60 * 1000;
        const minDuration = Math.max(snapMinutes, 5) * 60 * 1000;
        if (newEndDate > originalTimes.start + minDuration) {
          return { start: originalTimes.start, end: newEndDate };
        }
      }
      return null;
    };

    // 节流更新 store，让其他事件布局实时调整
    const throttledStoreUpdate = (times: { start: number; end: number }) => {
      const now = Date.now();
      if (now - lastStoreUpdate >= STORE_UPDATE_INTERVAL) {
        lastStoreUpdate = now;
        if (resizeEdge === 'top') {
          updateEvent(event.id, { startDate: times.start });
        } else {
          updateEvent(event.id, { endDate: times.end });
        }
      }
    };

    const updateDisplay = (mouseY: number) => {
      const newTimes = calculateNewTimes(mouseY);
      if (newTimes && (newTimes.start !== currentTempTimes.start || newTimes.end !== currentTempTimes.end)) {
        currentTempTimes = newTimes;
        setTempTimes(newTimes);
        throttledStoreUpdate(newTimes);
      }
    };

    // 自动滚动逻辑 - 使用 requestAnimationFrame 更平滑
    let scrollDirection: 'up' | 'down' | null = null;
    
    const scrollStep = () => {
      if (!scrollDirection || !scrollContainer) return;
      
      const scrollAmount = scrollDirection === 'down' ? AUTO_SCROLL_SPEED : -AUTO_SCROLL_SPEED;
      scrollContainer.scrollTop += scrollAmount;
      updateDisplay(lastMouseY);
      
      if (scrollDirection) {
        autoScrollRef.current = requestAnimationFrame(scrollStep);
      }
    };

    const startAutoScroll = (direction: 'up' | 'down') => {
      if (scrollDirection === direction) return;
      scrollDirection = direction;
      if (!autoScrollRef.current) {
        autoScrollRef.current = requestAnimationFrame(scrollStep);
      }
    };

    const stopAutoScroll = () => {
      scrollDirection = null;
      if (autoScrollRef.current) {
        cancelAnimationFrame(autoScrollRef.current);
        autoScrollRef.current = null;
      }
    };

    // 检查事件块是否触碰到滚动容器边缘
    const checkAutoScroll = () => {
      if (!scrollContainer || !blockRef.current) return;
      
      const containerRect = scrollContainer.getBoundingClientRect();
      const blockRect = blockRef.current.getBoundingClientRect();
      
      // 事件块顶部触碰到容器顶部
      const blockTouchesTop = blockRect.top <= containerRect.top + AUTO_SCROLL_THRESHOLD;
      // 事件块底部触碰到容器底部
      const blockTouchesBottom = blockRect.bottom >= containerRect.bottom - AUTO_SCROLL_THRESHOLD;
      
      if (blockTouchesTop && scrollContainer.scrollTop > 0) {
        startAutoScroll('up');
      } else if (blockTouchesBottom && 
                 scrollContainer.scrollTop < scrollContainer.scrollHeight - scrollContainer.clientHeight) {
        startAutoScroll('down');
      } else {
        stopAutoScroll();
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      lastMouseY = e.clientY;
      updateDisplay(e.clientY);
      checkAutoScroll();
    };

    const handleScroll = () => {
      updateDisplay(lastMouseY);
      checkAutoScroll();
    };

    const handleMouseUp = () => {
      stopAutoScroll();
      // 确保最终状态同步到 store
      if (resizeEdge === 'top') {
        updateEvent(event.id, { startDate: currentTempTimes.start });
      } else {
        updateEvent(event.id, { endDate: currentTempTimes.end });
      }
      setTempTimes(null);
      setIsResizing(false);
      setResizeEdge(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    scrollContainer?.addEventListener('scroll', handleScroll);

    return () => {
      stopAutoScroll();
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      scrollContainer?.removeEventListener('scroll', handleScroll);
    };
  }, [isResizing, resizeEdge, resizeStartY, originalTimes, event.id, updateEvent]);

  // 整体拖拽移动
  useEffect(() => {
    if (!isDragging) return;

    const scrollContainer = getScrollContainer();
    let lastMouseY = dragStartY;
    let currentTempTimes = { start: originalTimes.start, end: originalTimes.end };
    let lastStoreUpdate = 0;
    const snapMinutes = getSnapMinutes(HOUR_HEIGHT);

    const calculateNewTimes = (mouseY: number) => {
      const scrollDelta = scrollContainer ? scrollContainer.scrollTop - startScrollTop.current : 0;
      const deltaY = mouseY - dragStartY + scrollDelta;
      const deltaMinutes = Math.round(((deltaY / HOUR_HEIGHT) * 60) / snapMinutes) * snapMinutes;

      const newStartDate = originalTimes.start + deltaMinutes * 60 * 1000;
      const newEndDate = originalTimes.end + deltaMinutes * 60 * 1000;

      const startOfDay = new Date(originalTimes.start);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = startOfDay.getTime() + 24 * 60 * 60 * 1000;

      if (newStartDate >= startOfDay.getTime() && newEndDate <= endOfDay) {
        return { start: newStartDate, end: newEndDate };
      }
      return null;
    };

    // 节流更新 store，让其他事件布局实时调整
    const throttledStoreUpdate = (times: { start: number; end: number }) => {
      const now = Date.now();
      if (now - lastStoreUpdate >= STORE_UPDATE_INTERVAL) {
        lastStoreUpdate = now;
        updateEvent(event.id, { startDate: times.start, endDate: times.end });
      }
    };

    const updateDisplay = (mouseY: number) => {
      const newTimes = calculateNewTimes(mouseY);
      if (newTimes && (newTimes.start !== currentTempTimes.start || newTimes.end !== currentTempTimes.end)) {
        currentTempTimes = newTimes;
        setTempTimes(newTimes);
        throttledStoreUpdate(newTimes);
      }
    };

    // 自动滚动逻辑 - 使用 requestAnimationFrame 更平滑
    let scrollDirection: 'up' | 'down' | null = null;
    
    const scrollStep = () => {
      if (!scrollDirection || !scrollContainer) return;
      
      const scrollAmount = scrollDirection === 'down' ? AUTO_SCROLL_SPEED : -AUTO_SCROLL_SPEED;
      scrollContainer.scrollTop += scrollAmount;
      updateDisplay(lastMouseY);
      
      if (scrollDirection) {
        autoScrollRef.current = requestAnimationFrame(scrollStep);
      }
    };

    const startAutoScroll = (direction: 'up' | 'down') => {
      if (scrollDirection === direction) return;
      scrollDirection = direction;
      if (!autoScrollRef.current) {
        autoScrollRef.current = requestAnimationFrame(scrollStep);
      }
    };

    const stopAutoScroll = () => {
      scrollDirection = null;
      if (autoScrollRef.current) {
        cancelAnimationFrame(autoScrollRef.current);
        autoScrollRef.current = null;
      }
    };

    // 检查事件块是否触碰到滚动容器边缘
    const checkAutoScroll = () => {
      if (!scrollContainer || !blockRef.current) return;
      
      const containerRect = scrollContainer.getBoundingClientRect();
      const blockRect = blockRef.current.getBoundingClientRect();
      
      // 事件块顶部触碰到容器顶部
      const blockTouchesTop = blockRect.top <= containerRect.top + AUTO_SCROLL_THRESHOLD;
      // 事件块底部触碰到容器底部
      const blockTouchesBottom = blockRect.bottom >= containerRect.bottom - AUTO_SCROLL_THRESHOLD;
      
      if (blockTouchesTop && scrollContainer.scrollTop > 0) {
        startAutoScroll('up');
      } else if (blockTouchesBottom && 
                 scrollContainer.scrollTop < scrollContainer.scrollHeight - scrollContainer.clientHeight) {
        startAutoScroll('down');
      } else {
        stopAutoScroll();
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      lastMouseY = e.clientY;
      updateDisplay(e.clientY);
      checkAutoScroll();
    };

    const handleScroll = () => {
      updateDisplay(lastMouseY);
      checkAutoScroll();
    };

    const handleMouseUp = () => {
      stopAutoScroll();
      // 确保最终状态同步到 store
      updateEvent(event.id, { startDate: currentTempTimes.start, endDate: currentTempTimes.end });
      setTempTimes(null);
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    scrollContainer?.addEventListener('scroll', handleScroll);

    return () => {
      stopAutoScroll();
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      scrollContainer?.removeEventListener('scroll', handleScroll);
    };
  }, [isDragging, dragStartY, originalTimes, event.id, updateEvent]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleClick = () => {
    if (isResizing || isDragging) return;
    if (resizeEdge) return;

    // 先关闭之前正在编辑的事件（如果是空标题会自动删除）
    if (editingEventId && editingEventId !== event.id) {
      closeEditingEvent();
    }
    
    // 单击同时选中并打开编辑面板（仅非 task 类型）
    setSelectedEventId(event.id);
    if (!isTask) {
      setEditingEventId(event.id);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isTask) return;

    e.preventDefault();
    e.stopPropagation();

    // 记录拖拽开始时的滚动位置
    const scrollContainer = getScrollContainer();
    startScrollTop.current = scrollContainer?.scrollTop || 0;

    setOriginalTimes({ start: event.startDate, end: event.endDate });

    if (resizeEdge) {
      // 边缘拖拽 - 调整时长
      setIsResizing(true);
      setResizeStartY(e.clientY);
    } else {
      // 中间拖拽 - 移动整个事件
      setIsDragging(true);
      setDragStartY(e.clientY);
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    if (!isResizing && !isDragging) {
      setResizeEdge(null);
    }
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  // 智能间距计算
  const positioning = useMemo(() => {
    if (!layout) {
      return {
        left: `${GAP}px`,
        width: `calc(100% - ${GAP * 2}px)`,
      };
    }

    const { leftPercent, widthPercent, totalColumns, column } = layout;
    const isFirstColumn = column === 0;
    const isLastColumn = column === totalColumns - 1;

    let leftOffset = GAP;
    let rightOffset = GAP;

    if (totalColumns > 1) {
      leftOffset = isFirstColumn ? GAP : GAP / 2;
      rightOffset = isLastColumn ? GAP : GAP / 2;
    }

    return {
      left: `calc(${leftPercent}% + ${leftOffset}px)`,
      width: `calc(${widthPercent}% - ${leftOffset + rightOffset}px)`,
    };
  }, [layout]);

  // 层级深度
  const depthStyles = useMemo(() => {
    const column = layout?.column || 0;
    const baseZ = column + 10;
    const z = isResizing || isDragging ? 200 : isActive ? 100 : isHovered ? 50 : baseZ;
    const shadowIntensity = Math.min(column * 0.5, 2);

    return { zIndex: z, shadowIntensity };
  }, [layout?.column, isActive, isHovered, isResizing, isDragging]);

  const isCompleted = isTask && event.originalTask?.completed;

  // 高度分级
  const heightLevel = useMemo(() => {
    if (height < 20) return 'micro';
    if (height < 32) return 'tiny';
    if (height < 48) return 'small';
    if (height < 80) return 'medium';
    return 'large';
  }, [height]);

  // 颜色系统
  const colorKey = event.color || 'blue';

  const colorSystem = useMemo(() => {
    const colors: Record<string, { bg: string; text: string; border: string; ring: string }> = {
      blue: {
        bg: 'bg-blue-50/90 dark:bg-blue-950/40',
        text: 'text-blue-700 dark:text-blue-200',
        border: 'border-blue-400 dark:border-blue-500',
        ring: 'ring-blue-300/50 dark:ring-blue-600/30',
      },
      red: {
        bg: 'bg-rose-50/90 dark:bg-rose-950/40',
        text: 'text-rose-700 dark:text-rose-200',
        border: 'border-rose-400 dark:border-rose-500',
        ring: 'ring-rose-300/50 dark:ring-rose-600/30',
      },
      green: {
        bg: 'bg-emerald-50/90 dark:bg-emerald-950/40',
        text: 'text-emerald-700 dark:text-emerald-200',
        border: 'border-emerald-400 dark:border-emerald-500',
        ring: 'ring-emerald-300/50 dark:ring-emerald-600/30',
      },
      yellow: {
        bg: 'bg-amber-50/90 dark:bg-amber-950/40',
        text: 'text-amber-700 dark:text-amber-200',
        border: 'border-amber-400 dark:border-amber-500',
        ring: 'ring-amber-300/50 dark:ring-amber-600/30',
      },
      purple: {
        bg: 'bg-violet-50/90 dark:bg-violet-950/40',
        text: 'text-violet-700 dark:text-violet-200',
        border: 'border-violet-400 dark:border-violet-500',
        ring: 'ring-violet-300/50 dark:ring-violet-600/30',
      },
      orange: {
        bg: 'bg-orange-50/90 dark:bg-orange-950/40',
        text: 'text-orange-700 dark:text-orange-200',
        border: 'border-orange-400 dark:border-orange-500',
        ring: 'ring-orange-300/50 dark:ring-orange-600/30',
      },
    };
    return colors[colorKey] || colors.blue;
  }, [colorKey]);

  // Task 使用统一颜色系统
  const taskColors = useMemo(() => {
    if (!isTask) return null;
    // 使用统一的 color 字段
    const color = event.color || 'default';

    const colorStyles: Record<string, { border: string; bg: string }> = {
      red: { border: 'border-l-rose-500', bg: 'bg-rose-50/50 dark:bg-rose-950/20' },
      yellow: { border: 'border-l-amber-400', bg: 'bg-amber-50/50 dark:bg-amber-950/20' },
      purple: { border: 'border-l-violet-500', bg: 'bg-violet-50/50 dark:bg-violet-950/20' },
      green: { border: 'border-l-emerald-500', bg: 'bg-emerald-50/50 dark:bg-emerald-950/20' },
      blue: { border: 'border-l-blue-500', bg: 'bg-blue-50/50 dark:bg-blue-950/20' },
      default: { border: 'border-l-zinc-400', bg: 'bg-white/90 dark:bg-zinc-900/90' },
    };

    return colorStyles[color] || colorStyles.default;
  }, [isTask, event.color]);

  // 动态阴影
  const shadowClass = useMemo(() => {
    if (isResizing || isDragging) return 'shadow-xl shadow-black/15 dark:shadow-black/40';
    if (isActive) return 'shadow-lg shadow-black/10 dark:shadow-black/30';
    if (isHovered) return 'shadow-md shadow-black/8 dark:shadow-black/25';
    const depth = depthStyles.shadowIntensity;
    if (depth > 1) return 'shadow-md shadow-black/6 dark:shadow-black/20';
    return 'shadow-sm shadow-black/5 dark:shadow-black/15';
  }, [isActive, isHovered, isResizing, isDragging, depthStyles.shadowIntensity]);

  // 光标样式
  // 光标样式：默认保持普通样式，只在边缘或拖拽时改变
  const cursorClass = useMemo(() => {
    if (isResizing) return 'cursor-row-resize';
    if (isDragging) return 'cursor-grabbing';
    if (resizeEdge && !isTask) return 'cursor-row-resize';
    // 默认使用普通光标，不使用 grab 手型
    return 'cursor-default';
  }, [resizeEdge, isResizing, isDragging, isTask]);

  const renderEventContent = () => {
    const showTime = heightLevel !== 'micro' && heightLevel !== 'tiny';
    const showEndTime = heightLevel === 'large' || heightLevel === 'medium';

    return (
      <div
        className={`
          w-full h-full flex flex-col justify-center
          border-l-[3px] ${colorSystem.border}
          ${colorSystem.bg}
          rounded-[5px]
          transition-shadow duration-200 ease-out
          ${shadowClass}
          ${isActive ? `ring-2 ${colorSystem.ring}` : ''}
          ${isSelected && !isActive ? 'ring-2 ring-blue-500/60 dark:ring-blue-400/50' : ''}
          ${isHovered && !isActive && !isSelected ? `ring-1 ${colorSystem.ring}` : ''}
        `}
      >
        <div className="px-2 py-1 min-w-0">
          <p
            className={`font-medium leading-tight truncate ${colorSystem.text} ${heightLevel === 'micro' ? 'text-[9px]' : 'text-[11px]'}`}
          >
            {event.title || '无标题'}
          </p>
          {showTime && (
            <p
              className={`mt-0.5 tabular-nums font-medium ${colorSystem.text} opacity-70 ${heightLevel === 'small' ? 'text-[8px]' : 'text-[9px]'}`}
            >
              {format(event.startDate, 'HH:mm')}
              {showEndTime && ` - ${format(event.endDate, 'HH:mm')}`}
            </p>
          )}
        </div>
      </div>
    );
  };

  const renderTaskContent = () => {
    const showTime = heightLevel !== 'micro' && heightLevel !== 'tiny';
    const showCheckbox = heightLevel !== 'micro';

    return (
      <div
        className={`
          w-full h-full flex flex-col
          border-l-[3px] ${taskColors?.border}
          ${taskColors?.bg}
          rounded-[5px]
          transition-shadow duration-200 ease-out
          ${shadowClass}
          ring-1 ring-inset ring-black/[0.04] dark:ring-white/[0.06]
          ${isActive ? 'ring-2 ring-blue-400/40 dark:ring-blue-500/30' : ''}
          ${isSelected && !isActive ? 'ring-2 ring-blue-500/60 dark:ring-blue-400/50' : ''}
          ${isHovered && !isActive && !isSelected ? 'ring-blue-300/30 dark:ring-blue-500/20' : ''}
        `}
        style={{ opacity: isCompleted ? 0.55 : 1 }}
      >
        <div className={`flex items-start gap-1.5 px-1.5 py-1 ${heightLevel === 'tiny' ? 'items-center' : ''}`}>
          {showCheckbox && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggle?.(event.id);
              }}
              className={`
                flex-shrink-0 w-3.5 h-3.5 rounded-[3px] border flex items-center justify-center transition-all duration-150
                ${
                  isCompleted
                    ? 'bg-zinc-400 border-zinc-400 dark:bg-zinc-500 dark:border-zinc-500'
                    : 'border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 hover:border-blue-400 dark:hover:border-blue-500'
                }
              `}
            >
              {isCompleted && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
            </button>
          )}
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <p
              className={`font-medium leading-tight truncate ${isCompleted ? 'line-through text-zinc-400 dark:text-zinc-500' : 'text-zinc-700 dark:text-zinc-200'} ${heightLevel === 'micro' ? 'text-[9px]' : 'text-[11px]'}`}
            >
              {event.title || '无标题'}
            </p>
            {showTime && (
              <p className="mt-0.5 text-[8px] text-zinc-400 dark:text-zinc-500 tabular-nums font-medium">
                {format(event.startDate, 'HH:mm')} - {format(event.endDate, 'HH:mm')}
              </p>
            )}
          </div>
        </div>
      </div>
    );
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
          zIndex: depthStyles.zIndex,
        }}
        className={`absolute ${cursorClass} select-none`}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onContextMenu={handleContextMenu}
      >
        {isTask ? renderTaskContent() : renderEventContent()}
      </div>

      {contextMenu && (
        <EventContextMenu
          eventId={event.id}
          position={contextMenu}
          currentColor={event.color}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}

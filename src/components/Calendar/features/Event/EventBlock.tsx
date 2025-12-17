import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { useCalendarStore, type CalendarEvent } from '@/stores/useCalendarStore';
import { Check } from 'lucide-react';
import { EventContextMenu } from './EventContextMenu';
import { type EventLayoutInfo } from '../../utils/eventLayout';

const HOUR_HEIGHT = 64;

// 间距常量 - 精确控制
const GAP = 3; // 事件之间的间距

interface EventBlockProps {
  event: CalendarEvent & { type?: 'event' | 'task'; originalTask?: any };
  onToggle?: (id: string) => void;
  layout?: EventLayoutInfo;
}

export function EventBlock({ event, onToggle, layout }: EventBlockProps) {
  const { setEditingEventId, editingEventId } = useCalendarStore();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  // 当前事件是否正在被编辑
  const isActive = editingEventId === event.id;

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleClick = () => {
    // 只有 Event 类型才打开编辑面板，Task 类型不打开
    if (event.type !== 'task') {
      setEditingEventId(event.id);
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  // 计算尺寸
  const durationInMinutes = (event.endDate - event.startDate) / (1000 * 60);
  const startHour = new Date(event.startDate).getHours();
  const startMinute = new Date(event.startDate).getMinutes();
  const top = startHour * HOUR_HEIGHT + (startMinute / 60) * HOUR_HEIGHT;
  const height = (durationInMinutes / 60) * HOUR_HEIGHT;

  // 智能间距计算
  const positioning = useMemo(() => {
    if (!layout) {
      return {
        left: `${GAP}px`,
        width: `calc(100% - ${GAP * 2}px)`,
      };
    }

    const { leftPercent, widthPercent, totalColumns, column } = layout;
    
    // 第一列左边有间距，最后一列右边有间距，中间列两边都有半间距
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

  // 层级深度带来的视觉效果
  const depthStyles = useMemo(() => {
    const column = layout?.column || 0;
    
    // 基础 z-index
    const baseZ = column + 10;
    const z = isActive ? 100 : isHovered ? 50 : baseZ;
    
    // 根据层级增加阴影深度
    const shadowIntensity = Math.min(column * 0.5, 2);
    
    return {
      zIndex: z,
      shadowIntensity,
    };
  }, [layout?.column, isActive, isHovered]);

  const isTask = event.type === 'task';
  const isCompleted = isTask && event.originalTask?.completed;

  // 高度分级 - 决定显示什么内容
  const heightLevel = useMemo(() => {
    if (height < 20) return 'micro';
    if (height < 32) return 'tiny';
    if (height < 48) return 'small';
    if (height < 80) return 'medium';
    return 'large';
  }, [height]);

  // 颜色系统 - 统一的设计语言
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

  // Task 的优先级颜色
  const taskColors = useMemo(() => {
    if (!isTask) return null;
    const priority = event.originalTask?.priority || 'default';
    
    const priorityColors: Record<string, { border: string; bg: string }> = {
      red: { border: 'border-l-rose-500', bg: 'bg-rose-50/50 dark:bg-rose-950/20' },
      yellow: { border: 'border-l-amber-400', bg: 'bg-amber-50/50 dark:bg-amber-950/20' },
      green: { border: 'border-l-emerald-500', bg: 'bg-emerald-50/50 dark:bg-emerald-950/20' },
      default: { border: 'border-l-blue-500', bg: 'bg-white/90 dark:bg-zinc-900/90' },
    };
    
    return priorityColors[priority] || priorityColors.default;
  }, [isTask, event.originalTask?.priority]);

  // 动态阴影
  const shadowClass = useMemo(() => {
    if (isActive) {
      return 'shadow-lg shadow-black/10 dark:shadow-black/30';
    }
    if (isHovered) {
      return 'shadow-md shadow-black/8 dark:shadow-black/25';
    }
    // 根据层级深度调整基础阴影
    const depth = depthStyles.shadowIntensity;
    if (depth > 1) {
      return 'shadow-md shadow-black/6 dark:shadow-black/20';
    }
    return 'shadow-sm shadow-black/5 dark:shadow-black/15';
  }, [isActive, isHovered, depthStyles.shadowIntensity]);

  // 渲染内容
  const renderContent = () => {
    if (isTask) {
      return renderTaskContent();
    }
    return renderEventContent();
  };

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
          transition-all duration-200 ease-out
          ${shadowClass}
          ${isActive ? `ring-2 ${colorSystem.ring}` : ''}
          ${isHovered && !isActive ? `ring-1 ${colorSystem.ring}` : ''}
        `}
      >
        <div className="px-2 py-1 min-w-0">
          <p
            className={`
              font-medium leading-tight truncate
              ${colorSystem.text}
              ${heightLevel === 'micro' ? 'text-[9px]' : 'text-[11px]'}
            `}
          >
            {event.title || '无标题'}
          </p>
          {showTime && (
            <p
              className={`
                mt-0.5 tabular-nums font-medium
                ${colorSystem.text} opacity-70
                ${heightLevel === 'small' ? 'text-[8px]' : 'text-[9px]'}
              `}
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
          transition-all duration-200 ease-out
          ${shadowClass}
          ring-1 ring-inset ring-black/[0.04] dark:ring-white/[0.06]
          ${isActive ? 'ring-2 ring-blue-400/40 dark:ring-blue-500/30' : ''}
          ${isHovered && !isActive ? 'ring-blue-300/30 dark:ring-blue-500/20' : ''}
        `}
        style={{
          opacity: isCompleted ? 0.55 : 1,
        }}
      >
        <div className={`flex items-start gap-1.5 px-1.5 py-1 ${heightLevel === 'tiny' ? 'items-center' : ''}`}>
          {showCheckbox && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggle?.(event.id);
              }}
              className={`
                flex-shrink-0 w-3.5 h-3.5 rounded-[3px] border
                flex items-center justify-center
                transition-all duration-150
                ${isCompleted
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
              className={`
                font-medium leading-tight truncate
                ${isCompleted ? 'line-through text-zinc-400 dark:text-zinc-500' : 'text-zinc-700 dark:text-zinc-200'}
                ${heightLevel === 'micro' ? 'text-[9px]' : 'text-[11px]'}
              `}
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
        style={{
          top: `${top}px`,
          height: `${Math.max(height, 18)}px`,
          left: positioning.left,
          width: positioning.width,
          zIndex: depthStyles.zIndex,
        }}
        className={`
          absolute cursor-pointer
          transition-transform duration-200 ease-out
          ${isHovered && !isActive ? 'scale-[1.01]' : ''}
          ${isActive ? 'scale-[1.02]' : ''}
        `}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onContextMenu={handleContextMenu}
      >
        {renderContent()}
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

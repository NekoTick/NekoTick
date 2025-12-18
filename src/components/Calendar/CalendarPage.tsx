import { useEffect, useState, useRef } from 'react';
import { format, startOfWeek, addDays, startOfDay, addMinutes } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { DndContext, DragOverlay, useSensor, useSensors, PointerSensor, DragEndEvent } from '@dnd-kit/core';

// Updated imports for the new modular structure
import { CalendarLayout } from './layout/CalendarLayout';
import { TimeGrid } from './features/Grid/TimeGrid';
import { DayGrid } from './features/Grid/DayGrid';
import { MonthGrid } from './features/Grid/MonthGrid';
import { MiniCalendar } from './features/Sidebar/MiniCalendar';
import { ContextPanel } from './features/ContextPanel/ContextPanel';
import { FloatingEventEditor } from './features/ContextPanel/FloatingEventEditor';
import { ViewSwitcher } from './features/ViewSwitcher';

import { useCalendarStore } from '@/stores/useCalendarStore';
import { useGroupStore } from '@/stores/useGroupStore';

const GUTTER_WIDTH = 60;
const SNAP_MINUTES = 15;
const MIN_HOUR_HEIGHT = 32;
const MAX_HOUR_HEIGHT = 800; // 最大可以让一个小时占满屏幕
const ZOOM_FACTOR = 1.15;

export function CalendarPage() {
  const { 
    load, selectedDate, addEvent, viewMode, showSidebar, showContextPanel, 
    hourHeight, setHourHeight, selectedEventId, setSelectedEventId, 
    deleteEvent, undo, editingEventId, editingEventPosition, closeEditingEvent, events
  } = useCalendarStore();
  const { updateTaskSchedule, updateTaskEstimation } = useGroupStore();
  const [activeDragItem, setActiveDragItem] = useState<any>(null);
  
  const hourHeightRef = useRef(hourHeight);
  hourHeightRef.current = hourHeight;
  
  // 获取正在编辑的事件
  const editingEvent = editingEventId ? events.find(e => e.id === editingEventId) : null;

  useEffect(() => {
    load();
  }, [load]);
  
  // 全局点击监听：点击非右侧编辑面板区域时，关闭空标题事件
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      if (!editingEventId) return;
      
      const target = e.target as HTMLElement;
      
      // 检查是否点击在右侧编辑面板内
      const contextPanel = target.closest('[data-context-panel]');
      if (contextPanel) return;
      
      // 检查是否点击在事件块上（事件块有自己的处理逻辑）
      const eventBlock = target.closest('.event-block');
      if (eventBlock) return;
      
      // 检查是否点击在右键菜单上（颜色选择、删除等操作）
      const eventContextMenu = target.closest('[data-event-context-menu]');
      if (eventContextMenu) return;
      
      // 点击其他地方，关闭编辑（空标题事件会自动删除）
      closeEditingEvent();
    };
    
    // 使用 mousedown 而不是 click，这样可以更早捕获
    document.addEventListener('mousedown', handleGlobalClick);
    return () => document.removeEventListener('mousedown', handleGlobalClick);
  }, [editingEventId, closeEditingEvent]);
  
  // 键盘快捷键：Backspace 删除选中事件，Ctrl+Z 撤销
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 如果正在编辑（输入框聚焦），不处理快捷键
      const activeElement = document.activeElement;
      if (activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA') {
        return;
      }
      
      // Ctrl+Z / Cmd+Z 撤销
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      
      // Backspace 或 Delete 删除选中的事件
      if ((e.key === 'Backspace' || e.key === 'Delete') && selectedEventId) {
        e.preventDefault();
        deleteEvent(selectedEventId);
        setSelectedEventId(null);
        return;
      }
      
      // Escape 取消选中
      if (e.key === 'Escape' && selectedEventId) {
        setSelectedEventId(null);
        return;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedEventId, editingEventId, deleteEvent, setSelectedEventId, undo]);
  
  // 窗口大小变化时，自动调整 hourHeight 以填满容器
  useEffect(() => {
    if (viewMode === 'month') return;
    
    const handleResize = () => {
      const scrollContainer = document.getElementById('time-grid-scroll');
      if (!scrollContainer) return;
      
      const containerHeight = scrollContainer.clientHeight;
      const minHourHeightForContainer = containerHeight / 24;
      const currentHourHeight = hourHeightRef.current;
      
      // 如果当前 hourHeight 小于容器需要的最小值，自动增加
      if (currentHourHeight < minHourHeightForContainer) {
        setHourHeight(minHourHeightForContainer);
      }
    };
    
    window.addEventListener('resize', handleResize);
    // 初始化时也检查一次
    setTimeout(handleResize, 100);
    
    return () => window.removeEventListener('resize', handleResize);
  }, [viewMode, setHourHeight]);
  
  // Ctrl+滚轮缩放时间刻度
  useEffect(() => {
    const handleZoomWheel = (e: WheelEvent) => {
      // 只使用 Ctrl/Meta 键触发缩放
      if (!e.ctrlKey && !e.metaKey) return;
      
      // 检查是否在日历网格区域内
      const gridContainer = document.getElementById('time-grid-container');
      if (!gridContainer || !gridContainer.contains(e.target as Node)) return;
      
      // 只在 day 或 week 视图下支持缩放（month 视图不需要）
      if (viewMode === 'month') return;
      
      e.preventDefault();
      e.stopPropagation();
      
      const scrollContainer = document.getElementById('time-grid-scroll');
      const currentHourHeight = hourHeightRef.current;
      
      // 动态计算最小 hourHeight，确保 24 小时刚好填满容器
      const containerHeight = scrollContainer?.clientHeight || 600;
      const dynamicMinHourHeight = Math.max(MIN_HOUR_HEIGHT, containerHeight / 24);
      
      // 计算新的 hourHeight
      const delta = e.deltaY > 0 ? -1 : 1;
      const newHourHeight = Math.max(
        dynamicMinHourHeight,
        Math.min(MAX_HOUR_HEIGHT, currentHourHeight * (delta > 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR))
      );
      
      if (Math.abs(newHourHeight - currentHourHeight) < 0.1) return;
      
      // 锚点缩放：保持鼠标指向的时间点不变
      if (scrollContainer) {
        const rect = scrollContainer.getBoundingClientRect();
        const mouseY = e.clientY - rect.top;
        const scrollTop = scrollContainer.scrollTop;
        const mouseTimePosition = scrollTop + mouseY;
        const mouseTimeHours = mouseTimePosition / currentHourHeight;
        const newMouseTimePosition = mouseTimeHours * newHourHeight;
        const newScrollTop = newMouseTimePosition - mouseY;
        
        requestAnimationFrame(() => {
          scrollContainer.scrollTop = Math.max(0, newScrollTop);
        });
      }
      
      setHourHeight(newHourHeight);
    };

    document.addEventListener('wheel', handleZoomWheel, { passive: false, capture: true });
    return () => {
      document.removeEventListener('wheel', handleZoomWheel, { capture: true });
    };
  }, [setHourHeight, viewMode]);
  
  // 使用动态的 hourHeight
  const HOUR_HEIGHT = hourHeight;

  // Navigation is now handled by ViewSwitcher component

  // Sensors for DnD
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 }, 
    })
  );

  const handleDragStart = (event: any) => {
    setActiveDragItem(event.active.data.current?.task);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active } = event;
    setActiveDragItem(null);

    const gridContainer = document.getElementById('time-grid-container');
    if (!gridContainer) return;

    const rect = gridContainer.getBoundingClientRect();
    const dropRect = event.active.rect.current.translated;
    if (!dropRect) return;

    const x = dropRect.left + 20; 
    const y = dropRect.top + 20;

    if (
      x >= rect.left && 
      x <= rect.right && 
      y >= rect.top && 
      y <= rect.bottom
    ) {
      // 1. Calculate Day
      const relativeX = x - rect.left - GUTTER_WIDTH;
      if (relativeX < 0) return; 

      const dayWidth = (rect.width - GUTTER_WIDTH) / 7;
      const dayIndex = Math.floor(relativeX / dayWidth);
      if (dayIndex < 0 || dayIndex > 6) return;

      // 2. Calculate Time
      const scrollContainer = document.getElementById('time-grid-scroll');
      const scrollTop = scrollContainer?.scrollTop || 0;
      
      const relativeY = y - rect.top + scrollTop;
      const totalMinutes = (relativeY / HOUR_HEIGHT) * 60;
      const snappedMinutes = Math.round(totalMinutes / SNAP_MINUTES) * SNAP_MINUTES;

      // 3. Determine Date
      const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
      const dayDate = addDays(weekStart, dayIndex);
      const startDate = addMinutes(startOfDay(dayDate), snappedMinutes);
      
      // 4. Handle Action
      const task = active.data.current?.task;

      if (task) {
        updateTaskSchedule(task.id, startDate.getTime().toString());
        // Only update estimation if it was default/fallback, otherwise keep original or update if needed
        // For simplicity, we just ensure schedule is set. Estimation update is optional here.
        if (!task.estimatedMinutes) {
           updateTaskEstimation(task.id, 60);
        }
        console.log('[Calendar] Scheduled Task:', task.title, 'at', startDate);
      } else {
        const endDate = addMinutes(startDate, 60);
        addEvent({
          title: 'New Event',
          startDate: startDate.getTime(),
          endDate: endDate.getTime(),
          isAllDay: false,
          color: 'blue',
        });
      }
    }
  };

  return (
    <DndContext 
      sensors={sensors} 
      onDragStart={handleDragStart} 
      onDragEnd={handleDragEnd}
    >
      <CalendarLayout
        sidebar={
          <div className="p-4">
            <MiniCalendar />
          </div>
        }
        main={
          <div className="flex h-full flex-col">
            {/* Header Toolbar */}
            <div className="h-12 flex items-center px-4 justify-between bg-white dark:bg-zinc-950 relative backdrop-blur-md bg-opacity-80" style={{ zIndex: 100 }}>
               <h2 className="text-lg font-semibold tracking-tight">
                 {format(selectedDate, 'yyyy年M月', { locale: zhCN })}
               </h2>
               
               <ViewSwitcher />
            </div>
            
            {/* The Core Grid - switches based on viewMode */}
            <div className="flex-1 min-h-0 relative" id="time-grid-container">
               {viewMode === 'day' && <DayGrid />}
               {viewMode === 'week' && <TimeGrid />}
               {viewMode === 'month' && <MonthGrid />}
            </div>
          </div>
        }
        contextPanel={<ContextPanel />}
        showSidebar={showSidebar}
        showContextPanel={showContextPanel}
      />

      <DragOverlay dropAnimation={null}>
        {activeDragItem ? (
           <div className="px-3 py-2 bg-white dark:bg-zinc-800 rounded-lg shadow-xl ring-1 ring-black/5 dark:ring-white/10 max-w-[200px] rotate-1">
              <span className="text-[13px] text-zinc-700 dark:text-zinc-200 line-clamp-2">
                {activeDragItem.content}
              </span>
           </div>
        ) : null}
      </DragOverlay>
      
      {/* 浮动编辑器 - 当右侧面板隐藏且有编辑事件时显示 */}
      {!showContextPanel && editingEvent && (
        <FloatingEventEditor 
          event={editingEvent} 
          position={editingEventPosition || undefined}
        />
      )}
    </DndContext>
  );
}
/**
 * 日历交互上下文
 * 
 * 统一管理所有拖动、调整大小、创建事件的状态
 * 这是解决布局同步问题的核心
 */

import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';
import { startOfDay, addMinutes } from 'date-fns';
import { useCalendarStore } from '@/stores/useCalendarStore';
import { getSnapMinutes, CALENDAR_CONSTANTS } from '../utils/timeUtils';

// ============ 类型定义 ============

export type InteractionType = 'idle' | 'creating' | 'moving' | 'resizing';
export type ResizeEdge = 'top' | 'bottom';

interface CreateState {
  dayIndex: number;
  startMinutes: number;
  endMinutes: number;
}

interface MoveState {
  eventId: string;
  originalStart: number;
  originalEnd: number;
  currentStart: number;
  currentEnd: number;
}

interface ResizeState {
  eventId: string;
  edge: ResizeEdge;
  originalStart: number;
  originalEnd: number;
  currentStart: number;
  currentEnd: number;
}

interface InteractionState {
  type: InteractionType;
  create: CreateState | null;
  move: MoveState | null;
  resize: ResizeState | null;
}

interface CalendarInteractionContextValue {
  // 状态
  state: InteractionState;
  
  // 创建事件
  startCreate: (dayIndex: number, minutes: number) => void;
  updateCreate: (minutes: number) => void;
  finishCreate: (days: Date[]) => string | null;
  cancelCreate: () => void;
  
  // 移动事件
  startMove: (eventId: string, startDate: number, endDate: number) => void;
  updateMove: (deltaMinutes: number) => void;
  finishMove: () => void;
  cancelMove: () => void;
  
  // 调整大小
  startResize: (eventId: string, edge: ResizeEdge, startDate: number, endDate: number) => void;
  updateResize: (deltaMinutes: number) => void;
  finishResize: () => void;
  cancelResize: () => void;
  
  // 获取事件的临时时间（用于布局计算）
  getEventTempTimes: (eventId: string) => { start: number; end: number } | null;
  
  // 获取正在创建的虚拟事件
  getGhostEvent: () => { startMinutes: number; endMinutes: number; dayIndex: number } | null;
}

// ============ Context ============

const CalendarInteractionContext = createContext<CalendarInteractionContextValue | null>(null);

// ============ Provider ============

interface CalendarInteractionProviderProps {
  children: ReactNode;
  hourHeight: number;
}

export function CalendarInteractionProvider({ children, hourHeight }: CalendarInteractionProviderProps) {
  const { addEvent, updateEvent } = useCalendarStore();
  const snapMinutes = getSnapMinutes(hourHeight);
  
  const [state, setState] = useState<InteractionState>({
    type: 'idle',
    create: null,
    move: null,
    resize: null,
  });
  
  // 使用 ref 存储最新状态，避免闭包问题
  const stateRef = useRef(state);
  stateRef.current = state;

  // ============ 创建事件 ============
  
  const startCreate = useCallback((dayIndex: number, minutes: number) => {
    const snapped = Math.round(minutes / snapMinutes) * snapMinutes;
    setState({
      type: 'creating',
      create: { dayIndex, startMinutes: snapped, endMinutes: snapped },
      move: null,
      resize: null,
    });
  }, [snapMinutes]);
  
  const updateCreate = useCallback((minutes: number) => {
    setState(prev => {
      if (prev.type !== 'creating' || !prev.create) return prev;
      const snapped = Math.round(minutes / snapMinutes) * snapMinutes;
      return {
        ...prev,
        create: { ...prev.create, endMinutes: snapped },
      };
    });
  }, [snapMinutes]);
  
  const finishCreate = useCallback((days: Date[]): string | null => {
    const current = stateRef.current;
    if (current.type !== 'creating' || !current.create) return null;
    
    const { dayIndex, startMinutes, endMinutes } = current.create;
    
    // 如果没有拖动距离，不创建
    if (startMinutes === endMinutes) {
      setState({ type: 'idle', create: null, move: null, resize: null });
      return null;
    }
    
    const dayDate = days[dayIndex];
    const actualStart = Math.min(startMinutes, endMinutes);
    const actualEnd = Math.max(startMinutes, endMinutes);
    
    const startDate = addMinutes(startOfDay(dayDate), actualStart);
    const endDate = addMinutes(startOfDay(dayDate), actualEnd);
    
    const newEventId = addEvent({
      title: '',
      startDate: startDate.getTime(),
      endDate: endDate.getTime(),
      isAllDay: false,
      color: 'blue',
    });
    
    setState({ type: 'idle', create: null, move: null, resize: null });
    return newEventId;
  }, [addEvent]);
  
  const cancelCreate = useCallback(() => {
    setState({ type: 'idle', create: null, move: null, resize: null });
  }, []);

  // ============ 移动事件 ============
  
  const startMove = useCallback((eventId: string, startDate: number, endDate: number) => {
    setState({
      type: 'moving',
      create: null,
      move: {
        eventId,
        originalStart: startDate,
        originalEnd: endDate,
        currentStart: startDate,
        currentEnd: endDate,
      },
      resize: null,
    });
  }, []);
  
  const updateMove = useCallback((deltaMinutes: number) => {
    setState(prev => {
      if (prev.type !== 'moving' || !prev.move) return prev;
      
      const snapped = Math.round(deltaMinutes / snapMinutes) * snapMinutes;
      const deltaMs = snapped * 60 * 1000;
      
      const newStart = prev.move.originalStart + deltaMs;
      const newEnd = prev.move.originalEnd + deltaMs;
      
      // 边界检查：不能超出当天
      const startOfDayMs = new Date(prev.move.originalStart).setHours(0, 0, 0, 0);
      const endOfDayMs = startOfDayMs + 24 * 60 * 60 * 1000;
      
      if (newStart < startOfDayMs || newEnd > endOfDayMs) {
        return prev;
      }
      
      // 实时更新 store
      updateEvent(prev.move.eventId, { startDate: newStart, endDate: newEnd });
      
      return {
        ...prev,
        move: { ...prev.move, currentStart: newStart, currentEnd: newEnd },
      };
    });
  }, [snapMinutes, updateEvent]);
  
  const finishMove = useCallback(() => {
    const current = stateRef.current;
    if (current.type !== 'moving' || !current.move) return;
    
    // 确保最终状态同步
    updateEvent(current.move.eventId, {
      startDate: current.move.currentStart,
      endDate: current.move.currentEnd,
    });
    
    setState({ type: 'idle', create: null, move: null, resize: null });
  }, [updateEvent]);
  
  const cancelMove = useCallback(() => {
    const current = stateRef.current;
    if (current.type !== 'moving' || !current.move) return;
    
    // 恢复原始位置
    updateEvent(current.move.eventId, {
      startDate: current.move.originalStart,
      endDate: current.move.originalEnd,
    });
    
    setState({ type: 'idle', create: null, move: null, resize: null });
  }, [updateEvent]);

  // ============ 调整大小 ============
  
  const startResize = useCallback((eventId: string, edge: ResizeEdge, startDate: number, endDate: number) => {
    setState({
      type: 'resizing',
      create: null,
      move: null,
      resize: {
        eventId,
        edge,
        originalStart: startDate,
        originalEnd: endDate,
        currentStart: startDate,
        currentEnd: endDate,
      },
    });
  }, []);
  
  const updateResize = useCallback((deltaMinutes: number) => {
    setState(prev => {
      if (prev.type !== 'resizing' || !prev.resize) return prev;
      
      const snapped = Math.round(deltaMinutes / snapMinutes) * snapMinutes;
      const deltaMs = snapped * 60 * 1000;
      const minDuration = Math.max(snapMinutes, CALENDAR_CONSTANTS.MIN_EVENT_DURATION_MINUTES) * 60 * 1000;
      
      let newStart = prev.resize.currentStart;
      let newEnd = prev.resize.currentEnd;
      
      if (prev.resize.edge === 'top') {
        newStart = prev.resize.originalStart + deltaMs;
        if (newStart >= prev.resize.originalEnd - minDuration) {
          return prev;
        }
        updateEvent(prev.resize.eventId, { startDate: newStart });
      } else {
        newEnd = prev.resize.originalEnd + deltaMs;
        if (newEnd <= prev.resize.originalStart + minDuration) {
          return prev;
        }
        updateEvent(prev.resize.eventId, { endDate: newEnd });
      }
      
      return {
        ...prev,
        resize: { ...prev.resize, currentStart: newStart, currentEnd: newEnd },
      };
    });
  }, [snapMinutes, updateEvent]);
  
  const finishResize = useCallback(() => {
    const current = stateRef.current;
    if (current.type !== 'resizing' || !current.resize) return;
    
    if (current.resize.edge === 'top') {
      updateEvent(current.resize.eventId, { startDate: current.resize.currentStart });
    } else {
      updateEvent(current.resize.eventId, { endDate: current.resize.currentEnd });
    }
    
    setState({ type: 'idle', create: null, move: null, resize: null });
  }, [updateEvent]);
  
  const cancelResize = useCallback(() => {
    const current = stateRef.current;
    if (current.type !== 'resizing' || !current.resize) return;
    
    updateEvent(current.resize.eventId, {
      startDate: current.resize.originalStart,
      endDate: current.resize.originalEnd,
    });
    
    setState({ type: 'idle', create: null, move: null, resize: null });
  }, [updateEvent]);

  // ============ 辅助方法 ============
  
  const getEventTempTimes = useCallback((eventId: string) => {
    const current = stateRef.current;
    
    if (current.type === 'moving' && current.move?.eventId === eventId) {
      return { start: current.move.currentStart, end: current.move.currentEnd };
    }
    
    if (current.type === 'resizing' && current.resize?.eventId === eventId) {
      return { start: current.resize.currentStart, end: current.resize.currentEnd };
    }
    
    return null;
  }, []);
  
  const getGhostEvent = useCallback(() => {
    const current = stateRef.current;
    
    if (current.type === 'creating' && current.create) {
      const { startMinutes, endMinutes, dayIndex } = current.create;
      if (startMinutes !== endMinutes) {
        return {
          startMinutes: Math.min(startMinutes, endMinutes),
          endMinutes: Math.max(startMinutes, endMinutes),
          dayIndex,
        };
      }
    }
    
    return null;
  }, []);

  const value: CalendarInteractionContextValue = {
    state,
    startCreate,
    updateCreate,
    finishCreate,
    cancelCreate,
    startMove,
    updateMove,
    finishMove,
    cancelMove,
    startResize,
    updateResize,
    finishResize,
    cancelResize,
    getEventTempTimes,
    getGhostEvent,
  };

  return (
    <CalendarInteractionContext.Provider value={value}>
      {children}
    </CalendarInteractionContext.Provider>
  );
}

// ============ Hook ============

export function useCalendarInteraction() {
  const context = useContext(CalendarInteractionContext);
  if (!context) {
    throw new Error('useCalendarInteraction must be used within CalendarInteractionProvider');
  }
  return context;
}

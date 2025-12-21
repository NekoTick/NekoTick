/**
 * usePanelDragAndDrop - 面板内的拖拽逻辑
 */

import { useState, useCallback, useRef } from 'react';
import {
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  type DragStartEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragEndEvent,
  type CollisionDetection,
  pointerWithin,
  rectIntersection,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type { Task } from '@/stores/useGroupStore';

interface UsePanelDragAndDropProps {
  tasks: Task[];
  reorderTasks: (activeId: string, overId: string, makeChild?: boolean) => void;
  updateTaskTime: (taskId: string, startDate?: number | null, endDate?: number | null) => void;
  toggleTask: (taskId: string) => void;
  setDraggingTaskId: (id: string | null) => void;
}

export function usePanelDragAndDrop({
  tasks,
  reorderTasks,
  updateTaskTime,
  toggleTask,
  setDraggingTaskId,
}: UsePanelDragAndDropProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [dragIndent, setDragIndent] = useState(0);
  const dragStartX = useRef<number>(0);

  // 传感器配置
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // 自定义碰撞检测
  const customCollisionDetection: CollisionDetection = useCallback((args) => {
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length > 0) {
      return pointerCollisions;
    }
    return rectIntersection(args);
  }, []);

  // 拖拽开始
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    setActiveId(active.id as string);
    setDraggingTaskId(active.id as string);
    
    // 记录起始 X 位置
    if (event.activatorEvent instanceof PointerEvent) {
      dragStartX.current = event.activatorEvent.clientX;
    }
  }, [setDraggingTaskId]);

  // 拖拽移动
  const handleDragMove = useCallback((event: DragMoveEvent) => {
    if (event.activatorEvent instanceof PointerEvent) {
      const currentX = event.activatorEvent.clientX;
      const deltaX = currentX - dragStartX.current;
      setDragIndent(Math.max(0, deltaX));
    }
  }, []);

  // 拖拽经过
  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { over } = event;
    setOverId(over?.id as string | null);
  }, []);

  // 拖拽结束
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    
    setActiveId(null);
    setOverId(null);
    setDragIndent(0);
    setDraggingTaskId(null);

    if (!over || active.id === over.id) return;

    const activeTask = tasks.find(t => t.id === active.id);
    if (!activeTask) return;

    const overId = over.id as string;
    
    // 处理拖到分割线上的情况
    if (overId === '__divider_scheduled__') {
      if (activeTask.startDate) {
        // 已分配的任务拖到分割线上 = 取消分配（移到待办）
        updateTaskTime(activeTask.id, null, null);
      } else if (!activeTask.completed) {
        // 待办任务拖到分割线上 = 设置时间（移到已分配）
        const startTime = Date.now();
        const endTime = startTime + 25 * 60 * 1000;
        updateTaskTime(activeTask.id, startTime, endTime);
      }
      return;
    }
    
    if (overId === '__divider_completed__') {
      // 拖到"已完成"分割线上 - 忽略，不改变状态
      return;
    }

    const overTask = tasks.find(t => t.id === over.id);
    if (!overTask) return;

    // 检查任务状态
    const activeIsScheduled = !!activeTask.startDate;
    const activeIsCompleted = activeTask.completed;
    const overIsScheduled = !!overTask.startDate;
    const overIsCompleted = overTask.completed;
    
    // 判断是否跨区域拖动
    const isCrossSection = (activeIsScheduled !== overIsScheduled) || (activeIsCompleted !== overIsCompleted);
    
    if (isCrossSection) {
      // 跨区域拖动：改变状态
      // 从已分配拖到待办（未分配且未完成）
      if (activeIsScheduled && !activeIsCompleted && !overIsScheduled && !overIsCompleted) {
        updateTaskTime(activeTask.id, null, null);
        return;
      }
      // 从待办拖到已分配，自动创建当前时间开始的 25 分钟任务
      if (!activeIsScheduled && !activeIsCompleted && overIsScheduled && !overIsCompleted) {
        const startTime = Date.now();
        const endTime = startTime + 25 * 60 * 1000;
        updateTaskTime(activeTask.id, startTime, endTime);
        return;
      }
      // 从已分配拖到已完成 - 标记完成并清除时间
      if (activeIsScheduled && !activeIsCompleted && overIsCompleted) {
        updateTaskTime(activeTask.id, null, null);
        toggleTask(activeTask.id);
        return;
      }
      // 从待办拖到已完成 - 标记完成
      if (!activeIsScheduled && !activeIsCompleted && overIsCompleted) {
        toggleTask(activeTask.id);
        return;
      }
      // 从已完成拖到待办 - 取消完成
      if (activeIsCompleted && !overIsScheduled && !overIsCompleted) {
        toggleTask(activeTask.id);
        return;
      }
      // 从已完成拖到已分配 - 取消完成并设置时间
      if (activeIsCompleted && overIsScheduled && !overIsCompleted) {
        toggleTask(activeTask.id);
        const startTime = Date.now();
        const endTime = startTime + 25 * 60 * 1000;
        updateTaskTime(activeTask.id, startTime, endTime);
        return;
      }
      return;
    }

    // 同区域内排序
    const INDENT_THRESHOLD = 28;
    const makeChild = dragIndent > INDENT_THRESHOLD;
    reorderTasks(active.id as string, over.id as string, makeChild);
  }, [tasks, dragIndent, reorderTasks, updateTaskTime, toggleTask, setDraggingTaskId]);

  return {
    sensors,
    customCollisionDetection,
    activeId,
    overId,
    dragIndent,
    handleDragStart,
    handleDragMove,
    handleDragOver,
    handleDragEnd,
  };
}

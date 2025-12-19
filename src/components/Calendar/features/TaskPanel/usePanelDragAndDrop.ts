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
import type { Task, Group, ItemColor } from '@/stores/useGroupStore';

interface UsePanelDragAndDropProps {
  tasks: Task[];
  activeGroupId: string;
  groups: Group[];
  toggleCollapse: (taskId: string) => void;
  reorderTasks: (activeId: string, overId: string, makeChild?: boolean) => void;
  moveTaskToGroup: (taskId: string, groupId: string) => void;
  updateTaskColor: (taskId: string, color: ItemColor) => void;
  setDraggingTaskId: (id: string | null) => void;
}

export function usePanelDragAndDrop({
  tasks,
  activeGroupId: _activeGroupId,
  groups: _groups,
  toggleCollapse: _toggleCollapse,
  reorderTasks,
  moveTaskToGroup: _moveTaskToGroup,
  updateTaskColor: _updateTaskColor,
  setDraggingTaskId,
}: UsePanelDragAndDropProps) {
  // 保留这些参数以便后续扩展功能
  void _activeGroupId;
  void _groups;
  void _toggleCollapse;
  void _moveTaskToGroup;
  void _updateTaskColor;
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
    const overTask = tasks.find(t => t.id === over.id);

    if (!activeTask || !overTask) return;

    // 检查是否应该作为子任务
    const INDENT_THRESHOLD = 28;
    const makeChild = dragIndent > INDENT_THRESHOLD;

    reorderTasks(active.id as string, over.id as string, makeChild);
  }, [tasks, dragIndent, reorderTasks, setDraggingTaskId]);

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

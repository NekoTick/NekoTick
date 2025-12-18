import { useState, useCallback, useRef } from 'react';
import { flushSync } from 'react-dom';
import {
  closestCenter,
  pointerWithin,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragMoveEvent,
  DragOverEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useGroupStore } from '@/stores/useGroupStore';
import { UseDragAndDropOptions } from './types';
import { useTauriDragWindow } from './useTauriDragWindow';
import { 
  findTargetTaskByMouse, 
  determineParentTask, 
  isTaskDescendant, 
  calculateColorToInherit 
} from './dragUtils';

export function useDragLogic({
  tasks,
  activeGroupId,
  groups,
  toggleCollapse,
  reorderTasks,
  moveTaskToGroup,
  updateTaskColor,
  setDraggingTaskId,
}: UseDragAndDropOptions) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [dragIndent, setDragIndent] = useState(0);
  const originalGroupIdRef = useRef<string | null>(null);
  const currentMouseYRef = useRef<number>(0);

  const { createDragWindow, updateDragWindowPosition, destroyDragWindow } = useTauriDragWindow();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const customCollisionDetection = useCallback((args: any) => {
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length > 0) return pointerCollisions;
    return closestCenter(args);
  }, []);

  const handleDragStart = useCallback(async (event: DragStartEvent) => {
    const id = event.active.id as string;
    setActiveId(id);
    setDraggingTaskId(id);
    originalGroupIdRef.current = activeGroupId;
    
    const task = tasks.find(t => t.id === id);
    if (task) {
      await createDragWindow(task, event.activatorEvent as PointerEvent, tasks);
    }
  }, [tasks, activeGroupId, setDraggingTaskId, createDragWindow]);

  const handleDragMove = useCallback((event: DragMoveEvent) => {
    const rect = (event.activatorEvent as PointerEvent);
    const x = rect.screenX + (event.delta?.x || 0);
    const y = rect.screenY + (event.delta?.y || 0);
    updateDragWindowPosition(x, y);
    
    currentMouseYRef.current = rect.clientY + (event.delta?.y || 0);
    
    const { delta, over } = event;
    if (delta && over) {
      setDragIndent(delta.x);
      setOverId(over.id as string);
    }
  }, [updateDragWindowPosition]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    setOverId(event.over?.id as string | null);
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    const taskId = active.id as string;
    const originalGroupId = originalGroupIdRef.current;
    
    // Check indentation for becoming a child
    const INDENT_THRESHOLD = 28;
    const shouldBecomeChild = dragIndent > INDENT_THRESHOLD && over;
    
    if (shouldBecomeChild) {
      const draggedTask = tasks.find(t => t.id === taskId);
      
      // Find target task
      const mouseY = currentMouseYRef.current;
      const targetTask = findTargetTaskByMouse(mouseY, active.id as string, tasks);
      const collisionTask = tasks.find(t => t.id === over.id);
      const overTask = targetTask || collisionTask;
      
      if (draggedTask && overTask && 
          draggedTask.completed === overTask.completed &&
          draggedTask.groupId === overTask.groupId) {
        
        const parentTask = determineParentTask(
          draggedTask, 
          overTask, 
          active.id as string, 
          over.id as string, 
          activeGroupId as string, 
          tasks
        );
        
        if (parentTask) {
          if (parentTask.collapsed) toggleCollapse(parentTask.id);
          
          if (!isTaskDescendant(tasks, taskId, parentTask.id)) {
            // Apply hierarchy change via store action (auto-persists)
            const siblings = tasks.filter(t => t.parentId === parentTask.id && t.id !== taskId);
            const newOrder = siblings.length;
            
            flushSync(() => {
              useGroupStore.getState().updateTaskParent(taskId, parentTask.id, newOrder);
            });
            
            // Cleanup
            setActiveId(null);
            setOverId(null);
            setDragIndent(0);
            setDraggingTaskId(null);
            originalGroupIdRef.current = null;
            destroyDragWindow();
            return;
          }
        }
      }
    }
    
    setDragIndent(0);
    
    // Cross-group or Reorder
    if (originalGroupId && activeGroupId && originalGroupId !== activeGroupId) {
      await moveTaskToGroup(taskId, activeGroupId, over?.id as string | null);
    } else if (over && active.id !== over.id) {
      const draggedTask = tasks.find(t => t.id === taskId);
      const targetTask = tasks.find(t => t.id === over.id);
      
      if (draggedTask && targetTask) {
        // Same status reorder
        reorderTasks(taskId, over.id as string);
        
        // Color Inheritance
        const color = calculateColorToInherit(draggedTask, targetTask, activeGroupId, tasks, over.id as string);
        if (color && color !== draggedTask.color) {
          updateTaskColor(taskId, color);
        }
      }
    }
    
    // Cleanup
    setActiveId(null);
    setOverId(null);
    setDragIndent(0);
    originalGroupIdRef.current = null;
    destroyDragWindow();
    
    setTimeout(() => {
      setDraggingTaskId(null);
    }, 50);

  }, [
    tasks, groups, activeGroupId, dragIndent,
    toggleCollapse, moveTaskToGroup, reorderTasks, updateTaskColor, setDraggingTaskId, destroyDragWindow
  ]);

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

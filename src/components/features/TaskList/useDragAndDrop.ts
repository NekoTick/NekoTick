import { useState, useCallback, useRef } from 'react';
import { flushSync } from 'react-dom';
import {
  closestCenter,
  pointerWithin,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type DragMoveEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { invoke } from '@tauri-apps/api/core';
import { useGroupStore, type Priority, type StoreTask } from '@/stores/useGroupStore';

// Update position without awaiting result for smoother animation
const updatePositionFast = (x: number, y: number) => {
  invoke('update_drag_window_position', { x, y }).catch(() => {});
};

// Priority order: red (0) > yellow (1) > purple (2) > green (3) > default (4)
const priorityOrder = { red: 0, yellow: 1, purple: 2, green: 3, default: 4 };

interface UseDragAndDropOptions {
  tasks: StoreTask[];
  activeGroupId: string | null;
  groups: { id: string; name: string; createdAt: number; pinned?: boolean }[];
  toggleCollapse: (taskId: string) => void;
  reorderTasks: (taskId: string, targetId: string) => void;
  crossStatusReorder: (taskId: string, targetId: string) => void;
  moveTaskToGroup: (taskId: string, groupId: string, targetId: string | null) => Promise<void>;
  updateTaskPriority: (taskId: string, priority: Priority) => void;
  setDraggingTaskId: (id: string | null) => void;
}

export function useDragAndDrop({
  tasks,
  activeGroupId,
  groups,
  toggleCollapse,
  reorderTasks,
  crossStatusReorder,
  moveTaskToGroup,
  updateTaskPriority,
  setDraggingTaskId,
}: UseDragAndDropOptions) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [dragIndent, setDragIndent] = useState(0);
  const originalGroupIdRef = useRef<string | null>(null);
  const currentMouseYRef = useRef<number>(0);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Custom collision detection: prefer pointerWithin, fallback to closestCenter
  const customCollisionDetection = useCallback((args: any) => {
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length > 0) {
      return pointerCollisions;
    }
    return closestCenter(args);
  }, []);

  const handleDragStart = useCallback(async (event: DragStartEvent) => {
    const id = event.active.id as string;
    setActiveId(id);
    setDraggingTaskId(id);
    originalGroupIdRef.current = activeGroupId;
    
    const task = tasks.find(t => t.id === id);
    if (task) {
      // Count all descendants recursively
      const countDescendants = (taskId: string): number => {
        const children = tasks.filter(t => t.parentId === taskId);
        if (children.length === 0) return 0;
        return children.length + children.reduce((sum, child) => sum + countDescendants(child.id), 0);
      };
      const childCount = countDescendants(task.id);
      
      // Get actual dimensions of the task element
      const taskElement = document.querySelector(`[data-task-id="${id}"]`);
      const rect = taskElement?.getBoundingClientRect();
      const width = rect?.width || 350;
      const height = rect?.height || 36;
      
      // Get mouse position and detect dark mode
      const pointer = (event.activatorEvent as PointerEvent);
      const isDarkMode = document.documentElement.classList.contains('dark');
      
      // Add child count indicator if task has children
      const displayContent = childCount > 0 
        ? `${task.content} (+${childCount})` 
        : task.content;
      
      try {
        await invoke('create_drag_window', {
          content: displayContent,
          x: pointer.screenX,
          y: pointer.screenY,
          width: width,
          height: height,
          isDone: task.completed,
          isDark: isDarkMode,
          priority: task.priority || 'default',
        });
      } catch (e) {
        console.error('Failed to create drag window:', e);
      }
    }
  }, [tasks, activeGroupId, setDraggingTaskId]);

  const handleDragMove = useCallback((event: DragMoveEvent) => {
    const rect = (event.activatorEvent as PointerEvent);
    const x = rect.screenX + (event.delta?.x || 0);
    const y = rect.screenY + (event.delta?.y || 0);
    updatePositionFast(x, y);
    
    // Save current mouse Y position (client coordinates)
    currentMouseYRef.current = rect.clientY + (event.delta?.y || 0);
    
    const { delta, over } = event;
    
    if (delta && over) {
      const horizontalOffset = delta.x;
      setDragIndent(horizontalOffset);
      setOverId(over.id as string);
    }
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    setOverId(event.over?.id as string | null);
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    const taskId = active.id as string;
    const originalGroupId = originalGroupIdRef.current;
    
    // Check if indent threshold is met to become a child
    const INDENT_THRESHOLD = 28;
    const shouldBecomeChild = dragIndent > INDENT_THRESHOLD && over;
    
    if (shouldBecomeChild) {
      // Dragged past threshold, try to become a child of another task
      const draggedTask = tasks.find(t => t.id === taskId);
      
      // Find target task using mouse position
      const mouseY = currentMouseYRef.current;
      const allTaskElements = document.querySelectorAll('[data-task-id]');
      let targetTaskId: string | null = null;
      let minDistance = Infinity;
      
      if (mouseY > 0) {
        allTaskElements.forEach(el => {
          const elTaskId = el.getAttribute('data-task-id');
          if (!elTaskId || elTaskId === active.id) return;
          
          const elRect = el.getBoundingClientRect();
          const taskCenterY = elRect.top + elRect.height / 2;
          const distance = Math.abs(mouseY - taskCenterY);
          
          if (mouseY >= elRect.top && mouseY <= elRect.bottom && distance < minDistance) {
            minDistance = distance;
            targetTaskId = elTaskId;
          }
        });
      }
      
      const collisionTask = tasks.find(t => t.id === over.id);
      const overTask = targetTaskId ? tasks.find(t => t.id === targetTaskId) : collisionTask;
      
      // Ensure same group and completion status for becoming a child
      if (draggedTask && overTask && 
          draggedTask.completed === overTask.completed &&
          draggedTask.groupId === overTask.groupId) {
        let parentTask;
        
        if (over.id === active.id) {
          // Dragged to own position: find previous top-level task as parent
          if (!draggedTask.parentId) {
            const topLevelTasks = tasks
              .filter(t => 
                t.groupId === activeGroupId && 
                !t.parentId && 
                t.completed === draggedTask.completed
              )
              .sort((a, b) => {
                const aPriority = priorityOrder[a.priority || 'default'];
                const bPriority = priorityOrder[b.priority || 'default'];
                if (aPriority !== bPriority) return aPriority - bPriority;
                return a.order - b.order;
              });
            const selfIndex = topLevelTasks.findIndex(t => t.id === taskId);
            parentTask = selfIndex > 0 ? topLevelTasks[selfIndex - 1] : null;
          } else {
            parentTask = null;
          }
        } else {
          // Dragged to another task: that task becomes the parent
          parentTask = overTask;
        }
        
        if (parentTask) {
          // Auto-expand collapsed parent
          if (parentTask.collapsed) {
            toggleCollapse(parentTask.id);
          }
          
          // Check target is not a descendant of dragged task
          const isDescendant = (ancestorId: string, descendantId: string): boolean => {
            const children = tasks.filter(t => t.parentId === ancestorId);
            if (children.some(c => c.id === descendantId)) return true;
            return children.some(c => isDescendant(c.id, descendantId));
          };
          
          if (!isDescendant(taskId, parentTask.id)) {
            // Calculate new order (become last child of parent)
            const siblings = tasks.filter(t => t.parentId === parentTask.id && t.id !== taskId);
            const newOrder = siblings.length;
            const oldParentId = draggedTask.parentId;
            
            // Use flushSync for synchronous state update
            flushSync(() => {
              useGroupStore.setState((state) => {
                const newTasks = state.tasks.map(t =>
                  t.id === taskId ? { ...t, parentId: parentTask.id, order: newOrder } : t
                );
                
                // Reorder siblings under old parent
                if (oldParentId !== parentTask.id) {
                  const oldSiblings = newTasks
                    .filter(t => t.parentId === oldParentId && t.id !== taskId)
                    .sort((a, b) => a.order - b.order);
                  
                  oldSiblings.forEach((t, i) => {
                    const task = newTasks.find(nt => nt.id === t.id);
                    if (task) task.order = i;
                  });
                }
                
                return { tasks: newTasks };
              });
            });
            
            // Persist changes
            try {
              const updatedTasks = useGroupStore.getState().tasks;
              const { saveGroup } = await import('@/lib/storage');
              const groupTasks = updatedTasks.filter(t => t.groupId === activeGroupId);
              const currentGroup = groups.find(g => g.id === activeGroupId);
              
              if (currentGroup && activeGroupId) {
                await saveGroup({
                  id: activeGroupId,
                  name: currentGroup.name,
                  createdAt: currentGroup.createdAt,
                  pinned: currentGroup.pinned || false,
                  updatedAt: Date.now(),
                  tasks: groupTasks.map(t => ({
                    id: t.id,
                    content: t.content,
                    completed: t.completed,
                    createdAt: t.createdAt,
                    completedAt: t.completedAt,
                    order: t.order,
                    parentId: t.parentId || null,
                    collapsed: t.collapsed,
                    priority: t.priority,
                    estimatedMinutes: t.estimatedMinutes,
                    actualMinutes: t.actualMinutes,
                  }))
                });
              }
            } catch (error) {
              console.error('Failed to save task parent change:', error);
            }
            
            // Clean up drag state
            setActiveId(null);
            setOverId(null);
            setDragIndent(0);
            setDraggingTaskId(null);
            originalGroupIdRef.current = null;
            
            try {
              await invoke('destroy_drag_window');
            } catch (e) {
              console.error('Failed to destroy drag window:', e);
            }
            
            return;
          }
        }
      }
    }
    
    // Reset indent state
    setDragIndent(0);
    
    // Check for cross-group move
    if (originalGroupId && activeGroupId && originalGroupId !== activeGroupId) {
      try {
        await moveTaskToGroup(taskId, activeGroupId, over?.id as string | null);
      } catch (error) {
        console.error('Failed to move task to group:', error);
      }
    } else if (over && active.id !== over.id) {
      const draggedTask = tasks.find(t => t.id === taskId);
      const targetTask = tasks.find(t => t.id === over.id);
      
      // Handle reordering
      if (draggedTask && targetTask && draggedTask.completed !== targetTask.completed) {
        // Cross-status drag
        crossStatusReorder(taskId, over.id as string);
      } else {
        // Same status reorder
        reorderTasks(taskId, over.id as string);
      }
      
      // Auto-adapt priority based on drop position
      if (draggedTask && targetTask && draggedTask.completed === targetTask.completed) {
        const groupTasks = tasks
          .filter(t => t.groupId === activeGroupId && !t.parentId && t.completed === targetTask.completed && t.id !== taskId)
          .sort((a, b) => {
            const aPriority = priorityOrder[a.priority || 'default'];
            const bPriority = priorityOrder[b.priority || 'default'];
            if (aPriority !== bPriority) return aPriority - bPriority;
            return a.order - b.order;
          });
        
        const targetIndex = groupTasks.findIndex(t => t.id === over.id);
        const taskAbove = targetIndex > 0 ? groupTasks[targetIndex - 1] : null;
        
        const abovePriority = (taskAbove?.priority || 'default') as string;
        const targetPriority = (targetTask.priority || 'default') as string;
        const draggedPriority = (draggedTask.priority || 'default') as string;
        
        let priorityToInherit: string | null = null;
        
        if (abovePriority !== 'default') {
          priorityToInherit = abovePriority;
        } else if (targetPriority !== 'default') {
          priorityToInherit = targetPriority;
        } else {
          priorityToInherit = 'default';
        }
        
        if (priorityToInherit && priorityToInherit !== draggedPriority) {
          updateTaskPriority(taskId, priorityToInherit as Priority);
        }
      }
    }
    
    // Clean up
    setActiveId(null);
    setOverId(null);
    setDragIndent(0);
    originalGroupIdRef.current = null;
    
    try {
      await invoke('destroy_drag_window');
    } catch (e) {
      // ignore
    }
    
    // Delay clearing draggingTaskId for cross-group handlers
    setTimeout(() => {
      setDraggingTaskId(null);
    }, 50);
  }, [reorderTasks, crossStatusReorder, setDraggingTaskId, activeGroupId, moveTaskToGroup, tasks, groups, dragIndent, updateTaskPriority, toggleCollapse]);

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

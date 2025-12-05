import { useState, useRef, useEffect, useCallback } from 'react';

interface UseCrossGroupDragOptions {
  activeGroupId: string | null;
  draggingTaskId: string | null;
  onSwitchGroup: (groupId: string) => Promise<void>;
  hoverDelay?: number;
}

interface UseCrossGroupDragReturn {
  hoveringGroupId: string | null;
  cachedDraggingTaskId: string | null;
  originalGroupId: string | null;
  handleGroupHoverStart: (groupId: string) => void;
  handleGroupHoverEnd: () => void;
}

/**
 * Hook for managing cross-group task drag state
 * Handles hover detection and delayed group switching during task drag
 */
export function useCrossGroupDrag({
  activeGroupId,
  draggingTaskId,
  onSwitchGroup,
  hoverDelay = 500,
}: UseCrossGroupDragOptions): UseCrossGroupDragReturn {
  const [hoveringGroupId, setHoveringGroupId] = useState<string | null>(null);
  
  // Refs to cache drag state
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cachedDraggingTaskIdRef = useRef<string | null>(null);
  const originalGroupIdRef = useRef<string | null>(null);
  const prevDraggingTaskIdRef = useRef<string | null>(null);

  // Cache draggingTaskId and original groupId when drag starts
  useEffect(() => {
    if (draggingTaskId && !prevDraggingTaskIdRef.current) {
      cachedDraggingTaskIdRef.current = draggingTaskId;
      originalGroupIdRef.current = activeGroupId;
    }
    prevDraggingTaskIdRef.current = draggingTaskId;
  }, [draggingTaskId, activeGroupId]);

  // Clear hover state and cached refs when drag ends
  useEffect(() => {
    let cleanupTimeoutId: ReturnType<typeof setTimeout> | null = null;
    
    if (!draggingTaskId) {
      setHoveringGroupId(null);
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
      // Delay clearing cached refs to allow drop handlers to access them
      cleanupTimeoutId = setTimeout(() => {
        cachedDraggingTaskIdRef.current = null;
        originalGroupIdRef.current = null;
      }, 100);
    }
    
    return () => {
      if (cleanupTimeoutId) {
        clearTimeout(cleanupTimeoutId);
      }
    };
  }, [draggingTaskId]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  const handleGroupHoverStart = useCallback((groupId: string) => {
    if (!draggingTaskId || groupId === activeGroupId) return;
    
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    
    setHoveringGroupId(groupId);
    
    hoverTimeoutRef.current = setTimeout(async () => {
      if (draggingTaskId) {
        try {
          await onSwitchGroup(groupId);
        } catch (error) {
          console.error('Failed to switch group:', error);
        }
      }
    }, hoverDelay);
  }, [draggingTaskId, activeGroupId, onSwitchGroup, hoverDelay]);

  const handleGroupHoverEnd = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    setHoveringGroupId(null);
  }, []);

  return {
    hoveringGroupId,
    cachedDraggingTaskId: cachedDraggingTaskIdRef.current,
    originalGroupId: originalGroupIdRef.current,
    handleGroupHoverStart,
    handleGroupHoverEnd,
  };
}

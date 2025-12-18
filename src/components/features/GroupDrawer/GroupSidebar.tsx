import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Archive } from 'lucide-react';
import { useGroupStore, useUIStore } from '@/stores/useGroupStore';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

import { useResizableSidebar } from './useResizableSidebar';
import { useCrossGroupDrag } from './useCrossGroupDrag';
import { useGroupFilter } from './useGroupFilter';
import { GroupToolbar } from './GroupToolbar';
import { SortableGroupItem } from './SortableGroupItem';

const ARCHIVE_GROUP_ID = '__archive__';

/**
 * Sidebar for group management with search, sort, and drag-drop
 */
export function GroupSidebar() {
  // Store state
  const { 
    groups, 
    tasks,
    activeGroupId, 
    setActiveGroup, 
    addGroup,
    updateGroup,
    togglePin,
    reorderGroups,
    moveTaskToGroup,
  } = useGroupStore();
  
  const {
    drawerOpen,
    toggleDrawer,
    draggingTaskId,
    setSearchQuery: setGlobalSearchQuery,
  } = useUIStore();

  // Group editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  // Add group state
  const [isAdding, setIsAdding] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  // Cross-group drag hook
  const {
    hoveringGroupId,
    cachedDraggingTaskId,
    originalGroupId,
    handleGroupHoverStart,
    handleGroupHoverEnd,
  } = useCrossGroupDrag({
    activeGroupId,
    draggingTaskId,
    onSwitchGroup: setActiveGroup,
  });

  // Group filter hook
  const {
    isSearching,
    setIsSearching,
    searchQuery,
    setSearchQuery,
    searchGroupName,
    setSearchGroupName,
    searchTaskContent,
    setSearchTaskContent,
    sortBy,
    setSortBy,
    filteredGroups,
    groupIds,
  } = useGroupFilter({
    groups,
    tasks,
    onGlobalSearchChange: setGlobalSearchQuery,
  });

  // Resizable sidebar
  const allTexts = useMemo(() => {
    const texts = groups.map(g => g.name);
    if (editingName) texts.push(editingName);
    return texts;
  }, [groups, editingName]);

  const { 
    width: sidebarWidth, 
    isResizing, 
    containerRef: sidebarRef, 
    handleMouseDown,
    setWidth: setSidebarWidth,
  } = useResizableSidebar({
    initialWidth: 200,
    minWidth: 150,
    maxWidth: 400,
    texts: allTexts,
  });

  // Auto-adjust sidebar width when editing
  useEffect(() => {
    if (editingName && editInputRef.current) {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) return;
      
      context.font = '14px sans-serif';
      const textWidth = context.measureText(editingName).width;
      const requiredWidth = textWidth + 100;
      
      let minFromOthers = 150;
      groups.forEach(group => {
        if (group.id !== editingId) {
          const w = context.measureText(group.name).width + 100;
          if (w > minFromOthers) minFromOthers = w;
        }
      });
      
      const newWidth = Math.min(Math.max(requiredWidth, minFromOthers), 400);
      if (Math.abs(newWidth - sidebarWidth) > 1) {
        setSidebarWidth(newWidth);
      }
    }
  }, [editingName, editingId, groups, sidebarWidth, setSidebarWidth]);

  // Reset sidebar width when editing ends
  useEffect(() => {
    if (editingId === null) {
      const timeoutId = setTimeout(() => {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) return;
        
        context.font = '14px sans-serif';
        let minWidth = 150;
        groups.forEach(group => {
          const w = context.measureText(group.name).width + 100;
          if (w > minWidth) minWidth = w;
        });
        
        const newWidth = Math.min(minWidth, 400);
        if (Math.abs(newWidth - sidebarWidth) > 1) {
          setSidebarWidth(newWidth);
        }
      }, 0);
      return () => clearTimeout(timeoutId);
    }
  }, [editingId, groups, sidebarWidth, setSidebarWidth]);

  // Dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      reorderGroups(active.id as string, over.id as string);
    }
  }, [reorderGroups]);

  // Group actions
  const handleAddGroup = useCallback(() => {
    if (newGroupName.trim()) {
      addGroup(newGroupName.trim());
      setNewGroupName('');
      setIsAdding(false);
    }
  }, [newGroupName, addGroup]);

  const handleStartEdit = useCallback((id: string, name: string) => {
    setEditingId(id);
    setEditingName(name);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (editingId && editingName.trim()) {
      updateGroup(editingId, editingName.trim());
    }
    setEditingId(null);
    setEditingName('');
  }, [editingId, editingName, updateGroup]);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditingName('');
  }, []);

  const handleSelectGroup = useCallback((groupId: string) => {
    setActiveGroup(groupId);
  }, [setActiveGroup]);

  const handleTaskDrop = useCallback(async (targetGroupId: string) => {
    const taskId = draggingTaskId || cachedDraggingTaskId;
    if (taskId && originalGroupId && targetGroupId !== originalGroupId) {
      try {
        await moveTaskToGroup(taskId, targetGroupId);
      } catch (error) {
        console.error('Failed to move task:', error);
      }
    }
  }, [draggingTaskId, cachedDraggingTaskId, originalGroupId, moveTaskToGroup]);

  return (
    <div 
      ref={sidebarRef}
      style={{ width: drawerOpen ? sidebarWidth : 40 }}
      className="h-full bg-white dark:bg-zinc-900 shrink-0 flex transition-[width] duration-200 ease-in-out"
    >
      {/* Collapsed state */}
      <div 
        className={`h-full flex flex-col transition-opacity duration-200 ${
          drawerOpen ? 'opacity-0 w-0' : 'opacity-100 w-full'
        }`}
        style={{ minWidth: drawerOpen ? 0 : 40 }}
      >
        <div className="flex-1" />
        <div className="px-2 py-2">
          <button
            onClick={toggleDrawer}
            className="p-1.5 text-zinc-200 hover:text-zinc-400 dark:text-zinc-700 dark:hover:text-zinc-500 rounded-md transition-colors"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      {/* Expanded state */}
      <div 
        className={`flex-1 h-full flex flex-col transition-opacity duration-200 overflow-hidden ${
          drawerOpen ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ display: drawerOpen ? 'flex' : 'none' }}
      >
        {/* Toolbar */}
        <GroupToolbar
          isSearching={isSearching}
          setIsSearching={setIsSearching}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onGlobalSearchChange={setGlobalSearchQuery}
          isAdding={isAdding}
          setIsAdding={setIsAdding}
          newGroupName={newGroupName}
          sortBy={sortBy}
          setSortBy={setSortBy}
          searchGroupName={searchGroupName}
          setSearchGroupName={setSearchGroupName}
          searchTaskContent={searchTaskContent}
          setSearchTaskContent={setSearchTaskContent}
        />

        {/* Group list */}
        <div className="flex-1 overflow-y-auto py-1">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={groupIds} strategy={verticalListSortingStrategy}>
              {filteredGroups.map((group) => (
                <div
                  key={group.id}
                  onMouseEnter={() => handleGroupHoverStart(group.id)}
                  onMouseLeave={handleGroupHoverEnd}
                >
                  <SortableGroupItem
                    group={group}
                    isActive={activeGroupId === group.id}
                    isEditing={editingId === group.id}
                    editingName={editingName}
                    isDragTarget={draggingTaskId !== null && hoveringGroupId === group.id}
                    onSelect={() => handleSelectGroup(group.id)}
                    onStartEdit={() => handleStartEdit(group.id, group.name)}
                    onSaveEdit={handleSaveEdit}
                    onCancelEdit={handleCancelEdit}
                    onEditNameChange={setEditingName}
                    onTogglePin={() => togglePin(group.id)}
                    editInputRef={editingId === group.id ? editInputRef : undefined}
                    onTaskDrop={() => handleTaskDrop(group.id)}
                  />
                </div>
              ))}
            </SortableContext>
          </DndContext>

          {/* Add new group input */}
          {isAdding && (
            <div className="px-2 pb-2 shrink-0">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddGroup();
                    if (e.key === 'Escape') {
                      setIsAdding(false);
                      setNewGroupName('');
                    }
                  }}
                  placeholder="Group name"
                  autoFocus
                  className="flex-1 min-w-0 text-sm bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-md px-2 py-1.5 outline-none focus:border-zinc-400 dark:focus:border-zinc-500"
                />
              </div>
            </div>
          )}
        </div>
        
        {/* Bottom actions */}
        <div className="px-2 py-2 flex items-center justify-between">
          <button
            onClick={toggleDrawer}
            className="p-1.5 text-zinc-200 hover:text-zinc-400 dark:text-zinc-700 dark:hover:text-zinc-500 rounded-md transition-colors"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            onClick={() => handleSelectGroup(ARCHIVE_GROUP_ID)}
            className={`p-1.5 rounded-md transition-colors ${
              activeGroupId === ARCHIVE_GROUP_ID
                ? 'text-zinc-900 bg-zinc-100 dark:text-zinc-100 dark:bg-zinc-800'
                : 'text-zinc-200 hover:text-zinc-400 dark:text-zinc-700 dark:hover:text-zinc-500'
            }`}
            title="Archive"
          >
            <Archive className="size-4" />
          </button>
        </div>
      </div>
      
      {/* Resize handle */}
      {drawerOpen && (
        <div
          onMouseDown={handleMouseDown}
          className={`w-1 h-full shrink-0 cursor-col-resize hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors ${
            isResizing ? 'bg-zinc-400 dark:bg-zinc-500' : 'bg-zinc-200 dark:bg-zinc-700'
          }`}
        />
      )}
    </div>
  );
}

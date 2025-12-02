import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { X, Check, Search, SquarePen, ArrowUpDown, Pin, GripVertical, ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react';
import { useGroupStore } from '@/stores/useGroupStore';
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
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

type SortOption = 'none' | 'name-asc' | 'name-desc' | 'edited-desc' | 'edited-asc' | 'created-desc' | 'created-asc';

interface SortableGroupItemProps {
  group: { id: string; name: string; pinned?: boolean };
  isActive: boolean;
  isEditing: boolean;
  editingName: string;
  isDragTarget?: boolean;
  onSelect: () => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onEditNameChange: (name: string) => void;
  onTogglePin: () => void;
  onTaskDrop?: () => void;
  editInputRef?: React.RefObject<HTMLInputElement | null>;
}

function SortableGroupItem({
  group,
  isActive,
  isEditing,
  editingName,
  isDragTarget,
  onSelect,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onEditNameChange,
  onTogglePin,
  onTaskDrop,
  editInputRef,
}: SortableGroupItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: group.id });
  
  const [shouldCancelOnBlur, setShouldCancelOnBlur] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      onMouseUp={onTaskDrop}
      className={`group flex items-center gap-1 px-2 py-1.5 mx-2 rounded-md cursor-pointer transition-colors ${
        isDragTarget
          ? 'bg-blue-100 text-blue-700 ring-2 ring-blue-400'
          : isActive
            ? 'bg-zinc-100 text-zinc-900'
            : 'text-zinc-600 hover:bg-zinc-50'
      }`}
    >
      <div
        {...attributes}
        {...listeners}
        className="p-0.5 cursor-move opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-zinc-600"
      >
        <GripVertical className="size-3" />
      </div>
      {isEditing ? (
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <input
            ref={editInputRef}
            type="text"
            value={editingName}
            onChange={(e) => onEditNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setShouldCancelOnBlur(false);
                onSaveEdit();
              }
              if (e.key === 'Escape') {
                setShouldCancelOnBlur(true);
                onCancelEdit();
              }
            }}
            onBlur={() => {
              if (!shouldCancelOnBlur) {
                onSaveEdit();
              }
              setShouldCancelOnBlur(false);
            }}
            onClick={(e) => e.stopPropagation()}
            autoFocus
            className="flex-1 min-w-0 text-sm bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-md px-2 py-1 outline-none focus:border-zinc-400 dark:focus:border-zinc-500"
          />
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSaveEdit();
            }}
            className="p-0.5 rounded hover:bg-zinc-100"
          >
            <Check className="size-3.5 text-zinc-600" />
          </button>
        </div>
      ) : (
        <>
          <span
            onDoubleClick={(e) => {
              e.stopPropagation();
              onStartEdit();
            }}
            className="flex-1 text-sm whitespace-pre-wrap break-words"
          >
            {group.name}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin();
            }}
            className={`p-0.5 rounded transition-colors ${
              group.pinned 
                ? 'text-zinc-500' 
                : 'opacity-0 group-hover:opacity-100 text-zinc-200 hover:text-zinc-400'
            }`}
          >
            <Pin className={`size-3.5 transition-all duration-200 ${group.pinned ? 'rotate-0' : 'rotate-45'}`} />
          </button>
        </>
      )}
    </div>
  );
}

function IconButton({ 
  onClick, 
  active, 
  tooltip, 
  children 
}: { 
  onClick: () => void; 
  active?: boolean; 
  tooltip: string; 
  children: React.ReactNode;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const handleMouseEnter = () => {
    if (active) return;
    timeoutRef.current = setTimeout(() => {
      setShowTooltip(true);
    }, 2000);
  };
  
  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setShowTooltip(false);
  };
  
  const handleClick = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setShowTooltip(false);
    onClick();
  };

  return (
    <div className="relative">
      <button
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`p-1.5 rounded-md transition-colors ${
          active 
            ? 'text-zinc-400 bg-zinc-100 dark:text-zinc-500 dark:bg-zinc-800' 
            : 'text-zinc-200 hover:text-zinc-400 dark:text-zinc-700 dark:hover:text-zinc-500'
        }`}
      >
        {children}
      </button>
      {showTooltip && (
        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 px-2 py-1 text-white text-xs rounded-md whitespace-nowrap" style={{ zIndex: 99999, backgroundColor: '#18181B' }}>
          {tooltip}
          <div className="absolute left-1/2 -translate-x-1/2 bottom-full border-4 border-transparent" style={{ borderBottomColor: '#18181B' }} />
        </div>
      )}
    </div>
  );
}

function SortMenuItem({ 
  label, 
  value, 
  current, 
  onSelect, 
  onClose 
}: { 
  label: string; 
  value: SortOption; 
  current: SortOption; 
  onSelect: (v: SortOption) => void; 
  onClose: () => void;
}) {
  return (
    <button
      onClick={() => {
        onSelect(value);
        onClose();
      }}
      className={`w-full px-3 py-1.5 text-left text-sm transition-colors ${
        current === value 
          ? 'text-zinc-900 bg-zinc-100' 
          : 'text-zinc-600 hover:bg-zinc-50'
      }`}
    >
      {label}
    </button>
  );
}

export function GroupSidebar() {
  const { 
    groups, 
    tasks,
    activeGroupId, 
    drawerOpen,
    toggleDrawer,
    setActiveGroup, 
    addGroup,
    updateGroup,
    togglePin,
    reorderGroups,
    draggingTaskId,
    moveTaskToGroup,
    setSearchQuery: setGlobalSearchQuery,
  } = useGroupStore();
  
  const [hoveringGroupId, setHoveringGroupId] = useState<string | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cachedDraggingTaskIdRef = useRef<string | null>(null);
  const originalGroupIdRef = useRef<string | null>(null);
  const prevDraggingTaskIdRef = useRef<string | null>(null);

  // Cache draggingTaskId and original groupId when drag starts
  useEffect(() => {
    // Detect drag start: draggingTaskId changed from null to a value
    if (draggingTaskId && !prevDraggingTaskIdRef.current) {
      cachedDraggingTaskIdRef.current = draggingTaskId;
      originalGroupIdRef.current = activeGroupId;
    }
    prevDraggingTaskIdRef.current = draggingTaskId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingTaskId]); // activeGroupId intentionally excluded - only read on drag start

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  // Clear hover state when drag ends
  useEffect(() => {
    if (!draggingTaskId) {
      setHoveringGroupId(null);
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
      // Clear cached refs after a short delay
      setTimeout(() => {
        cachedDraggingTaskIdRef.current = null;
        originalGroupIdRef.current = null;
      }, 100);
    }
  }, [draggingTaskId]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      reorderGroups(active.id as string, over.id as string);
    }
  };
  
  const [isAdding, setIsAdding] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [sidebarWidth, setSidebarWidth] = useState(200);
  const [isResizing, setIsResizing] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showSearchOptions, setShowSearchOptions] = useState(false);
  const [searchGroupName, setSearchGroupName] = useState(true);
  const [searchTaskContent, setSearchTaskContent] = useState(true);
  const [sortBy, setSortBy] = useState<SortOption>('none');
  const sidebarRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const searchOptionsRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  // 关闭菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setShowSortMenu(false);
      }
      if (searchOptionsRef.current && !searchOptionsRef.current.contains(e.target as Node)) {
        setShowSearchOptions(false);
      }
    };
    if (showSortMenu || showSearchOptions) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSortMenu, showSearchOptions]);

  const handleMouseDown = useCallback(() => {
    setIsResizing(true);
  }, []);

  // Calculate minimum width based on longest group name
  const minSidebarWidth = useMemo(() => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return 150;
    
    context.font = '14px sans-serif'; // text-sm
    let maxWidth = 150; // default minimum
    
    // Check all group names
    groups.forEach(group => {
      const textWidth = context.measureText(group.name).width;
      const totalWidth = textWidth + 100; // padding + icons
      if (totalWidth > maxWidth) {
        maxWidth = totalWidth;
      }
    });
    
    // Check editing name
    if (editingName) {
      const textWidth = context.measureText(editingName).width;
      const totalWidth = textWidth + 100;
      if (totalWidth > maxWidth) {
        maxWidth = totalWidth;
      }
    }
    
    return Math.min(maxWidth, 400); // cap at 400
  }, [groups, editingName]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    const newWidth = Math.min(Math.max(e.clientX, minSidebarWidth), 400);
    setSidebarWidth(newWidth);
  }, [isResizing, minSidebarWidth]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  const handleAddGroup = () => {
    if (newGroupName.trim()) {
      addGroup(newGroupName.trim());
      setNewGroupName('');
      setIsAdding(false);
    }
  };

  const handleStartEdit = (id: string, name: string) => {
    setEditingId(id);
    setEditingName(name);
  };

  const handleSaveEdit = () => {
    if (editingId && editingName.trim()) {
      updateGroup(editingId, editingName.trim());
    }
    setEditingId(null);
    setEditingName('');
  };

  // Auto-adjust sidebar when editing name
  useEffect(() => {
    if (editingName && editInputRef.current) {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) return;
      
      context.font = '14px sans-serif';
      
      // Calculate required width for editing name
      const textWidth = context.measureText(editingName).width;
      const editingRequiredWidth = textWidth + 100; // padding + icons
      
      // Calculate minimum width based on other groups (excluding the one being edited)
      let minWidthFromOtherGroups = 150;
      groups.forEach(group => {
        if (group.id !== editingId) {
          const groupTextWidth = context.measureText(group.name).width;
          const groupRequiredWidth = groupTextWidth + 100;
          if (groupRequiredWidth > minWidthFromOtherGroups) {
            minWidthFromOtherGroups = groupRequiredWidth;
          }
        }
      });
      
      // Target width is the max of editing width and other groups' minimum width
      const targetWidth = Math.max(editingRequiredWidth, minWidthFromOtherGroups);
      const newWidth = Math.min(targetWidth, 400);
      
      // Update width (both expand and shrink)
      if (Math.abs(newWidth - sidebarWidth) > 1) { // Add threshold to prevent micro-adjustments
        setSidebarWidth(newWidth);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingName, editingId, groups]); // Remove sidebarWidth from deps to prevent infinite loop

  // Reset sidebar width when editing is cancelled or saved
  useEffect(() => {
    // When editingId becomes null (editing finished), recalculate width based on all groups
    if (editingId === null) {
      // Use setTimeout to ensure this runs after state updates
      const timeoutId = setTimeout(() => {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) return;
        
        context.font = '14px sans-serif';
        
        // Calculate minimum width based on all groups
        let minRequiredWidth = 150;
        groups.forEach(group => {
          const groupTextWidth = context.measureText(group.name).width;
          const groupRequiredWidth = groupTextWidth + 100;
          if (groupRequiredWidth > minRequiredWidth) {
            minRequiredWidth = groupRequiredWidth;
          }
        });
        
        const newWidth = Math.min(minRequiredWidth, 400);
        
        // Only update if significantly different to avoid unnecessary renders
        setSidebarWidth(prev => {
          if (Math.abs(newWidth - prev) > 1) {
            return newWidth;
          }
          return prev;
        });
      }, 0);
      
      return () => clearTimeout(timeoutId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId, groups]); // Remove sidebarWidth from deps to prevent infinite loop

  // 搜索过滤和排序
  const filteredGroups = useMemo(() => {
    // 先进行搜索过滤
    let result = groups;
    
    if (searchQuery.trim() && (searchGroupName || searchTaskContent)) {
      const query = searchQuery.toLowerCase();
      result = groups.filter(group => {
        // 搜索分组名
        if (searchGroupName && group.name.toLowerCase().includes(query)) {
          return true;
        }
        // 搜索任务内容
        if (searchTaskContent) {
          const groupTasks = tasks.filter(t => t.groupId === group.id);
          const hasMatchingTask = groupTasks.some(task => 
            task.content.toLowerCase().includes(query)
          );
          if (hasMatchingTask) {
            return true;
          }
        }
        return false;
      });
    }
    
    // 然后进行排序
    const sorted = [...result].sort((a, b) => {
      // 置顶的分组始终在前面
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      
      // 如果选择不排序，保持原有顺序（按 order 或索引）
      if (sortBy === 'none') {
        return 0;
      }
      
      // 对于非置顶的分组，按照选择的排序方式
      switch (sortBy) {
        case 'name-asc':
          return a.name.localeCompare(b.name, 'zh-CN');
        case 'name-desc':
          return b.name.localeCompare(a.name, 'zh-CN');
        case 'edited-desc':
          return (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt);
        case 'edited-asc':
          return (a.updatedAt || a.createdAt) - (b.updatedAt || b.createdAt);
        case 'created-desc':
          return b.createdAt - a.createdAt;
        case 'created-asc':
          return a.createdAt - b.createdAt;
        default:
          return 0;
      }
    });
    
    return sorted;
  }, [groups, tasks, searchQuery, searchGroupName, searchTaskContent, sortBy]);

  const groupIds = useMemo(() => filteredGroups.map(g => g.id), [filteredGroups]);

  return (
    <div 
      ref={sidebarRef}
      style={{ width: drawerOpen ? sidebarWidth : 40 }}
      className="h-full bg-white dark:bg-zinc-900 shrink-0 flex transition-[width] duration-200 ease-in-out"
    >
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
      <div 
        className={`flex-1 h-full flex flex-col transition-opacity duration-200 overflow-hidden ${
          drawerOpen ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ display: drawerOpen ? 'flex' : 'none' }}
      >
        {/* Toolbar */}
        <div className="flex items-center gap-1 px-3 pt-2 pb-1 shrink-0 relative z-50 overflow-visible">
          <IconButton onClick={() => setIsSearching(!isSearching)} active={isSearching} tooltip="搜索">
            <Search className="size-4" />
          </IconButton>
          <IconButton onClick={() => {
            if (isAdding && !newGroupName.trim()) {
              setIsAdding(false);
            } else {
              setIsAdding(true);
            }
          }} active={isAdding} tooltip="新建分组">
            <SquarePen className="size-4" />
          </IconButton>
          <div className="relative z-[100]" ref={sortMenuRef}>
            <IconButton onClick={() => setShowSortMenu(!showSortMenu)} active={showSortMenu} tooltip="排序">
              <ArrowUpDown className="size-4" />
            </IconButton>
            {showSortMenu && (
              <div className="fixed w-48 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl py-1" style={{ 
                zIndex: 9999,
                left: sortMenuRef.current?.getBoundingClientRect().left + 'px',
                top: (sortMenuRef.current?.getBoundingClientRect().bottom ?? 0) + 4 + 'px'
              }}>
                <SortMenuItem label="不排序" value="none" current={sortBy} onSelect={setSortBy} onClose={() => setShowSortMenu(false)} />
                <div className="h-px bg-zinc-200 dark:bg-zinc-700 my-1" />
                <SortMenuItem label="名称 (A-Z)" value="name-asc" current={sortBy} onSelect={setSortBy} onClose={() => setShowSortMenu(false)} />
                <SortMenuItem label="名称 (Z-A)" value="name-desc" current={sortBy} onSelect={setSortBy} onClose={() => setShowSortMenu(false)} />
                <div className="h-px bg-zinc-200 dark:bg-zinc-700 my-1" />
                <SortMenuItem label="编辑时间 (从新到旧)" value="edited-desc" current={sortBy} onSelect={setSortBy} onClose={() => setShowSortMenu(false)} />
                <SortMenuItem label="编辑时间 (从旧到新)" value="edited-asc" current={sortBy} onSelect={setSortBy} onClose={() => setShowSortMenu(false)} />
                <div className="h-px bg-zinc-200 dark:bg-zinc-700 my-1" />
                <SortMenuItem label="创建时间 (从新到旧)" value="created-desc" current={sortBy} onSelect={setSortBy} onClose={() => setShowSortMenu(false)} />
                <SortMenuItem label="创建时间 (从旧到新)" value="created-asc" current={sortBy} onSelect={setSortBy} onClose={() => setShowSortMenu(false)} />
              </div>
            )}
          </div>
        </div>

        {/* Search Input */}
        {isSearching && (
          <div className="px-2 pb-2 shrink-0">
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 border border-zinc-200 dark:border-zinc-700 rounded-md">
                <Search className="size-4 text-zinc-400 shrink-0" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setGlobalSearchQuery(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setIsSearching(false);
                      setSearchQuery('');
                      setGlobalSearchQuery('');
                    }
                  }}
                  placeholder="搜索..."
                  autoFocus
                  className="flex-1 min-w-0 text-sm bg-transparent outline-none placeholder:text-zinc-400"
                />
                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setGlobalSearchQuery('');
                      searchInputRef.current?.focus();
                    }}
                    className="p-0.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    <X className="size-4 text-zinc-400" />
                  </button>
                )}
              </div>
              <div className="relative shrink-0" ref={searchOptionsRef}>
<button
                  onClick={() => setShowSearchOptions(!showSearchOptions)}
                  className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  <SlidersHorizontal className="size-4 text-zinc-400" />
                </button>
                {showSearchOptions && (
                  <div className="absolute right-0 top-full mt-2 w-40 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-xl py-2 px-3 z-50">
                    <div className="space-y-2">
                      <label className="flex items-center justify-between cursor-pointer">
                        <span className="text-sm text-zinc-700 dark:text-zinc-300">搜索分组名</span>
                        <input
                          type="checkbox"
                          checked={searchGroupName}
                          onChange={(e) => setSearchGroupName(e.target.checked)}
                          className="w-9 h-5 appearance-none bg-zinc-200 dark:bg-zinc-700 rounded-full relative cursor-pointer transition-colors checked:bg-zinc-400 dark:checked:bg-zinc-500 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:bg-white after:rounded-full after:transition-transform checked:after:translate-x-4"
                        />
                      </label>
                      <label className="flex items-center justify-between cursor-pointer">
                        <span className="text-sm text-zinc-700 dark:text-zinc-300">搜索内容</span>
                        <input
                          type="checkbox"
                          checked={searchTaskContent}
                          onChange={(e) => setSearchTaskContent(e.target.checked)}
                          className="w-9 h-5 appearance-none bg-zinc-200 dark:bg-zinc-700 rounded-full relative cursor-pointer transition-colors checked:bg-zinc-400 dark:checked:bg-zinc-500 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:bg-white after:rounded-full after:transition-transform checked:after:translate-x-4"
                        />
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Group List */}
        <div className="flex-1 overflow-y-auto py-1">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={groupIds} strategy={verticalListSortingStrategy}>
              {filteredGroups.map((group) => (
                <div
                  key={group.id}
                  onMouseEnter={() => {
                    if (draggingTaskId && group.id !== activeGroupId) {
                      // Clear previous timeout
                      if (hoverTimeoutRef.current) {
                        clearTimeout(hoverTimeoutRef.current);
                      }
                      setHoveringGroupId(group.id);
                      // Auto switch after 500ms hover
                      hoverTimeoutRef.current = setTimeout(() => {
                        if (draggingTaskId) {
                          setActiveGroup(group.id);
                        }
                      }, 500);
                    }
                  }}
                  onMouseLeave={() => {
                    if (hoverTimeoutRef.current) {
                      clearTimeout(hoverTimeoutRef.current);
                    }
                    setHoveringGroupId(null);
                  }}
                >
                  <SortableGroupItem
                    group={group}
                    isActive={activeGroupId === group.id}
                    isEditing={editingId === group.id}
                    editingName={editingName}
                    isDragTarget={draggingTaskId !== null && hoveringGroupId === group.id}
                    onSelect={() => setActiveGroup(group.id)}
                    onStartEdit={() => handleStartEdit(group.id, group.name)}
                    onSaveEdit={handleSaveEdit}
                    onCancelEdit={() => setEditingId(null)}
                    onEditNameChange={setEditingName}
                    onTogglePin={() => togglePin(group.id)}
                    editInputRef={editingId === group.id ? editInputRef : undefined}
                    onTaskDrop={() => {
                      const taskId = draggingTaskId || cachedDraggingTaskIdRef.current;
                      const originalGroupId = originalGroupIdRef.current;
                      if (taskId && originalGroupId && group.id !== originalGroupId) {
                        moveTaskToGroup(taskId, group.id);
                      }
                    }}
                  />
                </div>
              ))}
            </SortableContext>
          </DndContext>

          {/* Add New Group Input */}
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
                  placeholder="分组名称"
                  autoFocus
                  className="flex-1 min-w-0 text-sm bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-md px-2 py-1.5 outline-none focus:border-zinc-400 dark:focus:border-zinc-500"
                />
              </div>
            </div>
          )}
        </div>
        
        {/* Collapse Button */}
        <div className="px-2 py-2">
          <button
            onClick={toggleDrawer}
            className="p-1.5 text-zinc-200 hover:text-zinc-400 dark:text-zinc-700 dark:hover:text-zinc-500 rounded-md transition-colors"
          >
            <ChevronLeft className="size-4" />
          </button>
        </div>
      </div>
      
      {/* Resize Handle */}
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

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { X, Check, Search, SquarePen, ArrowUpDown, Pin, GripVertical, ChevronLeft, ChevronRight } from 'lucide-react';
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

type SortOption = 'name-asc' | 'name-desc' | 'edited-desc' | 'edited-asc' | 'created-desc' | 'created-asc';

interface SortableGroupItemProps {
  group: { id: string; name: string; pinned?: boolean };
  isActive: boolean;
  isEditing: boolean;
  editingName: string;
  onSelect: () => void;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onEditNameChange: (name: string) => void;
  onTogglePin: () => void;
}

function SortableGroupItem({
  group,
  isActive,
  isEditing,
  editingName,
  onSelect,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onEditNameChange,
  onTogglePin,
}: SortableGroupItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: group.id });

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
      className={`group flex items-center gap-1 px-2 py-1.5 mx-2 rounded-md cursor-pointer transition-colors ${
        isActive
          ? 'bg-zinc-100 text-zinc-900'
          : 'text-zinc-600 hover:bg-zinc-50'
      }`}
    >
      <div
        {...attributes}
        {...listeners}
        className="p-0.5 cursor-grab opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-zinc-600"
      >
        <GripVertical className="size-3" />
      </div>
      {isEditing ? (
        <div className="flex items-center gap-2 flex-1">
          <input
            type="text"
            value={editingName}
            onChange={(e) => onEditNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSaveEdit();
              if (e.key === 'Escape') onCancelEdit();
            }}
            onClick={(e) => e.stopPropagation()}
            autoFocus
            className="flex-1 text-sm bg-white border border-zinc-300 rounded px-2 py-0.5 outline-none focus:border-zinc-400"
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
            className="flex-1 text-sm truncate"
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
                ? 'text-blue-500' 
                : 'opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-zinc-600'
            }`}
          >
            <Pin className={`size-3.5 ${group.pinned ? 'fill-blue-500' : ''}`} />
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
    activeGroupId, 
    drawerOpen,
    toggleDrawer,
    setActiveGroup, 
    addGroup,
    updateGroup,
    togglePin,
    reorderGroups,
  } = useGroupStore();

  const groupIds = useMemo(() => groups.map(g => g.id), [groups]);

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
  const [sortBy, setSortBy] = useState<SortOption>('created-desc');
  const sidebarRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const sortMenuRef = useRef<HTMLDivElement>(null);

  // 关闭排序菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setShowSortMenu(false);
      }
    };
    if (showSortMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSortMenu]);

  const handleMouseDown = useCallback(() => {
    setIsResizing(true);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    const newWidth = Math.min(Math.max(e.clientX, 150), 400);
    setSidebarWidth(newWidth);
  }, [isResizing]);

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

  return (
    <div 
      ref={sidebarRef}
      style={{ width: drawerOpen ? sidebarWidth : 40 }}
      className="h-full bg-white shrink-0 flex transition-[width] duration-200 ease-in-out overflow-hidden"
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
        className={`flex-1 h-full flex flex-col transition-opacity duration-200 ${
          drawerOpen ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ display: drawerOpen ? 'flex' : 'none' }}
      >
        {/* Toolbar */}
        <div className="flex items-center gap-1 px-3 pt-2 pb-1">
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
          <div className="relative" ref={sortMenuRef}>
            <IconButton onClick={() => setShowSortMenu(!showSortMenu)} active={showSortMenu} tooltip="排序">
              <ArrowUpDown className="size-4" />
            </IconButton>
            {showSortMenu && (
              <div className="absolute left-0 top-full mt-1 w-48 bg-white border border-zinc-200 rounded-lg shadow-xl py-1" style={{ zIndex: 9999 }}>
                <SortMenuItem label="名称 (A-Z)" value="name-asc" current={sortBy} onSelect={setSortBy} onClose={() => setShowSortMenu(false)} />
                <SortMenuItem label="名称 (Z-A)" value="name-desc" current={sortBy} onSelect={setSortBy} onClose={() => setShowSortMenu(false)} />
                <div className="h-px bg-zinc-200 my-1" />
                <SortMenuItem label="编辑时间 (从新到旧)" value="edited-desc" current={sortBy} onSelect={setSortBy} onClose={() => setShowSortMenu(false)} />
                <SortMenuItem label="编辑时间 (从旧到新)" value="edited-asc" current={sortBy} onSelect={setSortBy} onClose={() => setShowSortMenu(false)} />
                <div className="h-px bg-zinc-200 my-1" />
                <SortMenuItem label="创建时间 (从新到旧)" value="created-desc" current={sortBy} onSelect={setSortBy} onClose={() => setShowSortMenu(false)} />
                <SortMenuItem label="创建时间 (从旧到新)" value="created-asc" current={sortBy} onSelect={setSortBy} onClose={() => setShowSortMenu(false)} />
              </div>
            )}
          </div>
        </div>

        {/* Search Input */}
        {isSearching && (
          <div className="px-2 pb-2">
            <div className="flex items-center gap-2 px-2 py-1.5 border border-zinc-200 rounded-md">
              <Search className="size-4 text-zinc-400 shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setIsSearching(false);
                    setSearchQuery('');
                  }
                }}
                placeholder="输入并开始搜索..."
                autoFocus
                className="flex-1 text-sm bg-transparent outline-none placeholder:text-zinc-400"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    searchInputRef.current?.focus();
                  }}
                  className="p-0.5 rounded-full hover:bg-zinc-100 transition-colors"
                >
                  <X className="size-4 text-zinc-400" />
                </button>
              )}
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
              {groups.map((group) => (
                <SortableGroupItem
                  key={group.id}
                  group={group}
                  isActive={activeGroupId === group.id}
                  isEditing={editingId === group.id}
                  editingName={editingName}
                  onSelect={() => setActiveGroup(group.id)}
                  onStartEdit={() => handleStartEdit(group.id, group.name)}
                  onSaveEdit={handleSaveEdit}
                  onCancelEdit={() => setEditingId(null)}
                  onEditNameChange={setEditingName}
                  onTogglePin={() => togglePin(group.id)}
                />
              ))}
            </SortableContext>
          </DndContext>

          {/* Add New Group Input */}
          {isAdding && (
            <div className="flex items-center gap-2 px-3 py-1.5 mx-2">
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
                className="flex-1 text-sm bg-white border border-zinc-300 rounded px-2 py-0.5 outline-none focus:border-zinc-400"
              />
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
          className={`w-px h-full cursor-col-resize hover:bg-zinc-300 transition-colors ${
            isResizing ? 'bg-zinc-400' : 'bg-zinc-200'
          }`}
        />
      )}
    </div>
  );
}

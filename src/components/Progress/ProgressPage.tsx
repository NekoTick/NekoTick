import { useState, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import { useProgressStore } from '@/stores/useProgressStore';
import { useProgressDrag } from './hooks/useProgressDrag';
import { ItemCard } from './ItemCard';
import { ProgressForm } from './forms/ProgressForm';
import { CounterForm } from './forms/CounterForm';

type ViewMode = 'list' | 'create-progress' | 'create-counter';

/**
 * Progress tracking page with list view and creation forms
 */
export function ProgressPage() {
  const { items, addProgress, addCounter, updateCurrent, deleteItem, loadItems, reorderItems } = useProgressStore();

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [showFabMenu, setShowFabMenu] = useState(false);

  // Drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const {
    activeId,
    overId,
    handleDragStart,
    handleDragMove,
    handleDragOver,
    handleDragEnd,
  } = useProgressDrag({ items, onReorder: reorderItems });

  // Handle form submissions
  const handleCreateProgress = (data: {
    title: string;
    note: string;
    direction: 'increment' | 'decrement';
    total: number;
    step: number;
    unit: string;
  }) => {
    addProgress({
      title: data.title,
      note: data.note || undefined,
      direction: data.direction,
      total: data.total,
      step: data.step,
      unit: data.unit,
    });
    setViewMode('list');
  };

  const handleCreateCounter = (data: {
    title: string;
    step: number;
    unit: string;
    frequency: 'daily' | 'weekly' | 'monthly';
  }) => {
    addCounter(data);
    setViewMode('list');
  };

  // Render form views
  if (viewMode === 'create-progress') {
    return (
      <ProgressForm
        onBack={() => setViewMode('list')}
        onSubmit={handleCreateProgress}
      />
    );
  }

  if (viewMode === 'create-counter') {
    return (
      <CounterForm
        onBack={() => setViewMode('list')}
        onSubmit={handleCreateCounter}
      />
    );
  }

  // Main list view
  return (
    <div className="h-full bg-white dark:bg-zinc-900 flex flex-col pt-2 relative">
      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {items.length === 0 && (
          <p className="text-sm text-zinc-300 text-center py-12">No progress items</p>
        )}

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={items.map(i => i.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-3">
              {items.map((item) => {
                const isDropTarget = item.id === overId && overId !== activeId;
                const activeIndex = activeId ? items.findIndex(i => i.id === activeId) : -1;
                const overIndex = overId ? items.findIndex(i => i.id === overId) : -1;
                const insertAfter = isDropTarget && activeIndex !== -1 && overIndex > activeIndex;

                return (
                  <div key={item.id}>
                    {!insertAfter && isDropTarget && (
                      <div className="h-20 rounded-md border-2 border-dashed border-zinc-300 bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800/50 mb-3" />
                    )}
                    <ItemCard
                      item={item}
                      onUpdate={updateCurrent}
                      onDelete={deleteItem}
                      isDragging={activeId === item.id}
                    />
                    {insertAfter && isDropTarget && (
                      <div className="h-20 rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800/50 mt-3" />
                    )}
                  </div>
                );
              })}
            </div>
          </SortableContext>
          <DragOverlay>
            {/* Empty overlay - only show Rust window */}
            {null}
          </DragOverlay>
        </DndContext>
      </div>

      {/* FAB Menu */}
      <div className="absolute bottom-6 right-6 flex flex-col items-end gap-2">
        {showFabMenu && (
          <>
            <button
              onClick={() => {
                setViewMode('create-counter');
                setShowFabMenu(false);
              }}
              className="px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 text-sm rounded-full shadow-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              + Counter
            </button>
            <button
              onClick={() => {
                setViewMode('create-progress');
                setShowFabMenu(false);
              }}
              className="px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 text-sm rounded-full shadow-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              + Progress
            </button>
          </>
        )}
        <button
          onClick={() => setShowFabMenu(!showFabMenu)}
          className={`w-14 h-14 rounded-full bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-800 shadow-lg hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-all flex items-center justify-center ${
            showFabMenu ? 'rotate-45' : ''
          }`}
        >
          <Plus className="size-6" />
        </button>
      </div>
    </div>
  );
}

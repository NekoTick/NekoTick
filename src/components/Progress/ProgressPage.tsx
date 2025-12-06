import { useState, useEffect, useRef } from 'react';
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
import { motion } from 'framer-motion';
import { useProgressStore, type ProgressOrCounter } from '@/stores/useProgressStore';
import { useProgressDrag } from './hooks/useProgressDrag';
import { ItemCard } from './ItemCard';
import { CreateModal } from './CreateModal';
import { DetailModal } from './DetailModal';


/**
 * Progress tracking page with list view and creation modal
 */
export function ProgressPage() {
  const { items, addProgress, addCounter, updateCurrent, deleteItem, updateItem, loadItems, reorderItems } = useProgressStore();
  
  // Scroll state for smart collapsing button
  const [isScrolled, setIsScrolled] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = () => {
    if (scrollRef.current) {
      setIsScrolled(scrollRef.current.scrollTop > 20);
    }
  };

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null); // Store ID instead of object
  const [previewOverride, setPreviewOverride] = useState<{ icon?: string; title?: string } | null>(null);

  // Derive the selected item from the fresh store data
  const selectedItem = items.find(i => i.id === selectedId) || null;

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

  // Handle opening create modal
  const openCreateModal = () => {
    setShowCreateModal(true);
  };

  // Handle form submissions
  const handleCreateProgress = (data: {
    title: string;
    icon?: string;
    direction: 'increment' | 'decrement';
    total: number;
    step: number;
    unit: string;
  }) => {
    addProgress({
      title: data.title,
      icon: data.icon,
      direction: data.direction,
      total: data.total,
      step: data.step,
      unit: data.unit,
    });
  };

  const handleCreateCounter = (data: {
    title: string;
    icon?: string;
    step: number;
    unit: string;
    frequency: 'daily' | 'weekly' | 'monthly';
  }) => {
    addCounter(data);
  };

  // Main list view
  return (
    <div className="h-full bg-white dark:bg-zinc-900 flex flex-col relative">
      {/* Right: Levitating Lens Button (Organic Liquid Soul) */}
      <motion.div 
        className="absolute top-5 z-30 pointer-events-none"
        initial={false}
        animate={{
          right: isScrolled ? 8 : 24 // Move to right-2 (8px) when scrolled, right-6 (24px) when expanded
        }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
      >
        <motion.button
          layout
          onClick={openCreateModal}
          initial={false}
          animate={{
            width: isScrolled ? 40 : "auto", // Slightly larger touch target
            height: 40,
            paddingLeft: isScrolled ? 0 : 16, // Balanced padding
            paddingRight: isScrolled ? 0 : 20,
            backgroundColor: isScrolled ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.6)',
            borderRadius: 9999,
            gap: isScrolled ? 0 : 8,
          }}
          style={{ borderRadius: 9999 }} // Force hardware rounded corners
          transition={{ 
            type: "spring", 
            stiffness: 500, 
            damping: 30,
            mass: 0.8 
          }}
          className="
            pointer-events-auto
            group flex items-center justify-center
            backdrop-blur-xl
            border border-white/40 dark:border-white/10
            shadow-[0_4px_12px_-2px_rgba(0,0,0,0.08),0_2px_4px_-1px_rgba(0,0,0,0.04)]
            hover:shadow-[0_8px_20px_-4px_rgba(0,0,0,0.12),0_4px_8px_-2px_rgba(0,0,0,0.06)]
            hover:bg-white/90 dark:bg-zinc-800/80
            text-zinc-800 dark:text-zinc-100
            transition-shadow duration-300
          "
        >
          {/* Icon - Pure & Floating */}
          <motion.div 
            layout="position"
            className="flex items-center justify-center shrink-0 relative z-10"
          >
            <Plus className="size-4" strokeWidth={2.5} />
          </motion.div>
          
          {/* Text - Organic Reveal */}
          <motion.div
            initial={false}
            animate={{ 
              width: isScrolled ? 0 : "auto",
              opacity: isScrolled ? 0 : 1,
            }}
            transition={{ type: "spring", stiffness: 500, damping: 30, mass: 0.8 }}
            className="overflow-hidden flex items-center"
          >
            <motion.span 
              animate={{ 
                x: isScrolled ? -20 : 0, // Start from behind the icon (-20px)
                filter: isScrolled ? "blur(10px)" : "blur(0px)", // Stronger blur for "materialization"
                opacity: isScrolled ? 0 : 1
              }}
              transition={{ type: "spring", stiffness: 400, damping: 30, mass: 1 }} // Slightly heavier mass for momentum
              className="text-[13px] font-bold tracking-wider uppercase whitespace-nowrap leading-none pt-[1px]"
            >
              New
            </motion.span>
          </motion.div>
        </motion.button>
      </motion.div>

      {/* Content (Scrollable) */}
      <div 
        ref={scrollRef}
        onScroll={handleScroll}
        className="
          flex-1 overflow-y-auto px-6 py-4 pt-6
          [&::-webkit-scrollbar]:w-1.5
          [&::-webkit-scrollbar-track]:bg-transparent
          [&::-webkit-scrollbar-thumb]:bg-zinc-200
          [&::-webkit-scrollbar-thumb]:rounded-full
          [&::-webkit-scrollbar-thumb]:hover:bg-zinc-300
          dark:[&::-webkit-scrollbar-thumb]:bg-zinc-800
          dark:[&::-webkit-scrollbar-thumb]:hover:bg-zinc-700
        "
      >
        {/* Header Section inside ScrollView - Starts at same height as button */}
        <div className="flex items-center justify-between mb-8">
           {/* Left: Time Anchor (Scrolls with content) */}
           <div className="text-[10px] font-bold text-zinc-300 dark:text-zinc-600 uppercase tracking-[0.2em] select-none py-1">
             {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
           </div>
        </div>

        <div className="px-6 pb-4">
          {items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 opacity-50">
              <div className="w-16 h-16 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
                <Plus className="size-8 text-zinc-300 dark:text-zinc-600" />
              </div>
              <p className="text-sm text-zinc-400 dark:text-zinc-500 font-medium">Start tracking your first habit</p>
            </div>
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
                        onClick={() => setSelectedId(item.id)}
                        isDragging={activeId === item.id}
                        previewIcon={selectedItem?.id === item.id ? previewOverride?.icon : undefined}
                        previewTitle={selectedItem?.id === item.id ? previewOverride?.title : undefined}
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
      </div>

      {/* Create Modal */}
      <CreateModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreateProgress={handleCreateProgress}
        onCreateCounter={handleCreateCounter}
      />

      {/* Detail Modal */}
      <DetailModal
        item={selectedItem}
        onClose={() => setSelectedId(null)}
        onUpdate={updateItem}
        onDelete={deleteItem}
        onPreviewChange={(icon, title) => {
          if (icon === undefined && title === undefined) {
            setPreviewOverride(null);
          } else {
            setPreviewOverride({ icon, title });
          }
        }}
      />
    </div>
  );
}

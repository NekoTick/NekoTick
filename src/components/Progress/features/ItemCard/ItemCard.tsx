import { useSortable, defaultAnimateLayoutChanges, type AnimateLayoutChanges } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ItemCardProps } from './types';
import { ArchivedItemCard } from './ArchivedItemCard';
import { ActiveItemCard } from './ActiveItemCard';

// Disable drop animation to prevent "snap back" effect
const animateLayoutChanges: AnimateLayoutChanges = (args) => {
  const { isSorting, wasDragging } = args;
  if (isSorting || wasDragging) {
    return false;
  }
  return defaultAnimateLayoutChanges(args);
};

export function ItemCard({ item, onUpdate, onClick, onAutoArchive, onDelete, isDragging: propIsDragging, previewIcon, previewTitle }: ItemCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
    animateLayoutChanges,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };

  if (item.archived) {
    return (
      <div ref={setNodeRef} style={style} className="relative">
        <ArchivedItemCard 
          item={item} 
          onUpdate={onUpdate}
          onClick={onClick}
          onAutoArchive={onAutoArchive}
          onDelete={onDelete}
          previewIcon={previewIcon}
          previewTitle={previewTitle}
        />
        
        {/* Drag Handle - Covers the Icon/Left Zone */}
        <div 
          {...attributes} 
          {...listeners}
          className="absolute left-0 top-0 bottom-0 w-24 cursor-grab active:cursor-grabbing z-10"
        />
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style} className="relative mb-5">
      <ActiveItemCard 
        item={item} 
        onUpdate={onUpdate} 
        onClick={onClick}
        onAutoArchive={onAutoArchive}
        isDragging={propIsDragging || isDragging}
        previewIcon={previewIcon}
        previewTitle={previewTitle}
      />
      
      {/* Drag Handle Overlay - Positioned over the card but controlled by parent DnD */}
      <div 
          {...attributes} 
          {...listeners}
          className="absolute left-0 top-0 bottom-0 w-8 cursor-grab active:cursor-grabbing z-20"
      />
    </div>
  );
}

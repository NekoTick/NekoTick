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

export function ItemCard(props: ItemCardProps) {
  const { item } = props;
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: item.id,
    animateLayoutChanges,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // If archived, render the "Timeline Ticket" view
  if (item.archived) {
    return (
      <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
        <ArchivedItemCard {...props} />
      </div>
    );
  }

  // Active view
  return (
    <div ref={setNodeRef} style={style} className="relative mb-5">
      <ActiveItemCard {...props} />
      
      {/* Drag Handle Overlay - Positioned over the card but controlled by parent DnD */}
      <div 
          {...attributes} 
          {...listeners}
          className="absolute left-0 top-0 bottom-0 w-8 cursor-grab active:cursor-grabbing z-20"
      />
    </div>
  );
}

import { forwardRef, type CSSProperties, type MouseEventHandler } from 'react';
import { cn } from '@/lib/utils';
import { ResizeDividerVisual, RESIZE_HANDLE_HIT_WIDTH } from './ResizeDividerVisual';

interface ResizeHandleProps {
  onMouseDown: MouseEventHandler<HTMLDivElement>;
  onDoubleClick?: MouseEventHandler<HTMLDivElement>;
  isDragging: boolean;
  positionStyle: CSSProperties;
  position?: 'fixed' | 'absolute';
  zIndexClassName?: string;
  className?: string;
  dataResizeHandleScope?: string;
}

export const ResizeHandle = forwardRef<HTMLDivElement, ResizeHandleProps>(function ResizeHandle({
  onMouseDown,
  onDoubleClick,
  isDragging,
  positionStyle,
  position = 'fixed',
  zIndexClassName = 'z-[var(--vlaina-z-30)]',
  className,
  dataResizeHandleScope,
}: ResizeHandleProps, ref) {
  return (
    <div
      ref={ref}
      data-resize-handle={dataResizeHandleScope ?? 'true'}
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      className={cn(
        position === 'fixed' ? 'fixed' : 'absolute',
        'top-0 bottom-0 cursor-col-resize bg-transparent transition-colors touch-none group flex items-center justify-center',
        zIndexClassName,
        isDragging ? 'delay-[var(--vlaina-duration-0)]' : 'delay-[var(--vlaina-duration-150)]',
        className,
      )}
      style={{ width: RESIZE_HANDLE_HIT_WIDTH, ...positionStyle }}
    >
      <ResizeDividerVisual isVisible={isDragging} />
    </div>
  );
});

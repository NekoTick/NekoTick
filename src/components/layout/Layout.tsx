import { ReactNode, useState, useRef, useCallback, useEffect } from 'react';
import { TitleBar } from './TitleBar';
import { cn } from '@/lib/utils';

const PANEL_CONFIG = {
  right: { default: 300, min: 48, storageKey: 'nekotick-right-panel-width' },
  left: { default: 260, min: 48, storageKey: 'nekotick-left-panel-width' },
};

interface LayoutProps {
  children: ReactNode;
  onOpenSettings?: () => void;
  toolbar?: ReactNode;
  /** Left panel content */
  leftPanel?: ReactNode;
  showLeftPanel?: boolean;
  /** Right panel content */
  rightPanel?: ReactNode;
  showRightPanel?: boolean;
}

// 从 localStorage 读取面板宽度
function loadPanelWidth(key: string, defaultValue: number): number {
  try {
    const saved = localStorage.getItem(key);
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
  } catch { /* ignore */ }
  return defaultValue;
}

export function Layout({ children, onOpenSettings, toolbar, leftPanel, showLeftPanel = false, rightPanel, showRightPanel = false }: LayoutProps) {
  const [rightPanelWidth, setRightPanelWidth] = useState(() => 
    loadPanelWidth(PANEL_CONFIG.right.storageKey, PANEL_CONFIG.right.default)
  );
  const [leftPanelWidth, setLeftPanelWidth] = useState(() => 
    loadPanelWidth(PANEL_CONFIG.left.storageKey, PANEL_CONFIG.left.default)
  );

  const [isDraggingRight, setIsDraggingRight] = useState(false);
  const [isDraggingLeft, setIsDraggingLeft] = useState(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  const handleRightDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingRight(true);
    dragStartX.current = e.clientX;
    dragStartWidth.current = rightPanelWidth;
  }, [rightPanelWidth]);

  const handleLeftDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingLeft(true);
    dragStartX.current = e.clientX;
    dragStartWidth.current = leftPanelWidth;
  }, [leftPanelWidth]);

  useEffect(() => {
    if (!isDraggingRight && !isDraggingLeft) return;

    const handleMouseMove = (e: MouseEvent) => {
      const windowWidth = window.innerWidth;
      const otherPanelWidth = isDraggingRight 
        ? (showLeftPanel ? leftPanelWidth : 0) 
        : (showRightPanel ? rightPanelWidth : 0);
      const maxPanelWidth = windowWidth - otherPanelWidth - 200;

      if (isDraggingRight) {
        const delta = dragStartX.current - e.clientX;
        const newWidth = Math.max(PANEL_CONFIG.right.min, Math.min(maxPanelWidth, dragStartWidth.current + delta));
        setRightPanelWidth(newWidth);
      } else if (isDraggingLeft) {
        const delta = e.clientX - dragStartX.current;
        const newWidth = Math.max(PANEL_CONFIG.left.min, Math.min(maxPanelWidth, dragStartWidth.current + delta));
        setLeftPanelWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      if (isDraggingRight) {
        localStorage.setItem(PANEL_CONFIG.right.storageKey, rightPanelWidth.toString());
        setIsDraggingRight(false);
      }
      if (isDraggingLeft) {
        localStorage.setItem(PANEL_CONFIG.left.storageKey, leftPanelWidth.toString());
        setIsDraggingLeft(false);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingRight, isDraggingLeft, rightPanelWidth, leftPanelWidth, showLeftPanel, showRightPanel]);

  if (leftPanel !== undefined || rightPanel !== undefined) {
    return (
      <div className={cn(
        "h-screen flex bg-background",
        (isDraggingRight || isDraggingLeft) && "select-none cursor-col-resize"
      )}>
        {showLeftPanel && leftPanel && (
          <>
            <aside 
              className="flex-shrink-0 flex flex-col bg-zinc-50/80 dark:bg-zinc-900/80 backdrop-blur-xl overflow-auto"
              style={{ width: leftPanelWidth }}
            >
              {leftPanel}
            </aside>
            <div
              onMouseDown={handleLeftDragStart}
              className={cn(
                "w-[5px] flex-shrink-0 cursor-col-resize transition-colors",
                "bg-zinc-200/50 dark:bg-zinc-800/50",
                "hover:bg-zinc-300 dark:hover:bg-zinc-700",
                isDraggingLeft && "bg-zinc-400 dark:bg-zinc-600"
              )}
            />
          </>
        )}

        <div className="flex-1 flex flex-col min-w-0">
          <TitleBar onOpenSettings={onOpenSettings} toolbar={toolbar} toolbarAlignRight={showRightPanel} />
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
        
        {showRightPanel && rightPanel && (
          <>
            <div
              onMouseDown={handleRightDragStart}
              className={cn(
                "w-[5px] flex-shrink-0 cursor-col-resize transition-colors",
                "bg-zinc-200/50 dark:bg-zinc-800/50",
                "hover:bg-zinc-300 dark:hover:bg-zinc-700",
                isDraggingRight && "bg-zinc-400 dark:bg-zinc-600"
              )}
            />
            <aside 
              className="flex-shrink-0 flex flex-col bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl overflow-hidden"
              style={{ width: rightPanelWidth }}
            >
              <div className="flex-1 overflow-auto min-w-0">{rightPanel}</div>
            </aside>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      <TitleBar onOpenSettings={onOpenSettings} toolbar={toolbar} />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}

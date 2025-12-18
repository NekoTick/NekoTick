import { ReactNode, useState, useRef, useEffect } from 'react';

interface CalendarLayoutProps {
  sidebar: ReactNode;
  main: ReactNode;
  contextPanel: ReactNode;
  showSidebar?: boolean;
  showContextPanel?: boolean;
}

const SIDEBAR_WIDTH = 260;

export function CalendarLayout({ sidebar, main, contextPanel, showSidebar = true, showContextPanel = true }: CalendarLayoutProps) {
  const [isHovering, setIsHovering] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // When sidebar is hidden, mouse hover on left edge triggers expansion
  const handleMouseEnterTrigger = () => {
    if (!showSidebar) {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
      setIsHovering(true);
    }
  };

  const handleMouseLeaveSidebar = () => {
    if (!showSidebar && isHovering) {
      hoverTimeoutRef.current = setTimeout(() => {
        setIsHovering(false);
      }, 300);
    }
  };

  const handleMouseEnterSidebar = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (showSidebar) {
      setIsHovering(false);
    }
  }, [showSidebar]);

  // Calculate whether sidebar should expand
  const shouldExpand = showSidebar || isHovering;

  return (
    <div className="flex h-full w-full overflow-hidden bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 relative">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50/20 via-transparent to-purple-50/20 dark:from-blue-900/10 dark:to-purple-900/10 pointer-events-none" />

      {/* Left Edge Hover Trigger - Shown when sidebar is hidden */}
      {!showSidebar && !isHovering && (
        <div 
          className="absolute left-0 top-0 bottom-0 w-3 z-50 cursor-pointer hover:bg-zinc-200/30 dark:hover:bg-zinc-700/30 transition-colors"
          onMouseEnter={handleMouseEnterTrigger}
        />
      )}

      {/* Left Sidebar - Always rendered, visibility controlled by width */}
      <aside 
        onMouseEnter={handleMouseEnterSidebar}
        onMouseLeave={handleMouseLeaveSidebar}
        style={{ 
          width: shouldExpand ? SIDEBAR_WIDTH : 0,
          minWidth: shouldExpand ? SIDEBAR_WIDTH : 0,
        }}
        className="flex-shrink-0 border-r border-zinc-200/50 dark:border-zinc-800/50 flex flex-col bg-zinc-50/80 dark:bg-zinc-900/80 backdrop-blur-xl z-20 overflow-hidden transition-all duration-150 ease-out"
      >
        <div style={{ width: SIDEBAR_WIDTH, minWidth: SIDEBAR_WIDTH }} className="h-full">
          {sidebar}
        </div>
      </aside>

      {/* Center: The Canvas */}
      <main className="flex-1 min-w-0 relative flex flex-col bg-white/50 dark:bg-zinc-950/50 z-10 transition-all duration-150 ease-out">
        {main}
      </main>

      {/* Right: Context / Staging Area */}
      {showContextPanel && (
        <aside className="w-[300px] flex-shrink-0 border-l border-zinc-200/50 dark:border-zinc-800/50 flex flex-col bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl z-20">
          {contextPanel}
        </aside>
      )}
    </div>
  );
}

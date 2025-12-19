import { ReactNode } from 'react';
import { TitleBar } from './TitleBar';

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

export function Layout({ children, onOpenSettings, toolbar, leftPanel, showLeftPanel = false, rightPanel, showRightPanel = false }: LayoutProps) {
  // If panels are used, use horizontal layout with full-height panels
  if (leftPanel !== undefined || rightPanel !== undefined) {
    return (
      <div className="h-screen flex bg-background">
        {/* Left panel - full height, border naturally extends from top to bottom */}
        {showLeftPanel && leftPanel && (
          <aside className="w-[260px] flex-shrink-0 border-r border-zinc-200/50 dark:border-zinc-800/50 flex flex-col bg-zinc-50/80 dark:bg-zinc-900/80 backdrop-blur-xl overflow-auto">
            {leftPanel}
          </aside>
        )}

        {/* Center section: title bar + content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Title bar with toolbar aligned to right edge */}
          <TitleBar onOpenSettings={onOpenSettings} toolbar={toolbar} toolbarAlignRight={showRightPanel} />
          
          {/* Main content */}
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
        
        {/* Right panel - full height, border naturally extends from top to bottom */}
        {showRightPanel && rightPanel && (
          <aside className="w-[300px] flex-shrink-0 border-l border-zinc-200/50 dark:border-zinc-800/50 flex flex-col bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl overflow-auto">
            {rightPanel}
          </aside>
        )}
      </div>
    );
  }

  // Default vertical layout
  return (
    <div className="h-screen flex flex-col bg-background">
      <TitleBar onOpenSettings={onOpenSettings} toolbar={toolbar} />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}

import { ReactNode } from 'react';

interface CalendarLayoutProps {
  sidebar: ReactNode;
  main: ReactNode;
  contextPanel: ReactNode;
  showContextPanel?: boolean;
}

export function CalendarLayout({ sidebar, main, contextPanel, showContextPanel = true }: CalendarLayoutProps) {
  return (
    <div className="flex h-full w-full overflow-hidden bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {/* Left Sidebar: Navigation & Sources */}
      <aside className="w-[260px] flex-shrink-0 border-r border-zinc-200 dark:border-zinc-800 flex flex-col bg-zinc-50/50 dark:bg-zinc-900/50">
        {sidebar}
      </aside>

      {/* Center: The Canvas */}
      <main className="flex-1 min-w-0 relative flex flex-col bg-white dark:bg-zinc-950">
        {main}
      </main>

      {/* Right: Context / Staging Area */}
      {showContextPanel && (
        <aside className="w-[300px] flex-shrink-0 border-l border-zinc-200 dark:border-zinc-800 flex flex-col bg-white dark:bg-zinc-900">
          {contextPanel}
        </aside>
      )}
    </div>
  );
}

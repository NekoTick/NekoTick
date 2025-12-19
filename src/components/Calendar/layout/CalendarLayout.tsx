import { ReactNode } from 'react';

interface CalendarLayoutProps {
  main: ReactNode;
}

export function CalendarLayout({ main }: CalendarLayoutProps) {
  return (
    <div className="flex h-full w-full overflow-hidden bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 relative">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50/20 via-transparent to-purple-50/20 dark:from-blue-900/10 dark:to-purple-900/10 pointer-events-none" />

      {/* Main Content */}
      <main className="flex-1 min-w-0 relative flex flex-col bg-white/50 dark:bg-zinc-950/50 z-10">
        {main}
      </main>
    </div>
  );
}

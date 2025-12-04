import { ReactNode } from 'react';
import { TitleBar } from './TitleBar';

interface LayoutProps {
  children: ReactNode;
  onOpenSettings?: () => void;
}

export function Layout({ children, onOpenSettings }: LayoutProps) {
  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Custom Title Bar */}
      <TitleBar onOpenSettings={onOpenSettings} />
      
      {/* Main Content Area */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}

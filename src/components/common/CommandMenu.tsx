import { useEffect, useState, useCallback } from 'react';
import { useTheme } from 'next-themes';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  Sun,
  Moon,
  Monitor,
  Plus,
  Trash2,
  Settings,
  Keyboard,
} from 'lucide-react';
import { useGroupStore } from '@/stores/useGroupStore';

interface CommandMenuProps {
  onFocusInput?: () => void;
}

export function CommandMenu({ onFocusInput }: CommandMenuProps) {
  const [open, setOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const { tasks, deleteTask } = useGroupStore();

  // Global keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+K (Mac) or Ctrl+K (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const runCommand = useCallback((command: () => void) => {
    setOpen(false);
    // Small delay to allow dialog to close
    setTimeout(command, 100);
  }, []);

  const handleClearCompleted = () => {
    const completedTasks = tasks.filter((t) => t.completed);
    completedTasks.forEach((t) => deleteTask(t.id));
  };

  const completedCount = tasks.filter((t) => t.completed).length;

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {/* Theme Commands */}
        <CommandGroup heading="Theme">
          <CommandItem
            onSelect={() => runCommand(() => setTheme('light'))}
            className="gap-2"
          >
            <Sun className="h-4 w-4" />
            <span>Light Mode</span>
            {theme === 'light' && (
              <span className="ml-auto text-xs text-muted-foreground">Active</span>
            )}
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => setTheme('dark'))}
            className="gap-2"
          >
            <Moon className="h-4 w-4" />
            <span>Dark Mode</span>
            {theme === 'dark' && (
              <span className="ml-auto text-xs text-muted-foreground">Active</span>
            )}
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => setTheme('system'))}
            className="gap-2"
          >
            <Monitor className="h-4 w-4" />
            <span>System Theme</span>
            {theme === 'system' && (
              <span className="ml-auto text-xs text-muted-foreground">Active</span>
            )}
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {/* Task Commands */}
        <CommandGroup heading="Tasks">
          <CommandItem
            onSelect={() => runCommand(() => onFocusInput?.())}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            <span>New Task</span>
            <span className="ml-auto text-xs text-muted-foreground">
              Focus input
            </span>
          </CommandItem>
          {completedCount > 0 && (
            <CommandItem
              onSelect={() => runCommand(handleClearCompleted)}
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" />
              <span>Clear Completed Tasks</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {completedCount} task{completedCount > 1 ? 's' : ''}
              </span>
            </CommandItem>
          )}
        </CommandGroup>

        <CommandSeparator />

        {/* General Commands */}
        <CommandGroup heading="General">
          <CommandItem
            onSelect={() => runCommand(() => {
              // Placeholder - will be implemented later
              console.log('Settings clicked');
            })}
            className="gap-2"
          >
            <Settings className="h-4 w-4" />
            <span>Settings</span>
            <span className="ml-auto text-xs text-muted-foreground">
              Coming soon
            </span>
          </CommandItem>
          <CommandItem
            disabled
            className="gap-2 opacity-50"
          >
            <Keyboard className="h-4 w-4" />
            <span>Keyboard Shortcuts</span>
            <span className="ml-auto text-xs text-muted-foreground">
              ⌘K
            </span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

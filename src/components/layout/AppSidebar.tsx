import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  Inbox,
  Calendar,
  CalendarDays,
  Cat,
  X,
  Menu,
} from 'lucide-react';
import { useGroupStore } from '@/stores/useGroupStore';
import { cn } from '@/lib/utils';

// Navigation items
const navItems = [
  { title: 'Inbox', icon: Inbox, active: true },
  { title: 'Today', icon: Calendar, active: false },
  { title: 'Upcoming', icon: CalendarDays, active: false },
];

export function AppSidebar() {
  const { tasks } = useGroupStore();
  const inboxCount = tasks.filter((t) => !t.completed).length;
  const { state, toggleSidebar } = useSidebar();
  const isExpanded = state === 'expanded';

  return (
    <Sidebar collapsible="icon">
      {/* Header - Logo + Toggle */}
      <SidebarHeader className="border-b">
        <div className="flex h-14 items-center gap-3 px-3">
          {/* Toggle Button */}
          <button
            onClick={toggleSidebar}
            className="flex size-9 items-center justify-center rounded-md hover:bg-accent"
          >
            {isExpanded ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
          
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Cat className="size-4" />
            </div>
            <span className="font-semibold text-base group-data-[collapsible=icon]:hidden">
              Nekotick
            </span>
          </div>
        </div>
      </SidebarHeader>

      {/* Navigation */}
      <SidebarContent className="px-2 py-4">
        <SidebarMenu>
          {navItems.map((item) => (
            <SidebarMenuItem key={item.title}>
              <button
                className={cn(
                  'flex w-full items-center rounded-md transition-colors',
                  // Collapsed: vertical layout
                  'group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:py-3 group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:gap-1',
                  // Expanded: horizontal layout
                  'group-data-[state=expanded]:flex-row group-data-[state=expanded]:py-2 group-data-[state=expanded]:px-3 group-data-[state=expanded]:gap-3',
                  // Active state
                  item.active 
                    ? 'bg-accent text-accent-foreground' 
                    : 'hover:bg-accent/50 text-muted-foreground hover:text-foreground'
                )}
              >
                <item.icon className="size-5 shrink-0" />
                <span className={cn(
                  'text-sm',
                  'group-data-[collapsible=icon]:text-[10px]'
                )}>
                  {item.title}
                </span>
                {item.title === 'Inbox' && inboxCount > 0 && isExpanded && (
                  <span className="ml-auto text-xs opacity-60">
                    {inboxCount}
                  </span>
                )}
              </button>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
    </Sidebar>
  );
}

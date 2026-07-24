import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from '@/components/ui/icons';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';
import { themeDomStyleTokens } from '@/styles/themeTokens';
import { useNotesOutline } from '../Sidebar/Outline/useNotesOutline';
import { noteToolbarIconButtonClassName } from './noteToolbarStyles';

export function EditorOutlineRail({ enabled }: { enabled: boolean }) {
  const { t } = useI18n();
  const { headings, activeId, jumpToHeading } = useNotesOutline(enabled);
  const activeRowRef = useRef<HTMLButtonElement | null>(null);
  const outlineId = useId();
  const [isCollapsed, setIsCollapsed] = useState(true);

  useEffect(() => {
    if (isCollapsed) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      activeRowRef.current?.scrollIntoView?.({ block: 'nearest' });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeId, isCollapsed]);

  if (!enabled || headings.length === 0) {
    return null;
  }

  return (
    <aside
      className="editor-outline-rail"
      data-editor-outline-rail="true"
      data-editor-outline-toolbar-anchor="true"
      data-collapsed={isCollapsed ? 'true' : 'false'}
      data-no-editor-drag-box="true"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={cn(
              noteToolbarIconButtonClassName,
              'editor-outline-trigger p-0 border-0',
              !isCollapsed && 'text-[var(--vlaina-sidebar-row-selected-text)]',
            )}
            aria-label={t('notes.documentOutline')}
            aria-controls={outlineId}
            aria-expanded={!isCollapsed}
            data-editor-outline-trigger="true"
            onClick={() => setIsCollapsed((previous) => !previous)}
          >
            <Icon name="editor.toc" size="md" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          sideOffset={themeDomStyleTokens.toolbarTooltipOffsetPx}
          showArrow={false}
          className={cn(
            'rounded-[var(--vlaina-notes-ui-radius-tooltip)] px-3 py-2 text-xs text-[var(--vlaina-sidebar-chat-text)]',
            raisedPillSurfaceClass,
          )}
        >
          {t('notes.documentOutline')}
        </TooltipContent>
      </Tooltip>
      <div
        className={cn(
          'editor-outline-panel rounded-[var(--vlaina-ui-radius-panel)]',
          raisedPillSurfaceClass,
        )}
        data-editor-outline-panel="true"
        hidden={isCollapsed}
      >
        <div className="editor-outline-panel-title">{t('notes.documentOutline')}</div>
        <nav
          id={outlineId}
          className="editor-outline-list"
          aria-label={t('notes.documentOutline')}
          aria-hidden={isCollapsed}
        >
          {headings.map((heading) => (
            <button
              key={heading.id}
              ref={heading.id === activeId ? activeRowRef : undefined}
              type="button"
              className={cn(
                'editor-outline-row',
                heading.id === activeId && 'editor-outline-row-active',
              )}
              data-level={heading.level}
              aria-current={heading.id === activeId ? 'location' : undefined}
              onClick={() => jumpToHeading(heading.id)}
            >
              <span className="editor-outline-row-text">{heading.text}</span>
            </button>
          ))}
        </nav>
      </div>
    </aside>
  );
}

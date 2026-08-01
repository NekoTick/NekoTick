import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useNotesOutline } from '../Sidebar/Outline/useNotesOutline';

export function EditorOutlineRail({ enabled }: { enabled: boolean }) {
  const { t } = useI18n();
  const { headings, activeId, jumpToHeading } = useNotesOutline(enabled);
  const activeRowRef = useRef<HTMLButtonElement | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [hasFocus, setHasFocus] = useState(false);
  const isExpanded = isHovered || hasFocus;

  useEffect(() => {
    if (!enabled || headings.length === 0) {
      setIsHovered(false);
      setHasFocus(false);
    }
  }, [enabled, headings.length]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      activeRowRef.current?.scrollIntoView?.({ block: 'nearest' });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeId, isExpanded]);

  if (!enabled || headings.length === 0) {
    return null;
  }

  return (
    <aside
      className="editor-outline-rail"
      data-editor-outline-rail="true"
      data-expanded={isExpanded ? 'true' : 'false'}
      data-no-editor-drag-box="true"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocusCapture={() => setHasFocus(true)}
      onBlurCapture={(event) => {
        const nextTarget = event.relatedTarget;
        if (!nextTarget || !event.currentTarget.contains(nextTarget as Node)) {
          setHasFocus(false);
        }
      }}
    >
      <div
        className="editor-outline-panel"
        data-editor-outline-panel="true"
      >
        <nav
          className="editor-outline-list"
          aria-label={t('notes.documentOutline')}
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

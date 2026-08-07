import { EDITOR_LAYOUT_CLASS } from '@/lib/layout';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

const LARGE_MARKDOWN_FIRST_PAINT_MIN_LENGTH = 60_000;

export function shouldShowLargeMarkdownFirstPaintPreview(markdown: string): boolean {
  return markdown.length >= LARGE_MARKDOWN_FIRST_PAINT_MIN_LENGTH;
}

export function LargeMarkdownFirstPaintPreview({ markdown }: { markdown: string }) {
  const { t } = useI18n();
  if (!shouldShowLargeMarkdownFirstPaintPreview(markdown)) {
    return null;
  }

  return (
    <div
      className={cn(
        'milkdown-editor theme-vlaina is-live-preview max is-readable-line-width h-full bg-[var(--vlaina-bg-primary)]',
        EDITOR_LAYOUT_CLASS,
      )}
      data-note-first-paint-preview="true"
    >
      <textarea
        aria-label={t('editor.markdownSourceEditor')}
        className="block h-full w-full resize-none overflow-auto bg-transparent px-0 py-2 pb-[var(--vlaina-height-prosemirror-bottom-padding)] font-mono text-[length:var(--vlaina-markdown-font-body-size)] leading-[var(--vlaina-markdown-line-height-body)] text-[var(--vlaina-text-primary)] outline-none"
        data-note-first-paint-preview-source="true"
        readOnly
        spellCheck={false}
        tabIndex={-1}
        value={markdown}
        wrap="off"
      />
    </div>
  );
}

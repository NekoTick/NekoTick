import type { ComponentProps } from 'react';
import { RotateCcw, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { EDITOR_LAYOUT_CLASS } from '@/lib/layout';
import { MarkdownSourceEditor } from './MarkdownSourceEditor';

type MarkdownSourceFallbackProps = Omit<ComponentProps<typeof MarkdownSourceEditor>, 'mode'> & {
  onRetry: () => void;
};

export function MarkdownSourceFallback({ onRetry, ...editorProps }: MarkdownSourceFallbackProps) {
  const { t } = useI18n();

  return (
    <>
      <div
        className={`${EDITOR_LAYOUT_CLASS} flex flex-wrap items-center gap-[var(--vlaina-space-8px)] py-[var(--vlaina-space-8px)] text-[length:var(--vlaina-font-13)] text-[var(--vlaina-markdown-color-error)]`}
        data-note-source-fallback-notice="true"
        role="status"
      >
        <TriangleAlert className="size-[var(--vlaina-size-16px)]" aria-hidden="true" />
        <span className="min-w-0 flex-1">{t('editor.updateViewFailed')}</span>
        <Button type="button" variant="ghost" size="sm" onClick={onRetry}>
          <RotateCcw aria-hidden="true" />
          {t('common.retry')}
        </Button>
      </div>
      <MarkdownSourceEditor {...editorProps} mode="fallback" />
    </>
  );
}

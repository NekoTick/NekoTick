import { memo } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { themeWhiteboardTokens } from '@/styles/themeTokens';
import { getWhiteboardAutoShapePoints } from '../../model/whiteboardAutoShapeGeometry';
import type { WhiteboardAutoDrawSuggestion } from '../../model/autodraw/whiteboardAutoDrawRecognition';
import { whiteboardMainToolbarSurfaceClassName } from '../toolbar/WhiteboardToolbarPrimitives';
import { WhiteboardAutoDrawIcon } from './WhiteboardAutoDrawIcon';

interface WhiteboardAutoDrawSuggestionStripProps {
  suggestions: WhiteboardAutoDrawSuggestion[];
  onChoose: (suggestion: WhiteboardAutoDrawSuggestion) => void;
  onDismiss: () => void;
}

export const WhiteboardAutoDrawSuggestionStrip = memo(function WhiteboardAutoDrawSuggestionStrip({
  suggestions,
  onChoose,
  onDismiss,
}: WhiteboardAutoDrawSuggestionStripProps) {
  const { t } = useI18n();
  if (suggestions.length === 0) return null;
  const tokens = themeWhiteboardTokens;
  return (
    <div
      aria-label={t('whiteboard.tool.autoshape')}
      data-whiteboard-autodraw-suggestions="true"
      role="toolbar"
      className={cn(
        'absolute flex items-center overflow-hidden',
        whiteboardMainToolbarSurfaceClassName,
      )}
      style={{
        gap: tokens.autoDrawSuggestionGapPx,
        height: tokens.autoDrawSuggestionHeightPx,
        left: '50%',
        maxWidth: tokens.autoDrawSuggestionMaxWidthPx,
        padding: tokens.autoDrawSuggestionPaddingPx,
        right: 'auto',
        top: tokens.autoDrawSuggestionTopPx,
        transform: 'translateX(-50%)',
        width: `min(calc(100% - ${tokens.autoDrawSuggestionHorizontalInsetPx * 2}px), ${tokens.autoDrawSuggestionMaxWidthPx}px)`,
        zIndex: tokens.autoDrawSuggestionZIndex,
      }}
    >
      <div className="no-scrollbar flex min-w-0 flex-1 items-center overflow-x-auto" style={{ gap: tokens.autoDrawSuggestionGapPx }}>
        {suggestions.map((suggestion) => (
          <Tooltip key={`${suggestion.kind}-${suggestion.kind === 'icon' ? suggestion.icon : suggestion.shape}`}>
            <TooltipTrigger asChild>
              <button
                aria-label={suggestion.label}
                className="grid shrink-0 place-items-center rounded-[var(--vlaina-radius-4px)] text-[var(--vlaina-color-text-primary)] transition-colors hover:bg-[var(--vlaina-color-surface-secondary)] hover:text-[var(--vlaina-color-whiteboard-selected)]"
                data-whiteboard-autodraw-candidate={suggestion.kind === 'icon' ? suggestion.icon : suggestion.shape}
                style={{ height: tokens.autoDrawSuggestionButtonSizePx, width: tokens.autoDrawSuggestionButtonSizePx }}
                type="button"
                onClick={() => onChoose(suggestion)}
              >
                {suggestion.kind === 'icon' ? (
                  <span className="block" style={{ height: tokens.autoDrawSuggestionGlyphSizePx, width: tokens.autoDrawSuggestionGlyphSizePx }}>
                    <WhiteboardAutoDrawIcon
                      color="currentColor"
                      height={tokens.autoDrawSuggestionGlyphSizePx}
                      icon={suggestion.icon}
                      strokeWidth={tokens.autoDrawSuggestionStrokeWidthPx}
                      width={tokens.autoDrawSuggestionGlyphSizePx}
                    />
                  </span>
                ) : (
                  <ShapeCandidate shape={suggestion.shape} />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{suggestion.label}</TooltipContent>
          </Tooltip>
        ))}
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            aria-label={t('common.close')}
            className="grid shrink-0 place-items-center rounded-[var(--vlaina-radius-4px)] text-[var(--vlaina-color-text-secondary)] hover:bg-[var(--vlaina-color-surface-secondary)] hover:text-[var(--vlaina-color-text-primary)]"
            style={{ height: tokens.autoDrawSuggestionCloseSizePx, width: tokens.autoDrawSuggestionCloseSizePx }}
            type="button"
            onClick={onDismiss}
          >
            <X aria-hidden="true" size={tokens.autoDrawSuggestionCloseGlyphSizePx} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t('common.close')}</TooltipContent>
      </Tooltip>
    </div>
  );
});

const ShapeCandidate = memo(function ShapeCandidate({
  shape,
}: { shape: Extract<WhiteboardAutoDrawSuggestion, { kind: 'shape' }>['shape'] }) {
  const size = themeWhiteboardTokens.autoDrawSuggestionGlyphSizePx;
  const points = getWhiteboardAutoShapePoints(shape, [3, 3, size - 3, size - 3]);
  return (
    <svg aria-hidden="true" height={size} viewBox={`0 0 ${size} ${size}`} width={size}>
      <polyline
        fill={themeWhiteboardTokens.strokeNoFill}
        points={points.map((point) => `${point.x},${point.y}`).join(' ')}
        stroke={themeWhiteboardTokens.autoDrawSuggestionStrokeColor}
        strokeLinecap={themeWhiteboardTokens.strokeLineCap}
        strokeLinejoin={themeWhiteboardTokens.strokeLineJoin}
        strokeWidth={themeWhiteboardTokens.autoDrawSuggestionStrokeWidthPx}
      />
    </svg>
  );
});

import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { themeWhiteboardTokens } from '@/styles/themeTokens';
import {
  WHITEBOARD_DRAWING_TOOLS,
  WHITEBOARD_ERASER_TOOLS,
  isDrawingTool,
  type WhiteboardBrushColors,
  type WhiteboardBrushSizes,
  type WhiteboardBrushTool,
  type WhiteboardDrawingTool,
  type WhiteboardTool,
} from '../../model/whiteboardModel';
import {
  WhiteboardToolbarButton,
  WhiteboardDockSlot,
  WhiteboardToolbarGroup,
  whiteboardFloatingPanelClassName,
} from './WhiteboardToolbarPrimitives';
import { WhiteboardColorPicker } from './WhiteboardColorPicker';
import { useWhiteboardDockMagnification } from './useWhiteboardDockMagnification';

export type WhiteboardToolPanelName = 'brush' | 'eraser';

interface WhiteboardToolPanelProps {
  brushColors: WhiteboardBrushColors;
  brushSizes: WhiteboardBrushSizes;
  panel: WhiteboardToolPanelName;
  tool: WhiteboardTool;
  onBrushColorChange: (tool: WhiteboardDrawingTool, color: string) => void;
  onBrushSizeSelect: (tool: WhiteboardBrushTool, size: number) => void;
  onToolChange: (tool: WhiteboardTool) => void;
}

export function WhiteboardToolPanel(props: WhiteboardToolPanelProps) {
  const { t } = useI18n();
  const dock = useWhiteboardDockMagnification({
    activationResponseMs: themeWhiteboardTokens.toolPanelDockActivationResponseMs,
    maxScale: themeWhiteboardTokens.toolPanelDockMagnificationMax,
    pointerResponseMs: themeWhiteboardTokens.toolPanelDockPointerResponseMs,
    radiusPx: themeWhiteboardTokens.toolPanelDockMagnificationRadiusPx,
  });
  const drawingTool = isDrawingTool(props.tool) ? props.tool : 'pen';
  const sizeTool = props.tool === 'stroke-eraser' ? props.tool : drawingTool;
  const tools = props.panel === 'brush' ? WHITEBOARD_DRAWING_TOOLS : WHITEBOARD_ERASER_TOOLS;

  return (
    <div
      ref={dock.ref}
      data-whiteboard-tool-panel="true"
      onPointerCancel={dock.onPointerCancel}
      onPointerEnter={dock.onPointerEnter}
      onPointerLeave={dock.onPointerLeave}
      onPointerMove={dock.onPointerMove}
      className={cn(
        'flex h-[var(--vlaina-size-56px)] max-w-full items-center gap-3 overflow-x-auto rounded-[var(--vlaina-radius-16px)] px-2 py-1.5 sm:overflow-visible',
        whiteboardFloatingPanelClassName,
      )}
    >
      <WhiteboardToolbarGroup>
        {tools.map((item) => (
          <WhiteboardToolbarButton
            dock
            key={item.id}
            active={props.tool === item.id}
            icon={item.icon}
            indicatorColor={isDrawingTool(item.id) ? props.brushColors[item.id] : undefined}
            label={t(item.labelKey)}
            onClick={() => props.onToolChange(item.id)}
          />
        ))}
      </WhiteboardToolbarGroup>

      {props.panel === 'brush' ? (
        <>
          <PanelDivider />
          <ColorChoices colors={props.brushColors} tool={drawingTool} onChange={props.onBrushColorChange} />
          <PanelDivider />
          <SizeChoices sizes={props.brushSizes} tool={sizeTool} onChange={props.onBrushSizeSelect} />
        </>
      ) : null}

      {props.panel === 'eraser' && props.tool === 'stroke-eraser' ? (
        <>
          <PanelDivider />
          <SizeChoices sizes={props.brushSizes} tool="stroke-eraser" onChange={props.onBrushSizeSelect} />
        </>
      ) : null}
    </div>
  );
}

function ColorChoices({ colors, tool, onChange }: {
  colors: WhiteboardBrushColors;
  tool: WhiteboardDrawingTool;
  onChange: (tool: WhiteboardDrawingTool, color: string) => void;
}) {
  const selectedColor = colors[tool].toLowerCase();
  return (
    <WhiteboardToolbarGroup>
      {themeWhiteboardTokens.brushColorSwatches.map((color) => (
        <WhiteboardDockSlot key={color} size="small">
          <button
            type="button"
            aria-label={color}
            aria-pressed={selectedColor === color.toLowerCase()}
            data-whiteboard-dock-visual="true"
            onClick={() => onChange(tool, color)}
            className={cn(
              'size-[var(--vlaina-size-24px)] shrink-0 rounded-[var(--vlaina-radius-circle)] border-2',
              selectedColor === color.toLowerCase()
                ? 'border-[var(--vlaina-color-whiteboard-selected)] shadow-[var(--vlaina-shadow-selection-soft)]'
                : 'border-[var(--vlaina-color-subtle-border-strong)]',
            )}
            style={{ backgroundColor: color }}
          />
        </WhiteboardDockSlot>
      ))}
      <WhiteboardColorPicker color={colors[tool]} onChange={(color) => onChange(tool, color)} />
    </WhiteboardToolbarGroup>
  );
}

function SizeChoices({ sizes, tool, onChange }: {
  sizes: WhiteboardBrushSizes;
  tool: WhiteboardBrushTool;
  onChange: (tool: WhiteboardBrushTool, size: number) => void;
}) {
  const { t } = useI18n();
  return (
    <WhiteboardToolbarGroup>
      {themeWhiteboardTokens.brushSizePresets.map((size) => (
        <WhiteboardDockSlot key={size} size="compact">
          <button
            type="button"
            aria-label={`${t('whiteboard.brushSize')} ${Math.round(size * 100)}%`}
            aria-pressed={sizes[tool] === size}
            data-whiteboard-dock-visual="true"
            onClick={() => onChange(tool, size)}
            className={cn(
              'flex size-[var(--vlaina-size-28px)] shrink-0 items-center justify-center rounded-[var(--vlaina-radius-circle)] transition-colors',
              sizes[tool] === size
                ? 'bg-[var(--vlaina-accent-light)]'
                : 'hover:bg-[var(--vlaina-color-control-hover-bg)]',
            )}
          >
            <span
              data-whiteboard-size-preview={size}
              aria-hidden="true"
              className="rounded-[var(--vlaina-radius-circle)] bg-[var(--vlaina-color-text-primary)]"
              style={{ height: size * themeWhiteboardTokens.brushSizePreviewBasePx, width: size * themeWhiteboardTokens.brushSizePreviewBasePx }}
            />
          </button>
        </WhiteboardDockSlot>
      ))}
    </WhiteboardToolbarGroup>
  );
}

function PanelDivider() {
  return <span className="h-6 w-px shrink-0 bg-[var(--vlaina-color-toolbar-border)]" />;
}

import { memo, useEffect, useRef, useState, type ChangeEvent } from 'react';
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
import { WhiteboardToolPanel, type WhiteboardToolPanelName } from './WhiteboardToolPanel';
import { WhiteboardColorPicker } from './WhiteboardColorPicker';
import {
  WhiteboardDockSlot,
  WhiteboardToolbarButton,
  WhiteboardToolbarGroup,
  whiteboardMainToolbarSurfaceClassName,
} from './WhiteboardToolbarPrimitives';
import { useWhiteboardDockMagnification } from './useWhiteboardDockMagnification';

interface WhiteboardToolbarProps {
  active: boolean;
  brushColors: WhiteboardBrushColors;
  brushSizes: WhiteboardBrushSizes;
  spacePressed: boolean;
  tool: WhiteboardTool;
  onBrushColorChange: (tool: WhiteboardDrawingTool, color: string) => void;
  onBrushSizeSelect: (tool: WhiteboardBrushTool, size: number) => void;
  onImageAdd: (file: File) => void;
  onToolChange: (tool: WhiteboardTool) => void;
}

export const WhiteboardToolbar = memo(function WhiteboardToolbar(props: WhiteboardToolbarProps) {
  const { t } = useI18n();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const dock = useWhiteboardDockMagnification({
    activationResponseMs: themeWhiteboardTokens.toolbarDockActivationResponseMs,
    enabled: props.active,
    maxScale: themeWhiteboardTokens.toolbarDockMagnificationMax,
    pointerResponseMs: themeWhiteboardTokens.toolbarDockPointerResponseMs,
    radiusPx: themeWhiteboardTokens.toolbarDockMagnificationRadiusPx,
  });
  const [openPanel, setOpenPanel] = useState<WhiteboardToolPanelName | null>(null);
  const [lastDrawingTool, setLastDrawingTool] = useState<WhiteboardDrawingTool>('pen');
  const [lastEraserTool, setLastEraserTool] = useState<WhiteboardTool>('select');
  const visualTool = props.spacePressed ? 'hand' : props.tool;
  const drawingActive = isDrawingTool(visualTool);
  const eraserActive = WHITEBOARD_ERASER_TOOLS.some((item) => item.id === visualTool);
  const drawingConfig = WHITEBOARD_DRAWING_TOOLS.find((item) => item.id === (drawingActive ? props.tool : lastDrawingTool))!;
  const eraserConfig = WHITEBOARD_ERASER_TOOLS.find((item) => item.id === (eraserActive ? props.tool : lastEraserTool))!;
  const drawingTool = drawingConfig.id as WhiteboardDrawingTool;
  const sizeTool: WhiteboardBrushTool = props.tool === 'stroke-eraser' ? props.tool : drawingTool;

  useEffect(() => {
    if (isDrawingTool(props.tool)) setLastDrawingTool(props.tool);
    if (WHITEBOARD_ERASER_TOOLS.some((item) => item.id === props.tool)) setLastEraserTool(props.tool);
    setOpenPanel((current) => current && getPanelForTool(props.tool) !== current ? null : current);
  }, [props.tool]);

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) props.onImageAdd(file);
  };
  const handleImageSelect = () => {
    setOpenPanel(null);
    const input = imageInputRef.current;
    if (!input) return;
    input.value = '';
    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker();
        return;
      } catch {
        input.click();
        return;
      }
    }
    input.click();
  };
  const togglePanel = (panel: WhiteboardToolPanelName, active: boolean, fallback: WhiteboardTool) => {
    if (!active) props.onToolChange(fallback);
    setOpenPanel((current) => current === panel ? null : panel);
  };
  const chooseStandaloneTool = (tool: WhiteboardTool) => {
    setOpenPanel(null);
    props.onToolChange(tool);
  };
  const choosePanelTool = (tool: WhiteboardTool) => {
    setOpenPanel(null);
    props.onToolChange(tool);
  };
  const handleBrushColorChange = (tool: WhiteboardDrawingTool, color: string) => {
    setOpenPanel(null);
    props.onBrushColorChange(tool, color);
  };
  const handleBrushSizeSelect = (tool: WhiteboardBrushTool, size: number) => {
    setOpenPanel(null);
    props.onBrushSizeSelect(tool, size);
  };

  if (!props.active) return null;

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 bottom-4 z-[var(--vlaina-z-50)] flex justify-center px-3">
        <div className="app-no-drag pointer-events-auto relative flex max-w-full min-w-0 items-center">
          {openPanel && !props.spacePressed ? (
            <div className="pointer-events-none absolute bottom-full left-1/2 z-[var(--vlaina-z-50)] flex w-max max-w-[var(--vlaina-whiteboard-panel-max-width)] -translate-x-1/2 pb-2">
              <div className="pointer-events-auto w-max max-w-full">
                <WhiteboardToolPanel
                  panel={openPanel}
                  tool={props.tool}
                  onToolChange={choosePanelTool}
                />
              </div>
            </div>
          ) : null}
          <div
            ref={dock.ref}
            data-whiteboard-main-toolbar="true"
            onPointerCancel={dock.onPointerCancel}
            onPointerEnter={dock.onPointerEnter}
            onPointerLeave={dock.onPointerLeave}
            onPointerMove={dock.onPointerMove}
            className={cn(
              'flex h-[var(--vlaina-size-72px)] max-w-[var(--vlaina-whiteboard-toolbar-max-width)] min-w-0 items-center gap-1 overflow-x-auto px-2 sm:overflow-visible',
              whiteboardMainToolbarSurfaceClassName,
            )}
          >
            <WhiteboardToolbarGroup>
              <WhiteboardToolbarButton dock large active={visualTool === 'hand'} icon="whiteboard.hand" label={t('whiteboard.tool.hand')} onClick={() => chooseStandaloneTool('hand')} />
              <WhiteboardToolbarButton dock large partiallyRevealed active={eraserActive} icon={eraserConfig.icon} imageSrc={eraserConfig.imageSrc} label={t(eraserConfig.labelKey)} onClick={() => togglePanel('eraser', eraserActive, lastEraserTool)} />
            </WhiteboardToolbarGroup>
            <WhiteboardToolbarGroup>
              <span className="mx-0.5 h-[var(--vlaina-size-32px)] w-px shrink-0 bg-[var(--vlaina-color-toolbar-border)]" />
              <WhiteboardToolbarButton dock large partiallyRevealed active={drawingActive} icon={drawingConfig.icon} imageSrc={drawingConfig.imageSrc} label={t(drawingConfig.labelKey)} onClick={() => togglePanel('brush', drawingActive, lastDrawingTool)} />
              <WhiteboardToolbarButton dock large icon="whiteboard.image" label={t('whiteboard.addImage')} onClick={handleImageSelect} />
            </WhiteboardToolbarGroup>
            <ToolbarDivider />
            <ColorChoices colors={props.brushColors} tool={drawingTool} onChange={handleBrushColorChange} onOpen={() => setOpenPanel(null)} />
            <ToolbarDivider />
            <SizeChoices sizes={props.brushSizes} tool={sizeTool} onChange={handleBrushSizeSelect} />
          </div>
        </div>
      </div>

      <input ref={imageInputRef} type="file" accept="image/*" className="sr-only" onChange={handleImageChange} />
    </>
  );
});

function getPanelForTool(tool: WhiteboardTool): WhiteboardToolPanelName | null {
  if (isDrawingTool(tool)) return 'brush';
  if (WHITEBOARD_ERASER_TOOLS.some((item) => item.id === tool)) return 'eraser';
  return null;
}

function ColorChoices({ colors, tool, onChange, onOpen }: {
  colors: WhiteboardBrushColors;
  tool: WhiteboardDrawingTool;
  onChange: (tool: WhiteboardDrawingTool, color: string) => void;
  onOpen: () => void;
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
            className="flex size-[var(--vlaina-size-32px)] shrink-0 items-center justify-center rounded-[var(--vlaina-radius-circle)] shadow-none hover:shadow-none"
          >
            <span
              aria-hidden="true"
              className="relative size-[var(--vlaina-size-32px)] rounded-[var(--vlaina-radius-circle)] border border-[var(--vlaina-color-subtle-border-strong)]"
              style={{ backgroundColor: color }}
            >
              {selectedColor === color.toLowerCase() ? (
                <span
                  data-whiteboard-color-selection-ring="true"
                  className="pointer-events-none absolute inset-[var(--vlaina-whiteboard-color-selection-ring-offset)] rounded-[var(--vlaina-radius-circle)] border-2 border-[var(--vlaina-color-whiteboard-selected)] shadow-[var(--vlaina-shadow-selection-soft)]"
                />
              ) : null}
            </span>
          </button>
        </WhiteboardDockSlot>
      ))}
      <WhiteboardColorPicker color={colors[tool]} onChange={(color) => onChange(tool, color)} onOpen={onOpen} />
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
              'flex size-[var(--vlaina-size-36px)] shrink-0 items-center justify-center rounded-[var(--vlaina-radius-circle)] shadow-none transition-colors hover:shadow-none',
              sizes[tool] === size
                ? 'bg-[var(--vlaina-accent-light)]'
                : 'hover:bg-transparent',
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

function ToolbarDivider() {
  return <span className="mx-0.5 h-[var(--vlaina-size-40px)] w-px shrink-0 bg-[var(--vlaina-color-toolbar-border)]" />;
}

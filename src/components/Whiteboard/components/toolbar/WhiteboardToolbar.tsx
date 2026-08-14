import { memo, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { themeWhiteboardTokens } from '@/styles/themeTokens';
import {
  WHITEBOARD_DRAWING_TOOLS,
  WHITEBOARD_ERASER_TOOLS,
  isBrushPanelTool,
  isLinearTool,
  type WhiteboardBrushColors,
  type WhiteboardBrushSizes,
  type WhiteboardBrushPanelTool,
  type WhiteboardStrokeTool,
  type WhiteboardTool,
} from '../../model/whiteboardModel';
import { WHITEBOARD_LINEAR_TOOLS } from '../../model/whiteboardLinear';
import { WhiteboardToolPanel, type WhiteboardToolPanelName } from './WhiteboardToolPanel';
import { WhiteboardColorPicker } from './WhiteboardColorPicker';
import { WhiteboardSelectionColorChoice } from './WhiteboardSelectionColorChoice';
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
  selectionColor: string | null;
  spacePressed: boolean;
  tool: WhiteboardTool;
  onBrushColorChange: (tool: WhiteboardStrokeTool, color: string) => void;
  onBrushSizeSelect: (tool: WhiteboardStrokeTool, size: number) => void;
  onImageAdd: (file: File) => void;
  onSelectionColorCancel: () => void;
  onSelectionColorChange: (color: string) => void;
  onSelectionColorPreviewChange: (color: string) => void;
  onToolChange: (tool: WhiteboardTool) => void;
}

export const WhiteboardToolbar = memo(function WhiteboardToolbar(props: WhiteboardToolbarProps) {
  const { t } = useI18n();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const toolPanelRef = useRef<HTMLDivElement>(null);
  const dock = useWhiteboardDockMagnification({
    activationResponseMs: themeWhiteboardTokens.toolbarDockActivationResponseMs,
    enabled: props.active,
    maxScale: themeWhiteboardTokens.toolbarDockMagnificationMax,
    pointerResponseMs: themeWhiteboardTokens.toolbarDockPointerResponseMs,
    radiusPx: themeWhiteboardTokens.toolbarDockMagnificationRadiusPx,
  });
  const [openPanel, setOpenPanel] = useState<WhiteboardToolPanelName | null>(null);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [lastDrawingTool, setLastDrawingTool] = useState<WhiteboardBrushPanelTool>('pen');
  const visualTool = props.spacePressed ? 'hand' : props.tool;
  const drawingActive = isBrushPanelTool(visualTool);
  const linearActive = isLinearTool(visualTool);
  const autoShapeActive = visualTool === 'autoshape';
  const textActive = visualTool === 'text';
  const drawingConfig = WHITEBOARD_DRAWING_TOOLS.find((item) => item.id === (drawingActive ? props.tool : lastDrawingTool))!;
  const lassoConfig = WHITEBOARD_ERASER_TOOLS.find((item) => item.id === 'select')!;
  const eraserConfig = WHITEBOARD_ERASER_TOOLS.find((item) => item.id === 'eraser')!;
  const drawingTool = drawingConfig.id;
  const styleTool: WhiteboardStrokeTool = autoShapeActive || textActive
    ? 'pen'
    : linearActive ? visualTool : drawingTool;
  const selectionColorActive = visualTool === 'select' && props.selectionColor !== null;

  useEffect(() => {
    if (isBrushPanelTool(props.tool)) setLastDrawingTool(props.tool);
    setOpenPanel((current) => current && getPanelForTool(props.tool) !== current ? null : current);
    if (!drawingActive && !linearActive && !autoShapeActive && !textActive) setColorPickerOpen(false);
  }, [autoShapeActive, drawingActive, linearActive, props.tool, textActive]);

  useEffect(() => {
    if (!openPanel) return undefined;
    const closePanelOutsideToolbar = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (dock.ref.current?.contains(event.target) || toolPanelRef.current?.contains(event.target)) return;
      setOpenPanel(null);
    };
    window.addEventListener('pointerdown', closePanelOutsideToolbar, true);
    return () => window.removeEventListener('pointerdown', closePanelOutsideToolbar, true);
  }, [dock.ref, openPanel]);

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
  const handleBrushColorChange = (tool: WhiteboardStrokeTool, color: string) => {
    setOpenPanel(null);
    props.onBrushColorChange(tool, color);
  };
  const handleBrushSizeSelect = (tool: WhiteboardStrokeTool, size: number) => {
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
              <div ref={toolPanelRef} className="pointer-events-auto w-max max-w-full">
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
            onPointerEnter={(event) => { if (!colorPickerOpen) dock.onPointerEnter(event); }}
            onPointerLeave={dock.onPointerLeave}
            onPointerMove={(event) => { if (!colorPickerOpen) dock.onPointerMove(event); }}
            className={cn(
              'flex h-[var(--vlaina-size-72px)] max-w-[var(--vlaina-whiteboard-toolbar-max-width)] min-w-0 items-center gap-1 overflow-x-auto px-2 sm:overflow-visible',
              whiteboardMainToolbarSurfaceClassName,
            )}
          >
            <WhiteboardToolbarGroup>
              <WhiteboardToolbarButton dock large active={visualTool === 'hand'} icon="whiteboard.hand" label={t('whiteboard.tool.hand')} onClick={() => chooseStandaloneTool('hand')} />
              <WhiteboardToolbarButton dock large partiallyRevealed active={visualTool === 'select'} icon={lassoConfig.icon} imageSrc={lassoConfig.imageSrc} label={t(lassoConfig.labelKey)} onClick={() => chooseStandaloneTool('select')} />
              <WhiteboardToolbarButton dock large partiallyRevealed active={visualTool === 'eraser'} icon={eraserConfig.icon} imageSrc={eraserConfig.imageSrc} label={t(eraserConfig.labelKey)} onClick={() => chooseStandaloneTool('eraser')} />
            </WhiteboardToolbarGroup>
            <WhiteboardToolbarGroup>
              <span className="mx-0.5 h-[var(--vlaina-size-32px)] w-px shrink-0 bg-[var(--vlaina-color-toolbar-border)]" />
              <WhiteboardToolbarButton dock large partiallyRevealed active={drawingActive} icon={drawingConfig.icon} imageSrc={drawingConfig.imageSrc} label={t(drawingConfig.labelKey)} onClick={() => togglePanel('brush', drawingActive, lastDrawingTool)} />
              {WHITEBOARD_LINEAR_TOOLS.map((linearTool) => (
                <WhiteboardToolbarButton key={linearTool.id} dock large active={visualTool === linearTool.id} icon={linearTool.icon} label={t(linearTool.labelKey)} onClick={() => chooseStandaloneTool(linearTool.id)} />
              ))}
              <WhiteboardToolbarButton dock large active={autoShapeActive} icon="whiteboard.autoshape" label={t('whiteboard.tool.autoshape')} onClick={() => chooseStandaloneTool('autoshape')} />
              <WhiteboardToolbarButton dock large active={textActive} icon="whiteboard.text" label={t('whiteboard.tool.text')} onClick={() => chooseStandaloneTool('text')} />
              <WhiteboardToolbarButton dock large icon="whiteboard.image" label={t('whiteboard.addImage')} onClick={handleImageSelect} />
            </WhiteboardToolbarGroup>
            {drawingActive || linearActive || autoShapeActive || textActive ? (
              <>
                <ToolbarDivider />
                <ColorChoices
                  colors={props.brushColors}
                  tool={styleTool}
                  onChange={handleBrushColorChange}
                  onOpen={() => { setOpenPanel(null); setColorPickerOpen(true); dock.onPointerLeave(); }}
                  onClose={() => setColorPickerOpen(false)}
                />
              </>
            ) : selectionColorActive ? (
              <>
                <ToolbarDivider />
                <WhiteboardSelectionColorChoice
                  color={props.selectionColor!}
                  onCancel={props.onSelectionColorCancel}
                  onChange={props.onSelectionColorChange}
                  onPreviewChange={props.onSelectionColorPreviewChange}
                  onOpen={() => { setOpenPanel(null); setColorPickerOpen(true); dock.onPointerLeave(); }}
                  onClose={() => setColorPickerOpen(false)}
                />
              </>
            ) : null}
            <ToolbarDivider />
            <SizeChoices sizes={props.brushSizes} tool={styleTool} onChange={handleBrushSizeSelect} />
          </div>
        </div>
      </div>

      <input ref={imageInputRef} type="file" accept="image/*" className="sr-only" onChange={handleImageChange} />
    </>
  );
});

function getPanelForTool(tool: WhiteboardTool): WhiteboardToolPanelName | null {
  if (isBrushPanelTool(tool)) return 'brush';
  return null;
}

function ColorChoices({ colors, tool, onChange, onClose, onOpen }: {
  colors: WhiteboardBrushColors;
  tool: WhiteboardStrokeTool;
  onChange: (tool: WhiteboardStrokeTool, color: string) => void;
  onClose: () => void;
  onOpen: () => void;
}) {
  return (
    <WhiteboardToolbarGroup>
      <WhiteboardColorPicker
        color={colors[tool]}
        swatches={themeWhiteboardTokens.colorPickerSwatches}
        onChange={(color) => onChange(tool, color)}
        onClose={onClose}
        onOpen={onOpen}
      />
    </WhiteboardToolbarGroup>
  );
}

function SizeChoices({ sizes, tool, onChange }: {
  sizes: WhiteboardBrushSizes;
  tool: WhiteboardStrokeTool;
  onChange: (tool: WhiteboardStrokeTool, size: number) => void;
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

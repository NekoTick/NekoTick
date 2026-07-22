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
import {
  WhiteboardToolbarButton,
  WhiteboardToolbarGroup,
  whiteboardFloatingPanelClassName,
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
  const [openPanel, setOpenPanel] = useState<WhiteboardToolPanelName | null>(() => getPanelForTool(props.tool));
  const [lastDrawingTool, setLastDrawingTool] = useState<WhiteboardDrawingTool>('pen');
  const [lastEraserTool, setLastEraserTool] = useState<WhiteboardTool>('select');
  const visualTool = props.spacePressed ? 'hand' : props.tool;
  const drawingActive = isDrawingTool(visualTool);
  const eraserActive = WHITEBOARD_ERASER_TOOLS.some((item) => item.id === visualTool);
  const drawingConfig = WHITEBOARD_DRAWING_TOOLS.find((item) => item.id === (drawingActive ? props.tool : lastDrawingTool))!;
  const eraserConfig = WHITEBOARD_ERASER_TOOLS.find((item) => item.id === (eraserActive ? props.tool : lastEraserTool))!;

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

  if (!props.active) return null;

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 bottom-4 z-[var(--vlaina-z-50)] flex justify-center px-3">
        <div className="app-no-drag pointer-events-auto relative flex max-w-full min-w-0 items-center">
          {openPanel && !props.spacePressed ? (
            <div className="pointer-events-none absolute bottom-full left-1/2 z-[var(--vlaina-z-50)] flex w-max max-w-[var(--vlaina-whiteboard-panel-max-width)] -translate-x-1/2 pb-2">
              <div className="pointer-events-auto w-max max-w-full">
                <WhiteboardToolPanel
                  brushColors={props.brushColors}
                  brushSizes={props.brushSizes}
                  panel={openPanel}
                  tool={props.tool}
                  onBrushColorChange={props.onBrushColorChange}
                  onBrushSizeSelect={props.onBrushSizeSelect}
                  onToolChange={props.onToolChange}
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
              'flex h-[var(--vlaina-size-56px)] max-w-full min-w-0 items-center gap-1 overflow-visible rounded-[var(--vlaina-radius-16px)] px-1.5',
              whiteboardFloatingPanelClassName,
            )}
          >
            <WhiteboardToolbarGroup>
              <WhiteboardToolbarButton dock large active={visualTool === 'hand'} icon="whiteboard.hand" label={t('whiteboard.tool.hand')} onClick={() => chooseStandaloneTool('hand')} />
              <WhiteboardToolbarButton dock large active={eraserActive} icon={eraserConfig.icon} label={t(eraserConfig.labelKey)} onClick={() => togglePanel('eraser', eraserActive, lastEraserTool)} />
            </WhiteboardToolbarGroup>
            <WhiteboardToolbarGroup>
              <span className="mx-0.5 h-5 w-px shrink-0 bg-[var(--vlaina-color-toolbar-border)]" />
              <WhiteboardToolbarButton dock large active={drawingActive} icon={drawingConfig.icon} indicatorColor={props.brushColors[drawingConfig.id as WhiteboardDrawingTool]} label={t(drawingConfig.labelKey)} onClick={() => togglePanel('brush', drawingActive, lastDrawingTool)} />
              <WhiteboardToolbarButton dock large icon="whiteboard.image" label={t('whiteboard.addImage')} onClick={handleImageSelect} />
            </WhiteboardToolbarGroup>
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

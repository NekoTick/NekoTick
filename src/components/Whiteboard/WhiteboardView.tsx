import { useI18n } from '@/lib/i18n';
import { WhiteboardSurface } from './components/canvas';
import { WhiteboardMoreMenu, WhiteboardToolbar, WhiteboardZoomControls } from './components/toolbar';
import { useWhiteboardController } from './hooks/useWhiteboardController';

interface WhiteboardViewProps {
  active?: boolean;
  onPrimaryContentReady?: () => void;
  onStartupReady?: () => void;
}

export function WhiteboardView({
  active = true,
  onPrimaryContentReady,
  onStartupReady,
}: WhiteboardViewProps) {
  const { t } = useI18n();
  const board = useWhiteboardController({ active, onPrimaryContentReady, onStartupReady });

  return (
    <section
      aria-label={t('app.viewWhiteboard')}
      data-whiteboard-active={active ? 'true' : 'false'}
      className="relative h-full min-h-0 overflow-hidden bg-[var(--vlaina-bg-primary)] text-[var(--vlaina-color-text-primary)]"
    >
      <WhiteboardSurface
        brushCursorColor={board.brushCursorColor}
        brushCursorPoint={board.brushCursorPoint}
        brushCursorSize={board.brushCursorSize}
        brushCursorTool={board.brushCursorTool}
        draftStroke={board.draftStroke}
        elements={board.elements}
        eraserPreview={board.eraserPreview}
        isPanning={board.isPanning}
        movePreview={board.movePreview}
        paperStyle={board.paperStyle}
        selectedElementIds={board.selectedElementIds}
        selectedStrokeIds={board.selectedStrokeIds}
        selectionPath={board.selectionPath}
        spacePressed={board.spacePressed}
        spatialIndex={board.spatialIndex}
        strokes={board.strokes}
        tool={board.tool}
        viewport={board.viewport}
        viewportRef={board.viewportRef}
        onElementPointerDown={board.handleElementPointerDown}
        onImageDrop={board.importImage}
        onPointerCancel={board.finishPointerAction}
        onPointerDown={board.handleViewportPointerDown}
        onPointerLeave={() => board.setBrushCursorPoint(null)}
        onPointerMove={board.handlePointerMove}
        onPointerUp={board.finishPointerAction}
        onSelectionMovePointerDown={board.handleSelectionMovePointerDown}
        onSelectionResizePointerDown={board.handleSelectionResizePointerDown}
        onWheel={board.handleWheel}
      />
      <WhiteboardMoreMenu
        paperStyle={board.paperStyle}
        onCopyImage={board.copyBoardToClipboard}
        onExport={board.exportBoard}
        onPaperStyleChange={board.setPaperStyle}
      />

      <WhiteboardZoomControls
        active={active}
        viewport={board.viewport}
        onFitView={board.fitView}
        onResetView={board.resetView}
        onZoomChange={board.updateZoom}
      />

      <WhiteboardToolbar
        active={active}
        brushColors={board.brushColors}
        brushSizes={board.brushSizes}
        spacePressed={board.spacePressed}
        tool={board.tool}
        onBrushColorChange={board.setBrushColor}
        onBrushSizeSelect={board.setBrushSize}
        onImageAdd={board.importImage}
        onToolChange={board.setTool}
      />
    </section>
  );
}

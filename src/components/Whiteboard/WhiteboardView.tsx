import { useI18n } from '@/lib/i18n';
import { WhiteboardAutoDrawSuggestionStrip } from './components/autodraw';
import { WhiteboardSurface } from './components/canvas';
import { WhiteboardMoreMenu, WhiteboardToolbar, WhiteboardZoomControls } from './components/toolbar';
import { useWhiteboardController } from './hooks/useWhiteboardController';

interface WhiteboardViewProps {
  active?: boolean;
  drawWithTouch?: boolean;
  onPrimaryContentReady?: () => void;
  onStartupReady?: () => void;
}

export function WhiteboardView({
  active = true,
  drawWithTouch = false,
  onPrimaryContentReady,
  onStartupReady,
}: WhiteboardViewProps) {
  const { t } = useI18n();
  const board = useWhiteboardController({
    active,
    drawWithTouch,
    onPrimaryContentReady,
    onStartupReady,
  });

  return (
    <section
      aria-label={t('app.viewWhiteboard')}
      data-whiteboard-active={active ? 'true' : 'false'}
      className="relative h-full min-h-0 overflow-hidden bg-[var(--vlaina-bg-primary)] text-[var(--vlaina-color-text-primary)]"
      onPointerDownCapture={board.handleInputPointerType}
      onPointerMoveCapture={board.handleInputPointerType}
    >
      <WhiteboardSurface
        brushCursorColor={board.brushCursorColor}
        brushCursorPoint={board.brushCursorPoint}
        brushCursorSize={board.brushCursorSize}
        brushCursorTool={board.brushCursorTool}
        draftStroke={board.draftStroke}
        eraserPreview={board.eraserPreview}
        isPanning={board.isPanning}
        movePreview={board.movePreview}
        paperStyle={board.paperStyle}
        renderData={board.renderData}
        resizePreview={board.resizePreview}
        rotationPreview={board.rotationPreview}
        selectionPath={board.selectionPath}
        spacePressed={board.spacePressed}
        tool={board.tool}
        textEditing={board.textEditing}
        viewport={board.viewport}
        viewportRef={board.viewportRef}
        onElementPointerDown={board.handleElementPointerDown}
        onImageDrop={board.importImage}
        onLinearPointPointerDown={board.handleLinearPointPointerDown}
        onDoubleClick={board.handleViewportDoubleClick}
        onPointerCancel={board.finishPointerAction}
        onPointerDown={board.handleViewportPointerDown}
        onPointerLeave={() => board.setBrushCursorPoint(null)}
        onPointerMove={board.handlePointerMove}
        onPointerUp={board.finishPointerAction}
        onSelectionMovePointerDown={board.handleSelectionMovePointerDown}
        onSelectionResizePointerDown={board.handleSelectionResizePointerDown}
        onSelectionRotationPointerDown={board.handleSelectionRotationPointerDown}
        onTextEditingChange={board.updateTextEditing}
        onTextEditingCommit={board.commitTextEditing}
        onWheel={board.handleWheel}
      />
      <WhiteboardMoreMenu
        paperStyle={board.paperStyle}
        onCopyImage={board.copyBoardToClipboard}
        onExport={board.exportBoard}
        onPaperStyleChange={board.setPaperStyle}
      />

      <WhiteboardAutoDrawSuggestionStrip
        suggestions={board.autoDrawSuggestions}
        onChoose={board.chooseAutoDrawSuggestion}
        onDismiss={board.dismissAutoDrawSuggestions}
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
        selectionColor={board.selectedContentColor}
        showBrushSizes={board.penInputDetected}
        spacePressed={board.spacePressed}
        tool={board.tool}
        onBrushColorChange={board.setBrushColor}
        onBrushSizeSelect={board.setBrushSize}
        onImageAdd={board.importImage}
        onSelectionColorCancel={board.cancelSelectedContentColor}
        onSelectionColorChange={board.setSelectedContentColor}
        onSelectionColorPreviewChange={board.previewSelectedContentColor}
        onToolChange={board.setTool}
      />
    </section>
  );
}

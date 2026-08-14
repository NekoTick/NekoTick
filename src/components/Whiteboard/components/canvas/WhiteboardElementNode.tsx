import { memo, type PointerEvent } from 'react';
import { cn } from '@/lib/utils';
import { themeWhiteboardTokens } from '@/styles/themeTokens';
import type { WhiteboardElement, WhiteboardTool } from '../../model/whiteboardModel';

interface WhiteboardElementNodeProps {
  element: WhiteboardElement;
  erasing?: boolean;
  moving?: boolean;
  selected: boolean;
  showSelectionBorder: boolean;
  tool: WhiteboardTool;
  onPointerDown: (event: PointerEvent<HTMLDivElement>, element: WhiteboardElement) => void;
}

export const WhiteboardElementNode = memo(function WhiteboardElementNode({
  element,
  erasing = false,
  moving = false,
  selected,
  showSelectionBorder,
  tool,
  onPointerDown,
}: WhiteboardElementNodeProps) {
  const fontSize = element.fontSize ?? themeWhiteboardTokens.whiteboardTextFontSizePx;
  const lineHeight = element.lineHeight ?? themeWhiteboardTokens.whiteboardTextLineHeight;
  return (
    <div
      data-whiteboard-element="true"
      aria-label={element.text}
      className={cn(
        'absolute select-none',
        element.type === 'image'
          ? 'overflow-hidden rounded-[var(--vlaina-radius-8px)] border bg-[var(--vlaina-color-whiteboard-element)] shadow-[var(--vlaina-shadow-whiteboard-element)]'
          : 'border border-transparent bg-transparent shadow-none',
        tool === 'select'
          ? selected
            ? moving ? 'cursor-grabbing' : 'cursor-grab'
            : 'pointer-events-none cursor-crosshair'
          : 'pointer-events-none',
      )}
      onPointerDown={(event) => onPointerDown(event, element)}
      style={{
        borderColor: showSelectionBorder
          ? 'var(--vlaina-color-whiteboard-selected)'
          : 'transparent',
        height: element.height,
        left: element.x,
        opacity: erasing ? themeWhiteboardTokens.eraserTargetPreviewOpacity : undefined,
        rotate: element.rotation ? `${element.rotation}rad` : undefined,
        top: element.y,
        width: element.width,
      }}
    >
      {element.imageSrc ? (
        <img
          alt={element.text}
          draggable={false}
          src={element.imageSrc}
          className="size-full object-cover"
          style={element.flipX || element.flipY
            ? { transform: `scale(${element.flipX ? -1 : 1}, ${element.flipY ? -1 : 1})` }
            : undefined}
        />
      ) : element.type === 'text' ? (
        <div
          dir="auto"
          data-whiteboard-text="true"
          className="size-full whitespace-pre"
          style={{
            color: element.color,
            fontFamily: themeWhiteboardTokens.whiteboardTextFontFamily,
            fontSize,
            lineHeight,
            transform: element.flipX || element.flipY
              ? `scale(${element.flipX ? -1 : 1}, ${element.flipY ? -1 : 1})`
              : undefined,
            transformOrigin: themeWhiteboardTokens.elementTransformOrigin,
          }}
        >
          {element.text}
        </div>
      ) : null}
    </div>
  );
});

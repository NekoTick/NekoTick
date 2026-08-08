import { useI18n } from '@/lib/i18n';
import { themeWhiteboardTokens } from '@/styles/themeTokens';
import {
  WHITEBOARD_DRAWING_TOOLS,
  WHITEBOARD_ERASER_TOOLS,
  type WhiteboardTool,
} from '../../model/whiteboardModel';
import {
  WhiteboardToolbarButton,
  WhiteboardToolbarGroup,
} from './WhiteboardToolbarPrimitives';
import { useWhiteboardDockMagnification } from './useWhiteboardDockMagnification';

export type WhiteboardToolPanelName = 'brush' | 'eraser';

interface WhiteboardToolPanelProps {
  panel: WhiteboardToolPanelName;
  tool: WhiteboardTool;
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
  const tools = props.panel === 'brush' ? WHITEBOARD_DRAWING_TOOLS : WHITEBOARD_ERASER_TOOLS;

  return (
    <div
      ref={dock.ref}
      data-whiteboard-tool-panel="true"
      onPointerCancel={dock.onPointerCancel}
      onPointerEnter={dock.onPointerEnter}
      onPointerLeave={dock.onPointerLeave}
      onPointerMove={dock.onPointerMove}
      className="flex h-[var(--vlaina-size-120px)] max-w-full items-center overflow-x-auto px-2 py-1.5 sm:overflow-visible"
    >
      <WhiteboardToolbarGroup className="h-full items-end gap-2">
        {tools.map((item) => (
          <WhiteboardToolbarButton
            dock
            key={item.id}
            active={props.tool === item.id}
            icon={item.icon}
            imageSrc={item.imageSrc}
            label={t(item.labelKey)}
            partiallyRevealed
            revealOnHover
            onClick={() => props.onToolChange(item.id)}
          />
        ))}
      </WhiteboardToolbarGroup>
    </div>
  );
}

import { memo, type PointerEvent } from 'react';
import { themeWhiteboardTokens } from '@/styles/themeTokens';
import type { WhiteboardElement, WhiteboardTool } from '../../model/whiteboardModel';
import { WhiteboardElementNode } from './WhiteboardElementNode';

export interface WhiteboardIdLookup {
  has: (id: string) => boolean;
}

interface WhiteboardElementListProps {
  elements: WhiteboardElement[];
  erasingElementIdSet: Set<string>;
  selectedElementIdSet: WhiteboardIdLookup;
  tool: WhiteboardTool;
  moving: boolean;
  transform?: string;
  onElementPointerDown: (event: PointerEvent<HTMLDivElement>, element: WhiteboardElement) => void;
}

export const WhiteboardElementList = memo(function WhiteboardElementList(props: WhiteboardElementListProps) {
  const nodes = props.elements.map((element) => (
    <WhiteboardElementNode
      key={element.id}
      element={element}
      erasing={props.erasingElementIdSet.has(element.id)}
      moving={props.moving}
      selected={props.tool === 'select' && props.selectedElementIdSet.has(element.id)}
      showSelectionBorder={false}
      tool={props.tool}
      onPointerDown={props.onElementPointerDown}
    />
  ));
  return props.transform
    ? <div className="absolute inset-0 overflow-visible" style={{ transform: props.transform, transformOrigin: themeWhiteboardTokens.layerTransformOrigin }}>{nodes}</div>
    : nodes;
});

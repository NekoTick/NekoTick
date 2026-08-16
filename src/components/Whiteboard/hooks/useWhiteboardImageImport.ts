import { useCallback, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { themeWhiteboardTokens } from '@/styles/themeTokens';
import {
  screenPointToBoardPoint,
  type WhiteboardElement,
  type WhiteboardPoint,
  type WhiteboardTool,
  type WhiteboardViewport,
} from '@/components/Whiteboard/model/core/whiteboardModel';
import { useWhiteboardStore } from '../stores/useWhiteboardStore';
import { appendWhiteboardItems } from '@/components/Whiteboard/model/core/whiteboardCollection';

interface WhiteboardImageImportOptions {
  pushHistory: () => void;
  setElements: Dispatch<SetStateAction<WhiteboardElement[]>>;
  setSelectedElementId: Dispatch<SetStateAction<string | null>>;
  setSelectedStrokeIds: Dispatch<SetStateAction<string[]>>;
  setTool: Dispatch<SetStateAction<WhiteboardTool>>;
  viewport: WhiteboardViewport;
  viewportRef: RefObject<HTMLDivElement | null>;
}

export function useWhiteboardImageImport({
  pushHistory,
  setElements,
  setSelectedElementId,
  setSelectedStrokeIds,
  setTool,
  viewport,
  viewportRef,
}: WhiteboardImageImportOptions) {
  const writeActiveAsset = useWhiteboardStore((state) => state.writeActiveAsset);

  return useCallback(async (file: File, clientPoint?: WhiteboardPoint) => {
    const imageSrc = await readImageFile(file);
    const size = await getImageSize(imageSrc);
    const imageAssetPath = await writeActiveAsset(file);
    if (!imageAssetPath) return;
    const rect = viewportRef.current?.getBoundingClientRect();
    const viewportPoint = clientPoint && rect
      ? { x: clientPoint.x - rect.left, y: clientPoint.y - rect.top }
      : { x: (rect?.width ?? 0) / 2, y: (rect?.height ?? 0) / 2 };
    const boardPoint = screenPointToBoardPoint(viewportPoint, viewport);
    const fittedSize = fitImageSize(size.width, size.height);
    const nextElement: WhiteboardElement = {
      height: fittedSize.height,
      id: `wb-image-${crypto.randomUUID()}`,
      imageAssetPath,
      imageSrc,
      text: file.name,
      type: 'image',
      width: fittedSize.width,
      x: Math.round(boardPoint.x - fittedSize.width / 2),
      y: Math.round(boardPoint.y - fittedSize.height / 2),
    };
    pushHistory();
    setElements((current) => appendWhiteboardItems(current, [nextElement]));
    setSelectedElementId(null);
    setSelectedStrokeIds([]);
    setTool('select');
  }, [pushHistory, setElements, setSelectedElementId, setSelectedStrokeIds, setTool, viewport, viewportRef, writeActiveAsset]);
}

function readImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function getImageSize(src: string): Promise<{ height: number; width: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ height: image.naturalHeight, width: image.naturalWidth });
    image.onerror = () => reject(new Error('Whiteboard image import failed'));
    image.src = src;
  });
}

function fitImageSize(width: number, height: number) {
  const maxWidth = themeWhiteboardTokens.imageDefaultWidthPx;
  const maxHeight = themeWhiteboardTokens.imageDefaultHeightPx;
  const scale = Math.min(1, maxWidth / Math.max(1, width), maxHeight / Math.max(1, height));
  return {
    height: Math.max(themeWhiteboardTokens.minElementHeightPx, Math.round(height * scale)),
    width: Math.max(themeWhiteboardTokens.minElementWidthPx, Math.round(width * scale)),
  };
}

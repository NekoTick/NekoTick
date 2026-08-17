import { getElectronBridge } from '@/lib/electron/bridge';
import { rgbToHex } from '@/components/Whiteboard/model/core/whiteboardColor';

export async function sampleAppColor(clientX: number, clientY: number): Promise<string | null> {
  const capturePage = getElectronBridge()?.media?.capturePage;
  if (!capturePage) return null;
  const dataUrl = await capturePage({ x: clientX, y: clientY, width: 1, height: 1 });
  const image = new Image();
  image.src = dataUrl;
  if (typeof image.decode === 'function') await image.decode();
  else await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Captured color pixel could not be decoded.'));
  });
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image, 0, 0, 1, 1);
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
  return rgbToHex({ r, g, b });
}

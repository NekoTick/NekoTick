import { ExcalifontFontFaces } from './Excalifont';
import { XiaolaiFontFaces } from './Xiaolai';
import type { WhiteboardFontFaceDescriptor } from './fontTypes';

registerFontFaces('Excalifont', ExcalifontFontFaces);
registerFontFaces('Xiaolai', XiaolaiFontFaces);

function registerFontFaces(family: string, faces: WhiteboardFontFaceDescriptor[]) {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined') return;
  for (const { descriptors, uri } of faces) {
    document.fonts.add(new FontFace(family, `url(${JSON.stringify(uri)}) format("woff2")`, {
      display: 'swap',
      style: 'normal',
      weight: '400',
      ...descriptors,
    }));
  }
}

import { ImageRun, TextRun, type ParagraphChild } from 'docx';
import { themeExportLayoutTokens } from '@/styles/themeTokens';

type DocxImageType = 'jpg' | 'png' | 'gif' | 'bmp';

export interface DocxImageData {
  data: Uint8Array;
  height: number;
  type: DocxImageType;
  width: number;
}

function decodeBase64(value: string): Uint8Array | null {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

function readJpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    const segmentLength = view.getUint16(offset + 2);
    if (segmentLength < 2 || offset + segmentLength + 2 > bytes.length) return null;
    if (
      (marker >= 0xc0 && marker <= 0xc3)
      || (marker >= 0xc5 && marker <= 0xc7)
      || (marker >= 0xc9 && marker <= 0xcb)
      || (marker >= 0xcd && marker <= 0xcf)
    ) {
      return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
    }
    offset += segmentLength + 2;
  }
  return null;
}

function readImageDimensions(type: DocxImageType, bytes: Uint8Array): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    type === 'png'
    && bytes.length >= 24
    && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value)
  ) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (
    type === 'gif'
    && bytes.length >= 10
    && bytes[0] === 0x47
    && bytes[1] === 0x49
    && bytes[2] === 0x46
    && bytes[3] === 0x38
    && (bytes[4] === 0x37 || bytes[4] === 0x39)
    && bytes[5] === 0x61
  ) {
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  }
  if (type === 'bmp' && bytes.length >= 26 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return { width: Math.abs(view.getInt32(18, true)), height: Math.abs(view.getInt32(22, true)) };
  }
  return type === 'jpg' ? readJpegDimensions(bytes) : null;
}

function parseDocxImageData(url: string): DocxImageData | null {
  const commaIndex = url.indexOf(',');
  if (commaIndex < 0) return null;
  const match = /^data:image\/(png|jpe?g|gif|bmp);base64$/i.exec(url.slice(0, commaIndex));
  if (!match) return null;
  const type: DocxImageType = match[1].toLowerCase() === 'jpeg'
    ? 'jpg'
    : match[1].toLowerCase() as DocxImageType;
  const data = decodeBase64(url.slice(commaIndex + 1));
  if (!data) return null;
  const dimensions = readImageDimensions(type, data);
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) return null;
  return { data, type, ...dimensions };
}

export function createDocxImage(
  url: string,
  alt: string | null | undefined,
  cache: Map<string, DocxImageData | null>,
): ParagraphChild {
  let image = cache.get(url);
  if (image === undefined) {
    image = parseDocxImageData(url);
    cache.set(url, image);
  }
  if (!image) return new TextRun(alt?.trim() || '[Image]');

  const scale = Math.min(
    1,
    themeExportLayoutTokens.docxImageMaxWidth / image.width,
    themeExportLayoutTokens.docxImageMaxHeight / image.height,
  );
  return new ImageRun({
    type: image.type,
    data: image.data,
    transformation: {
      width: Math.max(1, Math.round(image.width * scale)),
      height: Math.max(1, Math.round(image.height * scale)),
    },
    altText: alt?.trim() ? { name: alt, description: alt, title: alt } : undefined,
  });
}

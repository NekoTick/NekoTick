import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const sourcePngPath = path.join(projectRoot, 'public', 'logo.png');
const buildDir = path.join(projectRoot, 'build');
const targetPngPath = path.join(buildDir, 'icon.png');
const targetIcoPath = path.join(buildDir, 'icon.ico');
const targetIcnsPath = path.join(buildDir, 'icon.icns');
const appxAssetsDir = path.join(buildDir, 'appx');
// Tiny icon slots lose character outlines with ImageMagick's default filter.
const iconDownscaleArgs = [
  '-filter',
  'LanczosSharp',
];

function runImageMagick(args) {
  const missingCommandErrors = [];
  const commands = process.platform === 'win32' ? ['magick'] : ['magick', 'convert'];

  for (const command of commands) {
    try {
      execFileSync(command, args, { stdio: 'pipe' });
      return;
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }

      missingCommandErrors.push(error);
    }
  }

  throw missingCommandErrors[0];
}

function pngHasTransparency(pngBytes) {
  if (pngBytes.length < 33 || pngBytes.toString('ascii', 1, 4) !== 'PNG') {
    return false;
  }

  const colorType = pngBytes[25];
  if (colorType === 4 || colorType === 6) {
    return true;
  }

  let offset = 8;
  while (offset + 12 <= pngBytes.length) {
    const chunkLength = pngBytes.readUInt32BE(offset);
    const chunkType = pngBytes.toString('ascii', offset + 4, offset + 8);
    if (chunkType === 'tRNS') return true;
    offset += chunkLength + 12;
  }
  return false;
}

async function writePngBackedIco(pngBytes, targetPath) {
  const headerSize = 6;
  const directorySize = 16;
  const imageOffset = headerSize + directorySize;
  const output = Buffer.alloc(imageOffset + pngBytes.length);

  output.writeUInt16LE(0, 0);
  output.writeUInt16LE(1, 2);
  output.writeUInt16LE(1, 4);
  // ICO stores 256 as 0 in the single-byte width/height fields.
  output[6] = 0;
  output[7] = 0;
  output[8] = 0;
  output[9] = 0;
  output.writeUInt16LE(1, 10);
  output.writeUInt16LE(32, 12);
  output.writeUInt32LE(pngBytes.length, 14);
  output.writeUInt32LE(imageOffset, 18);
  pngBytes.copy(output, imageOffset);

  await writeFile(targetPath, output);
}

async function createTransparentIconSource(sourcePath, targetPath, sourceBytes) {
  try {
    runImageMagick([
      sourcePath,
      '-alpha',
      'on',
      '-fuzz',
      '15%',
      '-fill',
      'none',
      '-draw',
      'color 0,0 floodfill',
      '-background',
      'white',
      '-alpha',
      'background',
      targetPath,
    ]);
    const iconBytes = await readFile(targetPath);
    if (!pngHasTransparency(iconBytes)) {
      throw new Error('Generated icon source does not contain transparency.');
    }
    return iconBytes;
  } catch (error) {
    if (error?.code !== 'ENOENT' && error?.code !== 'EPERM') {
      throw error;
    }
    if (process.platform === 'win32') {
      throw new Error('ImageMagick is required to generate transparent Windows and Store icons.');
    }
    await writeFile(targetPath, sourceBytes);
    console.warn('ImageMagick was unavailable; the source icon background could not be made transparent.');
    return sourceBytes;
  }
}

async function createWindowsIcon(sourcePath, targetPath, pngBytes) {
  // Build a real multi-resolution ICO so Windows can pick the right size
  // instead of scaling a single embedded PNG at runtime.
  try {
    runImageMagick([
      sourcePath,
      '-background',
      'none',
      ...iconDownscaleArgs,
      '-define',
      'icon:auto-resize=256,128,64,48,32,16',
      targetPath,
    ]);
    const icoBytes = await readFile(targetPath);
    const iconCount = icoBytes.length >= 6 ? icoBytes.readUInt16LE(4) : 0;
    if (iconCount < 6) {
      throw new Error(`Generated Windows icon contains only ${iconCount} image sizes.`);
    }
  } catch (error) {
    if (error?.code !== 'ENOENT' && error?.code !== 'EPERM') {
      throw error;
    }

    await writePngBackedIco(pngBytes, targetPath);
    console.warn('ImageMagick was unavailable; generated build/icon.ico from the source PNG instead.');
  }
}

function createIcnsFromPng(pngBytes) {
  const chunkLength = 8 + pngBytes.length;
  const totalLength = 8 + chunkLength;
  const output = Buffer.alloc(totalLength);

  output.write('icns', 0, 'ascii');
  output.writeUInt32BE(totalLength, 4);
  // 1024x1024 PNG payload chunk
  output.write('ic10', 8, 'ascii');
  output.writeUInt32BE(chunkLength, 12);
  pngBytes.copy(output, 16);

  return output;
}

async function createAppxAssets(sourcePath) {
  await mkdir(appxAssetsDir, { recursive: true });
  const assets = [
    ['StoreLogo.png', 50, 50, 50],
    ['Square44x44Logo.png', 44, 44, 44],
    ['Square150x150Logo.png', 150, 150, 150],
    ['Wide310x150Logo.png', 310, 150, 130],
    ['Square44x44Logo.targetsize-16_altform-unplated.png', 16, 16, 16],
    ['Square44x44Logo.targetsize-24_altform-unplated.png', 24, 24, 24],
    ['Square44x44Logo.targetsize-32_altform-unplated.png', 32, 32, 32],
    ['Square44x44Logo.targetsize-44_altform-unplated.png', 44, 44, 44],
    ['Square44x44Logo.targetsize-48_altform-unplated.png', 48, 48, 48],
    ['Square44x44Logo.targetsize-256_altform-unplated.png', 256, 256, 256],
  ];

  try {
    for (const [filename, width, height, iconSize] of assets) {
      const destination = path.join(appxAssetsDir, filename);
      runImageMagick([
        sourcePath,
        '-background',
        'none',
        ...iconDownscaleArgs,
        '-resize',
        `${iconSize}x${iconSize}`,
        '-gravity',
        'center',
        '-extent',
        `${width}x${height}`,
        destination,
      ]);
      if (!pngHasTransparency(await readFile(destination))) {
        throw new Error(`Generated AppX icon does not contain transparency: ${filename}`);
      }
    }
  } catch (error) {
    if (error?.code !== 'ENOENT' && error?.code !== 'EPERM') throw error;
    await rm(appxAssetsDir, { recursive: true, force: true });
    console.warn('ImageMagick was unavailable; electron-builder will use its default AppX assets.');
  }
}

async function createMacIcon(sourcePath, targetPath, pngBytes) {
  if (process.platform !== 'darwin') {
    const resizedPngPath = path.join(buildDir, 'icon-1024.png');
    try {
      runImageMagick([
        sourcePath,
        '-background',
        'none',
        '-resize',
        '1024x1024',
        resizedPngPath,
      ]);
      await writeFile(targetPath, createIcnsFromPng(await readFile(resizedPngPath)));
    } catch (error) {
      if (error?.code !== 'ENOENT' && error?.code !== 'EPERM') {
        throw error;
      }

      await writeFile(targetPath, createIcnsFromPng(pngBytes));
      console.warn('ImageMagick was unavailable; generated build/icon.icns from the source PNG instead.');
    } finally {
      await rm(resizedPngPath, { force: true });
    }
    return;
  }

  const iconsetPath = path.join(buildDir, 'icon.iconset');
  await rm(iconsetPath, { recursive: true, force: true });
  await mkdir(iconsetPath, { recursive: true });

  const iconSizes = [
    ['icon_16x16.png', 16],
    ['icon_16x16@2x.png', 32],
    ['icon_32x32.png', 32],
    ['icon_32x32@2x.png', 64],
    ['icon_128x128.png', 128],
    ['icon_128x128@2x.png', 256],
    ['icon_256x256.png', 256],
    ['icon_256x256@2x.png', 512],
    ['icon_512x512.png', 512],
    ['icon_512x512@2x.png', 1024],
  ];

  try {
    for (const [filename, size] of iconSizes) {
      execFileSync('sips', [
        '-z',
        String(size),
        String(size),
        sourcePath,
        '--out',
        path.join(iconsetPath, filename),
      ], { stdio: 'pipe' });
    }

    execFileSync('iconutil', ['-c', 'icns', iconsetPath, '-o', targetPath], { stdio: 'pipe' });
  } catch (error) {
    if (error?.code !== 'ENOENT' && error?.code !== 'EPERM') {
      throw error;
    }

    await writeFile(targetPath, createIcnsFromPng(pngBytes));
    console.warn('macOS icon tools were unavailable; generated build/icon.icns from the source PNG instead.');
  } finally {
    await rm(iconsetPath, { recursive: true, force: true });
  }
}

async function main() {
  const pngBytes = await readFile(sourcePngPath);
  const iconSourcePath = path.join(buildDir, 'icon-source.png');
  await mkdir(buildDir, { recursive: true });
  const iconBytes = await createTransparentIconSource(sourcePngPath, iconSourcePath, pngBytes);
  await writeFile(targetPngPath, iconBytes);
  await createWindowsIcon(iconSourcePath, targetIcoPath, iconBytes);
  await createMacIcon(iconSourcePath, targetIcnsPath, iconBytes);
  await createAppxAssets(iconSourcePath);
  await rm(iconSourcePath, { force: true });
  console.log(
    `Generated desktop and AppX assets from ${path.relative(projectRoot, sourcePngPath)}`,
  );
}

await main();

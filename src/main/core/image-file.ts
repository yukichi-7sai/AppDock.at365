import fs from 'node:fs/promises';
import path from 'node:path';
import { validateSvg } from '../../shared/svg-image';

export type ImageFileInfo = {
  format: 'png' | 'jpeg' | 'webp' | 'svg';
  width: number;
  height: number;
};

/** Inspect container headers without loading compressed raster payloads into the main process. */
export async function inspectImageFile(file: string, name = file): Promise<ImageFileInfo> {
  const handle = await fs.open(file, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || !stat.size) throw Error('Invalid image file');
    const read = async (offset: number, length: number) => {
      if (offset < 0 || offset + length > stat.size) throw Error('Truncated image');
      const bytes = Buffer.alloc(length);
      if ((await handle.read(bytes, 0, length, offset)).bytesRead !== length)
        throw Error('Truncated image');
      return bytes;
    };
    const prefix = await read(0, Math.min(12, stat.size));
    let format: ImageFileInfo['format'],
      width = 0,
      height = 0;
    if (prefix.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
      format = 'png';
      let ended = false;
      for (let offset = 8; offset + 12 <= stat.size;) {
        const chunk = await read(offset, 8),
          length = chunk.readUInt32BE(0),
          type = chunk.toString('ascii', 4);
        if (type === 'acTL') throw Error('Animated images are not supported');
        if (type === 'IHDR') {
          if (offset !== 8 || length !== 13) throw Error('Invalid PNG header');
          const dimensions = await read(offset + 8, 8);
          width = dimensions.readUInt32BE(0);
          height = dimensions.readUInt32BE(4);
        }
        offset += length + 12;
        if (offset > stat.size) throw Error('Truncated PNG');
        if (type === 'IEND') {
          ended = length === 0;
          break;
        }
      }
      if (!ended) throw Error('Truncated PNG');
    } else if (prefix[0] === 255 && prefix[1] === 216) {
      format = 'jpeg';
      for (let offset = 2; offset < stat.size;) {
        if ((await read(offset++, 1))[0] !== 255) throw Error('Invalid JPEG marker');
        let marker: number;
        do {
          marker = (await read(offset++, 1))[0];
        } while (marker === 255);
        if (marker === 218 || marker === 217) break;
        if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
        const length = (await read(offset, 2)).readUInt16BE(0);
        if (length < 2 || offset + length > stat.size) throw Error('Invalid JPEG segment');
        if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
          if (length < 7) throw Error('Invalid JPEG dimensions');
          const dimensions = await read(offset + 2, 5);
          height = dimensions.readUInt16BE(1);
          width = dimensions.readUInt16BE(3);
        }
        offset += length;
      }
    } else if (
      prefix.toString('ascii', 0, 4) === 'RIFF' &&
      prefix.toString('ascii', 8, 12) === 'WEBP'
    ) {
      format = 'webp';
      const end = prefix.readUInt32LE(4) + 8;
      if (end > stat.size) throw Error('Truncated WebP');
      for (let offset = 12; offset + 8 <= end;) {
        const chunk = await read(offset, 8),
          type = chunk.toString('ascii', 0, 4),
          length = chunk.readUInt32LE(4);
        if (offset + 8 + length > end) throw Error('Truncated WebP');
        if (type === 'ANIM' || type === 'ANMF') throw Error('Animated images are not supported');
        if (type === 'VP8X') {
          if (length !== 10) throw Error('Invalid WebP header');
          const data = await read(offset + 8, 10);
          if (data[0] & 2) throw Error('Animated images are not supported');
          width = data.readUIntLE(4, 3) + 1;
          height = data.readUIntLE(7, 3) + 1;
        } else if (!width && type === 'VP8 ') {
          if (length < 10) throw Error('Invalid WebP frame');
          const data = await read(offset + 8, 10);
          if (!data.subarray(3, 6).equals(Buffer.from([157, 1, 42])))
            throw Error('Invalid WebP frame');
          width = data.readUInt16LE(6) & 16383;
          height = data.readUInt16LE(8) & 16383;
        } else if (!width && type === 'VP8L') {
          if (length < 5) throw Error('Invalid WebP frame');
          const data = await read(offset + 8, 5);
          if (data[0] !== 47) throw Error('Invalid WebP frame');
          const bits = data.readUInt32LE(1);
          width = (bits & 16383) + 1;
          height = ((bits >>> 14) & 16383) + 1;
        }
        offset += 8 + length + (length % 2);
      }
    } else {
      format = 'svg';
      // SVG is text: its complete static-document validation remains mandatory.
      validateSvg(await handle.readFile({ encoding: 'utf8' }));
    }
    const ext = path.extname(name).slice(1).toLowerCase();
    if (!(format === 'jpeg' ? ['jpg', 'jpeg'].includes(ext) : ext === format))
      throw Error('Image extension mismatch');
    if (format !== 'svg' && (!Number.isSafeInteger(width * height) || width <= 0 || height <= 0))
      throw Error('Invalid image dimensions');
    return { format, width, height };
  } finally {
    await handle.close();
  }
}

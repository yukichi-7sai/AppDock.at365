import { hostText } from '../../shared/i18n';
import { svgSource, validateSvg } from '../../shared/svg-image';
import path from 'node:path';
import { imageFilename } from '../../shared/registered-images';
import { RegisteredAssets, type AssetDecoder } from './registered-assets';
export type { DecodedAsset as DecodedImage } from './registered-assets';
export type ImageDecoder = AssetDecoder;
const maxBytes = Number.MAX_SAFE_INTEGER;
export function imageFormat(bytes: Buffer) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpeg';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP')
    return 'webp';
  const text = bytes.toString('utf8');
  if (svgSource(text)) {
    validateSvg(text);
    return 'svg';
  }
  throw Error(hostText('services.registeredImages.selectFormat'));
}

async function validateRegisteredImage(bytes: Buffer, name: string, decode: ImageDecoder) {
  if (!imageFilename(name) || !bytes.length || bytes.length > maxBytes)
    throw Error(hostText('services.registeredImages.sizeFormat'));
  const format = imageFormat(bytes),
    ext = path.extname(name).slice(1).toLowerCase();
  if (!(format === 'jpeg' ? ['jpg', 'jpeg'].includes(ext) : format === ext))
    throw Error(hostText('services.registeredImages.extensionMismatch'));
  // Inspect chunk types, never arbitrary compressed bytes that happen to spell a marker.
  if (format === 'png' || format === 'webp') {
    for (let offset = format === 'png' ? 8 : 12; offset + 8 <= bytes.length;) {
      const length = format === 'png' ? bytes.readUInt32BE(offset) : bytes.readUInt32LE(offset + 4);
      const type = bytes.toString(
        'ascii',
        offset + (format === 'png' ? 4 : 0),
        offset + (format === 'png' ? 8 : 4),
      );
      if (type === 'acTL' || type === 'ANIM')
        throw Error(hostText('services.registeredImages.staticOnly'));
      const next = offset + (format === 'png' ? length + 12 : length + 8 + (length % 2));
      if (!Number.isSafeInteger(next) || next <= offset || next > bytes.length) break;
      offset = next;
    }
  }
  const image = await decode(bytes);
  if (image.width <= 0 || image.height <= 0 || !Number.isSafeInteger(image.width * image.height))
    throw Error(hostText('services.registeredImages.decodeFailed'));
  return image;
}

export class RegisteredImages extends RegisteredAssets {
  constructor(
    directory: string,
    decode: ImageDecoder,
    changed: () => void = () => {},
    assistance?: import('./file-watch-assistance').FileWatchAssistance,
  ) {
    super(
      directory,
      {
        media: 'image',
        assignedDirectory: 'assigned-images',
        maxBytes,
        format: imageFormat,
        validate: (bytes, name) => validateRegisteredImage(bytes, name, decode),
        ...(decode.file
          ? {
              validateFile: (file: string, name: string, active?: () => boolean) =>
                decode.file!(file, 64, name, active),
            }
          : {}),
      },
      changed,
      assistance,
    );
  }
}

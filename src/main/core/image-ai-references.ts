import { hostText } from '../../shared/i18n';
import { imageReferenceMaxBytes } from '../../shared/image-ai';
import { libraryReference, type LibraryRef } from '../../shared/library-assets';
import { ImageAiError, type ImageAdapterImage } from './image-ai-adapter';
import { imageFormat, type RegisteredImages } from './registered-images';

/** Resolve only library references; never accept a caller-supplied URL or absolute path. */
export async function readImageReference(
  images: RegisteredImages,
  ref: LibraryRef,
  active: () => boolean,
): Promise<ImageAdapterImage> {
  try {
    if (!libraryReference(ref, 'image') || !/\.(png|jpe?g|webp)$/i.test(ref.file)) throw Error();
    if (!active()) throw Error();
    await images.refresh(false, [ref.file]);
    if (!active()) throw Error();
    const known = images.entry(ref);
    if (known && known.bytes >= imageReferenceMaxBytes) throw Error();
    const image = await images.read(ref, undefined, { active, cachePreview: false });
    const format = imageFormat(image.bytes);
    if (format === 'svg' || !image.bytes.length || image.bytes.length >= imageReferenceMaxBytes)
      throw Error();
    return { bytes: image.bytes, mimeType: `image/${format}` };
  } catch {
    if (!active()) throw new DOMException('Cancelled', 'AbortError');
    throw new ImageAiError('INVALID_ARGUMENT', hostText('imageAi.referenceInvalid'));
  }
}

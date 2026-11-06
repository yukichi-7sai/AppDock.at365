import { hostText } from '../../shared/i18n';
import { aiObject } from '../../shared/ai';
import { AutomationError } from './appdock-api';
import { imageReferenceMaxBytes, imageReferenceMaxCount } from '../../shared/image-ai';
import type {
  ImageAiConnection,
  ImageGenerationOptions,
  ImageAiCapabilities,
} from '../../shared/image-ai';

export class ImageAiError extends AutomationError {}
export const imageFail = (
  code: string,
  key:
    | 'invalidRequest'
    | 'invalidResponse'
    | 'authentication'
    | 'connectionFailed'
    | 'serverError'
    | 'notConfigured'
    | 'permission'
    | 'missing'
    | 'conflict'
    | 'timeout'
    | 'expired',
): never => {
  throw new ImageAiError(code, hostText(`imageAi.${key}`));
};
export interface ImageAdapterRequest {
  model: string;
  prompt: string;
  options: ImageGenerationOptions;
  referenceImages?: ImageAdapterImage[];
}
export interface ImageAdapterImage {
  bytes: Buffer;
  mimeType: string;
}
export interface ImageAdapter {
  protocol: ImageAiConnection['protocol'];
  capabilities: ImageAiCapabilities;
  validate?(request: ImageAdapterRequest): void;
  generate(
    connection: ImageAiConnection,
    key: string | undefined,
    request: ImageAdapterRequest,
    signal: AbortSignal,
  ): Promise<{ mimeType: string; bytes: Buffer }[]>;
}
/** Provider wire formats stay behind this interface; callers only receive image descriptors. */
export class OpenAiImageAdapter implements ImageAdapter {
  readonly protocol = 'openai-images';
  readonly capabilities: ImageAiCapabilities = {
    textToImage: true,
    imageEditing: true,
    formats: ['png', 'jpeg', 'webp'],
    progress: false,
    cancellation: 'best-effort',
  };
  constructor(private fetcher: typeof fetch = fetch) {}
  validate(request: ImageAdapterRequest) {
    if (Array.from(request.prompt).length > 32000) imageFail('INVALID_ARGUMENT', 'invalidRequest');
    if (
      (request.referenceImages?.length ?? 0) > imageReferenceMaxCount ||
      request.referenceImages?.some(
        (image) =>
          !['image/png', 'image/jpeg', 'image/webp'].includes(image.mimeType) ||
          !image.bytes.length ||
          image.bytes.length >= imageReferenceMaxBytes,
      )
    )
      imageFail('INVALID_ARGUMENT', 'invalidRequest');
  }
  async generate(
    c: ImageAiConnection,
    key: string | undefined,
    request: ImageAdapterRequest,
    signal: AbortSignal,
  ) {
    this.validate(request);
    const { options: o } = request;
    const fields = {
      model: request.model,
      prompt: request.prompt,
      n: o.count,
      size: o.size,
      output_format: o.format,
      quality: o.providerOptions.quality,
      background: o.providerOptions.background,
      ...(o.providerOptions.compression === undefined
        ? {}
        : { output_compression: o.providerOptions.compression }),
    };
    const editing = !!request.referenceImages?.length;
    let body: string | FormData = JSON.stringify(fields);
    if (editing) {
      const form = new FormData();
      for (const [name, value] of Object.entries(fields)) form.append(name, String(value));
      request.referenceImages!.forEach((image, index) => {
        form.append(
          'image[]',
          new Blob([new Uint8Array(image.bytes)], { type: image.mimeType }),
          `image-${index + 1}.${image.mimeType === 'image/jpeg' ? 'jpg' : image.mimeType.slice(6)}`,
        );
      });
      body = form;
    }
    let response: Response | undefined;
    try {
      response = await this.fetcher(
        c.baseUrl + (editing ? '/images/edits' : '/images/generations'),
        {
          method: 'POST',
          redirect: 'error',
          signal,
          headers: {
            ...(!editing ? { 'Content-Type': 'application/json' } : {}),
            ...(key ? { Authorization: 'Bearer ' + key } : {}),
          },
          body,
        },
      );
      if ([401, 403].includes(response.status)) imageFail('IMAGE_AI_AUTH_FAILED', 'authentication');
      if (!response.ok) imageFail('IMAGE_AI_SERVER_ERROR', 'serverError');
      if (
        !(response.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')
      )
        imageFail('IMAGE_AI_INVALID_RESPONSE', 'invalidResponse');
      const value: unknown = await response
        .json()
        .catch(() => imageFail('IMAGE_AI_INVALID_RESPONSE', 'invalidResponse'));
      if (!aiObject(value) || !Array.isArray(value.data) || value.data.length !== o.count)
        return imageFail('IMAGE_AI_INVALID_RESPONSE', 'invalidResponse');
      return value.data.map((item: unknown) => {
        if (
          !aiObject(item) ||
          typeof item.b64_json !== 'string' ||
          !item.b64_json ||
          item.b64_json.length % 4 !== 0 ||
          /[^A-Za-z0-9+/=]/.test(item.b64_json) ||
          /=/.test(item.b64_json.slice(0, -2)) ||
          !/^[A-Za-z0-9+/]{2}$|^[A-Za-z0-9+/]=$|^==$/.test(item.b64_json.slice(-2))
        )
          return imageFail('IMAGE_AI_INVALID_RESPONSE', 'invalidResponse');
        const bytes = Buffer.from(item.b64_json, 'base64');
        if (bytes.toString('base64') !== item.b64_json)
          return imageFail('IMAGE_AI_INVALID_RESPONSE', 'invalidResponse');
        const valid =
          o.format === 'png'
            ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            : o.format === 'jpeg'
              ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
              : bytes.toString('ascii', 0, 4) === 'RIFF' &&
                bytes.toString('ascii', 8, 12) === 'WEBP';
        if (!valid) return imageFail('IMAGE_AI_INVALID_RESPONSE', 'invalidResponse');
        return { bytes, mimeType: 'image/' + o.format };
      });
    } catch (error) {
      if (error instanceof ImageAiError) throw error;
      return imageFail('IMAGE_AI_CONNECTION_FAILED', 'connectionFailed');
    } finally {
      await response?.body?.cancel().catch(() => {});
    }
  }
}

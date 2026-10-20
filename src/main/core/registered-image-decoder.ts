import { BrowserWindow, nativeImage } from 'electron';
import type { DecodedImage } from './registered-images';

let worker: BrowserWindow | undefined;
let ready: Promise<void> | undefined;
let idle: ReturnType<typeof setTimeout> | undefined;
let queue = Promise.resolve();
let stopped = false;

export function stopRegisteredImageDecoder() {
  stopped = true;
  disposeRegisteredImageDecoder();
}

export function disposeRegisteredImageDecoder() {
  clearTimeout(idle);
  const previous = worker;
  worker = undefined;
  ready = undefined;
  if (previous && !previous.isDestroyed()) previous.destroy();
}

// NativeImage on Windows decodes PNG/JPEG. Chromium also decodes static WebP.
// The private, sandboxed renderer receives bytes only and returns small derivatives.
const browserDecode = `(async ({source,edge}) => {
  const image = new Image(); image.src = source; await image.decode();
  const width = image.naturalWidth, height = image.naturalHeight;
  if (!width || !height || width > 8192 || height > 8192 || width * height > 16777216)
    throw new Error('Invalid dimensions');
  const preview = document.createElement('canvas');
  const scale = edge === 64 ? 64 / Math.max(width, height) : Math.min(1, edge / Math.max(width, height));
  preview.width = Math.max(1, Math.round(width * scale));
  preview.height = Math.max(1, Math.round(height * scale));
  preview.getContext('2d').drawImage(image, 0, 0, preview.width, preview.height);
  const circle = document.createElement('canvas'); circle.width = circle.height = 96;
  const context = circle.getContext('2d'); context.beginPath(); context.arc(48,48,48,0,Math.PI*2); context.clip();
  const side = Math.min(width,height);
  context.drawImage(image,(width-side)/2,(height-side)/2,side,side,0,0,96,96);
  return {width,height,thumbnail:preview.toDataURL('image/png'),circle:circle.toDataURL('image/png')};
})`;

function decodeWebP(bytes: Buffer, edge = 64): Promise<DecodedImage> {
  const task = queue.then(async () => {
    if (stopped) throw Error('画像の読み込みを終了しました。');
    clearTimeout(idle);
    if (!worker || worker.isDestroyed()) {
      worker = new BrowserWindow({
        show: false,
        focusable: false,
        skipTaskbar: true,
        width: 1,
        height: 1,
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          offscreen: true,
          backgroundThrottling: false,
          partition: 'registered-image-decoder',
        },
      });
      worker.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      worker.webContents.on('will-navigate', (event) => event.preventDefault());
      const html =
        '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:">';
      ready = worker.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    }
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race<DecodedImage>([
        (async () => {
          await ready;
          return worker!.webContents.executeJavaScript(
            `${browserDecode}(${JSON.stringify({ source: 'data:image/webp;base64,' + bytes.toString('base64'), edge })})`,
          );
        })(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            disposeRegisteredImageDecoder();
            reject(Error('Image decode timeout'));
          }, 15000);
        }),
      ]);
    } catch {
      throw Error('WebP画像を読み込めません。画像の形式・寸法を確認してください。');
    } finally {
      clearTimeout(timeout);
      idle = setTimeout(disposeRegisteredImageDecoder, 1000);
      idle.unref();
    }
  });
  queue = task.then(
    () => {},
    () => {},
  );
  return task;
}

export async function decodeRegisteredImage(bytes: Buffer, edge = 64): Promise<DecodedImage> {
  if (![64, 512, 1024, 2048].includes(edge)) throw Error('画像サイズを確認してください。');
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP')
    return decodeWebP(bytes, edge);
  const source = nativeImage.createFromBuffer(bytes),
    size = source.getSize();
  if (
    source.isEmpty() ||
    size.width > 8192 ||
    size.height > 8192 ||
    size.width * size.height > 16 * 1024 * 1024
  )
    throw Error('画像の寸法を確認してください。');
  const target = edge === 64 ? 64 : Math.min(edge, Math.max(size.width, size.height));
  const thumbnail = source
    .resize(size.width >= size.height ? { width: target } : { height: target })
    .toDataURL();
  const side = Math.min(size.width, size.height);
  const cropped = source
    .crop({
      x: Math.floor((size.width - side) / 2),
      y: Math.floor((size.height - side) / 2),
      width: side,
      height: side,
    })
    .resize({ width: 96, height: 96 });
  const bitmap = cropped.toBitmap();
  for (let y = 0; y < 96; y++)
    for (let x = 0; x < 96; x++) {
      const distance = Math.hypot(x + 0.5 - 48, y + 0.5 - 48);
      bitmap[(y * 96 + x) * 4 + 3] = Math.round(
        bitmap[(y * 96 + x) * 4 + 3] * Math.max(0, Math.min(1, 48 - distance)),
      );
    }
  return {
    ...size,
    thumbnail,
    circle: nativeImage.createFromBitmap(bitmap, { width: 96, height: 96 }).toDataURL(),
  };
}

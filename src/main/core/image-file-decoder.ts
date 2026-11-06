import { BrowserWindow, session } from 'electron';
import { inspectImageFile } from './image-file';
import { ImageFileSources } from './image-file-source';
import type { DecodedImage } from './registered-images';
import { hostText } from '../../shared/i18n';
import { LibraryReadCancelled } from './registered-assets';

const origin = 'https://appdock-image.invalid/';
const sources = new ImageFileSources(origin);
let worker: BrowserWindow | undefined, ready: Promise<void> | undefined;
let registered = false,
  stopped = false;
let idle: ReturnType<typeof setTimeout> | undefined;
let queue: Promise<unknown> = Promise.resolve();

export function disposeImageFileDecoder(stop = false) {
  if (stop) stopped = true;
  clearTimeout(idle);
  const previous = worker;
  worker = undefined;
  ready = undefined;
  if (previous && !previous.isDestroyed()) previous.destroy();
}

const decode = `(async ({url,edge,info}) => {
  let image, bitmap;
  const dimensions = (width,height) => {
    if (!Number.isSafeInteger(width*height) || width<=0 || height<=0) throw new Error('Invalid dimensions');
    return {width,height};
  };
  try {
    let width=info.width, height=info.height;
    if (info.format==='svg') {
      image=new Image(); image.crossOrigin='anonymous'; image.src=url; await image.decode();
      ({width,height}=dimensions(image.naturalWidth,image.naturalHeight));
    } else {
      dimensions(width,height);
      const scale=edge===0?1:Math.min(1,Math.max(edge,96)/Math.max(width,height));
      const response=await fetch(url,{cache:'no-store',credentials:'omit'});
      if(!response.ok) throw new Error('Image unavailable');
      bitmap=await createImageBitmap(await response.blob(),{
        resizeWidth:Math.max(1,Math.round(width*scale)),resizeHeight:Math.max(1,Math.round(height*scale)),
        resizeQuality:'high',imageOrientation:'none'
      });
      image=bitmap;
    }
    const scale=edge===0?1:edge===64||info.format==='svg'?edge/Math.max(width,height):Math.min(1,edge/Math.max(width,height));
    const preview=document.createElement('canvas');
    preview.width=Math.max(1,Math.round(width*scale)); preview.height=Math.max(1,Math.round(height*scale));
    const context=preview.getContext('2d'); context.imageSmoothingQuality='high';
    context.drawImage(image,0,0,preview.width,preview.height);
    const circle=document.createElement('canvas'); circle.width=circle.height=96;
    const round=circle.getContext('2d'); round.imageSmoothingQuality='high';
    round.beginPath(); round.arc(48,48,48,0,Math.PI*2); round.clip();
    const w=bitmap?bitmap.width:width,h=bitmap?bitmap.height:height,side=Math.min(w,h);
    round.drawImage(image,(w-side)/2,(h-side)/2,side,side,0,0,96,96);
    const result={width,height,thumbnail:preview.toDataURL('image/png'),circle:circle.toDataURL('image/png')};
    if(!result.thumbnail.startsWith('data:image/png;base64,') || !result.circle.startsWith('data:image/png;base64,'))
      throw new Error('Image cannot be rendered at this size');
    preview.width=preview.height=circle.width=circle.height=1;
    return result;
  } finally { if(bitmap) bitmap.close(); else if(image) image.src=''; }
})`;

/** Only small derivatives cross IPC. Source photos stay in the isolated decoder process. */
export function decodeRegisteredImageFile(
  file: string,
  edge = 64,
  name = file,
  active = () => true,
  hash?: string,
): Promise<DecodedImage> {
  if (![0, 64, 512, 1024, 2048].includes(edge))
    return Promise.reject(Error(hostText('services.registeredImageDecoder.invalidSize')));
  const task = queue.then(async () => {
    if (stopped || !active()) throw Error(hostText('services.registeredImageDecoder.closed'));
    const info = await inspectImageFile(file, name);
    if (!active()) throw Error(hostText('services.registeredImageDecoder.closed'));
    const source = await sources.open(
      file,
      'image/' + (info.format === 'svg' ? 'svg+xml' : info.format),
      hash,
      active,
    );
    clearTimeout(idle);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (!worker || worker.isDestroyed()) {
        const isolated = session.fromPartition('registered-image-file-decoder', { cache: false });
        if (!registered) {
          isolated.protocol.handle('https', (request) => sources.response(request));
          isolated.setPermissionRequestHandler((_contents, _permission, reply) => reply(false));
          registered = true;
        }
        worker = new BrowserWindow({
          show: false,
          focusable: false,
          skipTaskbar: true,
          width: 1,
          height: 1,
          webPreferences: {
            session: isolated,
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            offscreen: true,
            backgroundThrottling: false,
          },
        });
        worker.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
        worker.webContents.on('will-navigate', (event) => event.preventDefault());
        ready = worker.loadURL(
          'data:text/html,' +
            encodeURIComponent(
              `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${origin}; connect-src ${origin}"><title>AppDock Image Decoder</title>`,
            ),
        );
      }
      const current = worker;
      const result = await Promise.race([
        (async () => {
          await ready;
          return current.webContents.executeJavaScript(
            `${decode}(${JSON.stringify({ url: source.url, edge, info })})`,
          ) as Promise<DecodedImage>;
        })(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            disposeImageFileDecoder();
            reject(Error('Image decode timeout'));
          }, 30000);
        }),
      ]);
      if (!active()) throw Error(hostText('services.registeredImageDecoder.closed'));
      return result;
    } finally {
      clearTimeout(timer);
      await source.close();
      idle = setTimeout(() => disposeImageFileDecoder(), 1000);
      idle.unref();
    }
  });
  queue = task.then(
    () => {},
    () => {},
  );
  return task.catch(() => {
    if (stopped || !active())
      throw new LibraryReadCancelled(hostText('services.registeredImageDecoder.closed'));
    throw Error(hostText('services.registeredImages.decodeFailed'));
  });
}

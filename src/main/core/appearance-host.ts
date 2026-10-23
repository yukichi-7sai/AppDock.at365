import { hostText } from '../../shared/i18n';
import type { IpcMain, WebContents } from 'electron';
import {
  defaultAccentColor,
  resolveAppearance,
  type AppearanceSnapshot,
} from '../../shared/appearance';

let read = () => resolveAppearance(defaultAccentColor, false);
let current = read();
let signature = '';
const surfaces = new Map<WebContents, string>();
export function appearanceSnapshot(): AppearanceSnapshot {
  const next = read();
  const key = JSON.stringify([next.palette, next.dark, next.colors]);
  if (key !== signature) {
    signature = key;
    current = { ...next, revision: current.revision + 1 };
  }
  return current;
}
export function configureAppearance(reader: typeof read, ipc: Pick<IpcMain, 'handle'>) {
  read = reader;
  ipc.handle('appearance:snapshot', (event) => {
    if (
      event.senderFrame !== event.sender.mainFrame ||
      surfaces.get(event.sender) !== event.senderFrame?.url
    )
      throw Error(hostText('services.appearanceHost.unauthorizedSurface'));
    return appearanceSnapshot();
  });
}
export function appearanceArguments(): string[] {
  return ['--appdock-appearance=' + encodeURIComponent(JSON.stringify(appearanceSnapshot()))];
}
export function registerAppearance(contents: WebContents, url: string) {
  if (!url.startsWith('file:') && !url.startsWith('appdock://host/'))
    throw Error(hostText('services.appearanceHost.localOnly'));
  surfaces.set(contents, url);
  contents.once('destroyed', () => surfaces.delete(contents));
  // Reloads must receive current colors, even if their creation arguments are older.
  contents.on('dom-ready', () => {
    if (!contents.isDestroyed() && contents.getURL() === url)
      contents.send('appearance:changed', appearanceSnapshot());
  });
}
let publishedRevision = -1;
export function refreshAppearance() {
  const value = appearanceSnapshot();
  if (value.revision === publishedRevision) return;
  publishedRevision = value.revision;
  for (const [contents, url] of surfaces) {
    if (!contents.isDestroyed() && contents.getURL() === url)
      contents.send('appearance:changed', value);
  }
}

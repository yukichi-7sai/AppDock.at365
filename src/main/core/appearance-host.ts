import { hostText } from '../../shared/i18n';
import { hostResources } from './host-translation-source';
import { themeColors } from './theme-source';
import { accentColorCatalog } from './accent-color-source';
import type { IpcMain, WebContents } from 'electron';
import {
  appletText,
  type AppletLocalizationSnapshot,
  type AppletTextValues,
} from '../../shared/applet-localization';
import {
  defaultAccentColor,
  resolveAppearance,
  scrollbarCss,
  placeholderCss,
  type AppearanceSnapshot,
} from '../../shared/appearance';

let read = () => resolveAppearance(defaultAccentColor, false, 0, undefined, themeColors(false));
let current = read();
let signature = '';
const surfaces = new Map<WebContents, string>();
const appletOwners = new Map<WebContents, string>();
let readAppletLocalization: (id: string) => AppletLocalizationSnapshot | undefined = () =>
  undefined;
function localization(contents: WebContents) {
  const owner = appletOwners.get(contents);
  return owner ? readAppletLocalization(owner) : undefined;
}
export function appearanceSnapshot(): AppearanceSnapshot {
  const next = read();
  const key = JSON.stringify([
    next.palette,
    next.language,
    next.dark,
    next.colors,
    next.theme,
    next.overlayBackground,
    next.overlayShadow,
    next.notificationBannerShadow,
    next.notificationDesktopShadow,
  ]);
  if (key !== signature) {
    signature = key;
    current = { ...next, revision: current.revision + 1 };
  }
  return current;
}
export function configureAppearance(
  reader: typeof read,
  ipc: Pick<IpcMain, 'handle'>,
  translationRoots: string[] = [],
  appletLocalization: typeof readAppletLocalization = () => undefined,
) {
  read = reader;
  readAppletLocalization = appletLocalization;
  ipc.handle('appearance:localization', (event, key?: unknown, values?: unknown) => {
    if (
      event.senderFrame !== event.sender.mainFrame ||
      surfaces.get(event.sender) !== event.senderFrame?.url
    )
      throw Error(hostText('services.appearanceHost.unauthorizedSurface'));
    const snapshot = localization(event.sender);
    if (!snapshot) throw Error(hostText('services.appletLocalization.unavailable'));
    if (key === undefined && values === undefined) return snapshot;
    if (
      typeof key !== 'string' ||
      (values !== undefined &&
        (!values ||
          typeof values !== 'object' ||
          Array.isArray(values) ||
          Object.values(values).some(
            (value) =>
              typeof value !== 'string' && (typeof value !== 'number' || !Number.isFinite(value)),
          )))
    )
      throw Error(hostText('services.hostApi.argumentObject'));
    return appletText(snapshot, key, values as AppletTextValues | undefined);
  });
  ipc.handle('appearance:snapshot', (event, request?: string) => {
    if (
      event.senderFrame !== event.sender.mainFrame ||
      surfaces.get(event.sender) !== event.senderFrame?.url
    )
      throw Error(hostText('services.appearanceHost.unauthorizedSurface'));
    if (request === 'translations') {
      if (!translationRoots.some((root) => event.senderFrame!.url.startsWith(root)))
        throw Error(hostText('services.appearanceHost.unauthorizedSurface'));
      return hostResources;
    }
    if (request === 'accent-colors') return accentColorCatalog;
    return appearanceSnapshot();
  });
}
export function appearanceArguments(): string[] {
  return ['--appdock-appearance=' + encodeURIComponent(JSON.stringify(appearanceSnapshot()))];
}
export function registerAppearance(contents: WebContents, url: string, appletId?: string) {
  if (!url.startsWith('file:') && !url.startsWith('appdock://host/'))
    throw Error(hostText('services.appearanceHost.localOnly'));
  surfaces.set(contents, url);
  if (appletId) appletOwners.set(contents, appletId);
  contents.once('destroyed', () => {
    surfaces.delete(contents);
    appletOwners.delete(contents);
  });
  // Reloads must receive current colors, even if their creation arguments are older.
  contents.on('dom-ready', () => {
    if (!contents.isDestroyed() && contents.getURL() === url) {
      void contents.insertCSS(`${scrollbarCss}\n${placeholderCss}`).catch(() => {
        // A navigation/destruction race is retried on the next registered local document.
      });
      contents.send('appearance:changed', appearanceSnapshot());
    }
  });
}
let publishedRevision = -1;
let publishedLanguage: string | undefined;
export function refreshAppearance() {
  const value = appearanceSnapshot();
  if (value.revision === publishedRevision) return;
  publishedRevision = value.revision;
  const languageChanged = publishedLanguage !== value.language;
  publishedLanguage = value.language;
  for (const [contents, url] of surfaces) {
    if (!contents.isDestroyed() && contents.getURL() === url) {
      contents.send('appearance:changed', value);
      if (languageChanged) {
        const snapshot = localization(contents);
        if (snapshot) contents.send('applet-localization:changed', snapshot);
      }
    }
  }
}

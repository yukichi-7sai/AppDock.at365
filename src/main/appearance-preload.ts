// Compiled once and appended inside an IIFE to each sandboxed local UI preload.
// Keep runtime imports limited to Electron: sandboxed preloads cannot require local modules.
import { contextBridge, ipcRenderer } from 'electron';
import type { AppearanceApi, AppearanceSnapshot } from '../shared/appearance';
import type {
  AppletLocalizationPageApi,
  AppletLocalizationSnapshot,
} from '../shared/applet-localization';

let current: AppearanceSnapshot | undefined;
const listeners = new Set<(value: AppearanceSnapshot) => void>();
function paint() {
  if (!current || !document.documentElement) return;
  const root = document.documentElement;
  root.dataset.theme = current.dark ? 'dark' : 'light';
  root.style.colorScheme = current.dark ? 'dark' : 'light';
  root.dataset.accent = current.palette;
  root.dataset.overlayShadow = current.overlayShadow === false ? 'off' : 'on';
  root.dataset.notificationBannerShadow = current.notificationBannerShadow === false ? 'off' : 'on';
  root.dataset.notificationDesktopShadow =
    current.notificationDesktopShadow === false ? 'off' : 'on';
  const { accent, soft, text, hover } = current.colors;
  const theme = current.theme;
  for (const [name, value] of Object.entries({
    '--bg': theme.background,
    '--rail': theme.rail,
    '--side': theme.sidebar,
    '--panel': theme.panel,
    '--raised': theme.raised,
    '--border': theme.border,
    '--text': theme.text,
    '--muted': theme.muted,
    '--faint': theme.faint,
    '--blue': theme.info,
    '--purple': theme.decoration,
    '--error': theme.error,
    '--warning': theme.warning,
    '--success': theme.success,
    '--destructive': theme.error,
    '--on-error': theme.onError,
    '--shadow-color': theme.shadow,
    '--shadow': '0 20px 70px ' + theme.shadow,
    '--scrim': theme.scrim,
    '--hero': 'color-mix(in srgb, var(--blue) 5%, var(--panel))',
    '--settings-group-background': 'color-mix(in srgb, var(--raised) 20%, var(--panel))',
    '--ribbon-text': theme.text,
    '--appdock-placeholder': theme.placeholder,
    '--appdock-scrollbar-thumb': theme.scrollbar,
    '--accent': accent,
    '--accent-soft': soft,
    '--accent-text': text,
    '--accent-hover': hover,
    '--accent-focus': accent,
    '--appdock-overlay-background':
      current.overlayBackground === 'translucent' ? theme.scrim : 'transparent',
    '--appdock-overlay-filter': current.overlayBackground === 'blur' ? 'blur(2px)' : 'none',
  }))
    for (const element of [root, document.body]) element?.style.setProperty(name, value);
}
function receive(value: AppearanceSnapshot) {
  if (current && value.revision <= current.revision) return;
  current = value;
  paint();
  for (const listener of listeners) listener(value);
}
const argument = process.argv.find((value) => value.startsWith('--appdock-appearance='));
if (argument)
  receive(JSON.parse(decodeURIComponent(argument.slice('--appdock-appearance='.length))));
if (!document.body) {
  const observer = new MutationObserver(() => {
    paint();
    if (document.body) observer.disconnect();
  });
  observer.observe(document, { childList: true, subtree: true });
}
ipcRenderer.on('appearance:changed', (_event, value: AppearanceSnapshot) => receive(value));
const api: AppearanceApi = {
  accentColors: () => ipcRenderer.invoke('appearance:snapshot', 'accent-colors'),
  translations: () => ipcRenderer.invoke('appearance:snapshot', 'translations'),
  snapshot: async () => {
    receive(await ipcRenderer.invoke('appearance:snapshot'));
    return current!;
  },
  onChanged: (callback) => {
    listeners.add(callback);
    return () => listeners.delete(callback);
  },
};
contextBridge.exposeInMainWorld('appdockAppearance', api);
const localizationApi: AppletLocalizationPageApi = {
  snapshot: () => ipcRenderer.invoke('appearance:localization'),
  t: (key, values) => ipcRenderer.invoke('appearance:localization', key, values),
  onChanged: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, value: AppletLocalizationSnapshot) =>
      callback(value);
    ipcRenderer.on('applet-localization:changed', handler);
    return () => ipcRenderer.removeListener('applet-localization:changed', handler);
  },
};
contextBridge.exposeInMainWorld('appdockLocalization', localizationApi);
void api.snapshot().catch(() => {
  /* The next authorized update supplies current colors. */
});

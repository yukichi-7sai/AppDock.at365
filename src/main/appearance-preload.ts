// Compiled once and appended inside an IIFE to each sandboxed local UI preload.
// Keep runtime imports limited to Electron: sandboxed preloads cannot require local modules.
import { contextBridge, ipcRenderer } from 'electron';
import type { AppearanceApi, AppearanceSnapshot } from '../shared/appearance';

let current: AppearanceSnapshot | undefined;
const listeners = new Set<(value: AppearanceSnapshot) => void>();
function paint() {
  if (!current || !document.documentElement) return;
  const root = document.documentElement;
  root.dataset.theme = current.dark ? 'dark' : 'light';
  root.dataset.accent = current.palette;
  const { accent, soft, text, hover } = current.colors;
  for (const [name, value] of Object.entries({
    '--accent': accent,
    '--accent-soft': soft,
    '--accent-text': text,
    '--accent-hover': hover,
    '--accent-focus': accent,
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
void api.snapshot().catch(() => {
  /* The next authorized update supplies current colors. */
});

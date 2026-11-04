import { contextBridge, ipcRenderer } from 'electron';
import type { NotificationBannerApi, NotificationBannerModel } from '../shared/notifications';
const surface = process.argv.includes('--appdock-notification-surface=desktop')
  ? 'desktop'
  : 'banner';
const channel = (name: string) => 'notification-' + surface + ':' + name;
const api: NotificationBannerApi = {
  connect: () => ipcRenderer.invoke(channel('connect')),
  ready: (id) => ipcRenderer.invoke(channel('ready'), id),
  act: (request) => ipcRenderer.invoke(channel('act'), request),
  resize: (height) => ipcRenderer.invoke(channel('resize'), height),
  focusHost: () => ipcRenderer.invoke(channel('focusHost')),
  openCenter: () => ipcRenderer.invoke(channel('openCenter')),
  onChanged: (callback) => {
    const listener = (_: Electron.IpcRendererEvent, model: NotificationBannerModel) =>
      callback(model);
    ipcRenderer.on(channel('changed'), listener);
    return () => ipcRenderer.removeListener(channel('changed'), listener);
  },
};
contextBridge.exposeInMainWorld('appdockNotifications', api);

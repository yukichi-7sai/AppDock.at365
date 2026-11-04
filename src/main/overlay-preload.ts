import { contextBridge, ipcRenderer } from 'electron';
import type { RibbonOverlayApi, RibbonGroupModel } from '../shared/overlays';
const api: RibbonOverlayApi = {
  asset: (id) => ipcRenderer.invoke('overlay:asset', id),

  connect: () => ipcRenderer.invoke('overlay:connect'),
  ready: (session, options) => ipcRenderer.invoke('overlay:ready', session, options),
  act: (action) => ipcRenderer.invoke('overlay:act', action),
  onChanged: (callback) => {
    const handler = (_: Electron.IpcRendererEvent, model: RibbonGroupModel) => callback(model);
    ipcRenderer.on('overlay:changed', handler);
    return () => ipcRenderer.removeListener('overlay:changed', handler);
  },
  onSuspended: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('overlay:suspended', handler);
    return () => ipcRenderer.removeListener('overlay:suspended', handler);
  },
};
contextBridge.exposeInMainWorld('appdockOverlay', api);

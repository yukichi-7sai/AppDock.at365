import { contextBridge, ipcRenderer } from 'electron';
import type { RibbonApi, RibbonView } from '../shared/workspace-ui';
const api: RibbonApi = {
  focusHost: (edge) => ipcRenderer.invoke('ribbon:focusHost', edge),
  onFocus: (callback) => {
    const handler = (_: Electron.IpcRendererEvent, edge: 'first' | 'last') => callback(edge);
    ipcRenderer.on('ribbon:focus', handler);
    return () => ipcRenderer.removeListener('ribbon:focus', handler);
  },
  connect: () => ipcRenderer.invoke('ribbon:connect'),
  ready: (session) => ipcRenderer.invoke('ribbon:ready', session),
  dispose: (session) => ipcRenderer.invoke('ribbon:dispose', session),
  get: () => ipcRenderer.invoke('ribbon:get'),
  asset: (id) => ipcRenderer.invoke('ribbon:asset', id),
  invoke: (request) => ipcRenderer.invoke('ribbon:invoke', request),
  invalidateAnchor: () => ipcRenderer.invoke('ribbon:invalidateAnchor'),
  onChanged: (callback) => {
    const handler = (_: Electron.IpcRendererEvent, snapshot: RibbonView) => callback(snapshot);
    ipcRenderer.on('ribbon:changed', handler);
    return () => ipcRenderer.removeListener('ribbon:changed', handler);
  },
};
contextBridge.exposeInMainWorld('appdockRibbon', api);

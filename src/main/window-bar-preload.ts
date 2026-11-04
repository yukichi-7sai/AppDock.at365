import { contextBridge, ipcRenderer } from 'electron';
import type { WindowBarApi } from '../shared/window-bars';
const subscribe = <T>(channel: string, callback: (value: T) => void) => {
  const listener = (_: Electron.IpcRendererEvent, value: T) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};
const api: WindowBarApi = {
  connect: () => ipcRenderer.invoke('window-bar:connect'),
  ready: (session) => ipcRenderer.invoke('window-bar:ready', session),
  invoke: (request) => ipcRenderer.invoke('window-bar:invoke', request),

  onChanged: (callback) => subscribe('window-bar:changed', callback),
  onFocus: (callback) => subscribe('window-bar:focus', callback),
  focusHost: (edge) => ipcRenderer.invoke('window-bar:focusHost', edge),
  shortcut: (key) => ipcRenderer.invoke('window-bar:shortcut', key),
};
contextBridge.exposeInMainWorld('appdockBar', api);

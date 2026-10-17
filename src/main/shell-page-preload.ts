import { contextBridge, ipcRenderer } from 'electron';
import type { ShellPageApi } from '../shared/shell-pages';
const subscribe = <T>(channel: string, callback: (value: T) => void) => {
  const listener = (_: Electron.IpcRendererEvent, value: T) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};
const api: ShellPageApi = {
  connect: () => ipcRenderer.invoke('shell-page:connect'),
  ready: (session) => ipcRenderer.invoke('shell-page:ready', session),
  act: (action) => ipcRenderer.invoke('shell-page:act', action),
  getSettings: () => ipcRenderer.invoke('shell-page:getSettings'),
  onSettingsChanged: (callback) => subscribe('shell-page:settingsChanged', callback),
  executeCommand: (id) => ipcRenderer.invoke('shell-page:executeCommand', id),
  onChanged: (callback) => subscribe('shell-page:changed', callback),
  onFocus: (callback) => subscribe('shell-page:focus', callback),
  focusHost: (edge) => ipcRenderer.invoke('shell-page:focusHost', edge),
  shortcut: (key) => ipcRenderer.invoke('shell-page:shortcut', key),
};
contextBridge.exposeInMainWorld('appdockPage', api);

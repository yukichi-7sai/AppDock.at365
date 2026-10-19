import { contextBridge, ipcRenderer } from 'electron';
import type { ShellBarApi } from '../shared/shell-bars';
const subscribe = <T>(channel: string, callback: (value: T) => void) => {
  const listener = (_: Electron.IpcRendererEvent, value: T) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};
const api: ShellBarApi = {
  connect: () => ipcRenderer.invoke('shell-bar:connect'),
  ready: (session) => ipcRenderer.invoke('shell-bar:ready', session),
  invoke: (request) => ipcRenderer.invoke('shell-bar:invoke', request),
  getSettings: () => ipcRenderer.invoke('shell-bar:getSettings'),
  onSettingsChanged: (callback) => subscribe('shell-bar:settingsChanged', callback),
  executeCommand: (id) => ipcRenderer.invoke('shell-bar:executeCommand', id),
  onChanged: (callback) => subscribe('shell-bar:changed', callback),
  onFocus: (callback) => subscribe('shell-bar:focus', callback),
  focusHost: (edge) => ipcRenderer.invoke('shell-bar:focusHost', edge),
  shortcut: (key) => ipcRenderer.invoke('shell-bar:shortcut', key),
};
contextBridge.exposeInMainWorld('appdockBar', api);

import { contextBridge, ipcRenderer } from 'electron';
import type { GestureIndicatorApi, GestureIndicatorFrame } from '../shared/gesture-indicator';
const api: GestureIndicatorApi = {
  connect: () => ipcRenderer.invoke('gesture-indicator:connect'),
  measured: (sequence, width, height) =>
    ipcRenderer.send('gesture-indicator:measured', { sequence, width, height }),
  onChanged: (callback) => {
    const listener = (_: Electron.IpcRendererEvent, frame: GestureIndicatorFrame) =>
      callback(frame);
    ipcRenderer.on('gesture-indicator:changed', listener);
    return () => ipcRenderer.removeListener('gesture-indicator:changed', listener);
  },
};
contextBridge.exposeInMainWorld('appdockGestureIndicator', api);

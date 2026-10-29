import { contextBridge, ipcRenderer } from 'electron';
import type { CommandPaletteViewApi, CommandPaletteModel } from '../shared/overlays';
const api: CommandPaletteViewApi = {
  connect: () => ipcRenderer.invoke('palette:connect'),
  ready: (sessionId, modelId) => ipcRenderer.invoke('palette:ready', sessionId, { modelId }),
  act: (action) => ipcRenderer.invoke('palette:act', action),
  onChanged: (callback) => {
    const handler = (_: Electron.IpcRendererEvent, model: CommandPaletteModel) => callback(model);
    ipcRenderer.on('palette:changed', handler);
    return () => ipcRenderer.removeListener('palette:changed', handler);
  },
  onSuspended: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('palette:suspended', handler);
    return () => ipcRenderer.removeListener('palette:suspended', handler);
  },
};
contextBridge.exposeInMainWorld('appdockPalette', api);

import { contextBridge, ipcRenderer } from 'electron';
import type { InputPaletteApi } from '../shared/input-palette';

const api: InputPaletteApi = {
  ready: (session) => ipcRenderer.send('input-palette:ready', session),
  models: (callback) => {
    ipcRenderer.on('input-palette:model', (_e, model) => callback(model));
    ipcRenderer.send('input-palette:connect');
  },
  choose: (session, index) => ipcRenderer.send('input-palette:choose', session, index),
  selected: (callback) =>
    ipcRenderer.on('input-palette:selected', (_e, session: string, index: number) =>
      callback(session, index),
    ),
};
contextBridge.exposeInMainWorld('inputPalette', api);

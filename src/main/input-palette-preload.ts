import { contextBridge, ipcRenderer } from 'electron';
import type { InputPaletteApi } from '../shared/input-palette';

const api: InputPaletteApi = {
  ready: (session, view) => ipcRenderer.send('input-palette:ready', session, view),
  models: (callback) => {
    ipcRenderer.on('input-palette:model', (_e, model) => callback(model));
    ipcRenderer.send('input-palette:connect');
  },
  choose: (session, view, index) => ipcRenderer.send('input-palette:choose', session, view, index),
  manage: (session, view) => ipcRenderer.send('input-palette:manage', session, view),
  scroll: (session, view, top) => ipcRenderer.send('input-palette:scroll', session, view, top),
  captureView: (callback) =>
    ipcRenderer.on('input-palette:capture-view', (_e, session: string, view: number) =>
      callback(session, view),
    ),
  viewState: (session, view, top) =>
    ipcRenderer.send('input-palette:view-state', session, view, top),
  selected: (callback) =>
    ipcRenderer.on('input-palette:selected', (_e, session: string, view: number, index: number) =>
      callback(session, view, index),
    ),
};
contextBridge.exposeInMainWorld('inputPalette', api);

import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('appletPage', {
  snapshot: () => ipcRenderer.invoke('applet-page:snapshot'),
  executeCommand: (id: string) => ipcRenderer.invoke('applet-page:execute', id),
  call: (operation: string, input: unknown = {}) =>
    ipcRenderer.invoke('applet-page:call', operation, input),
  onChanged: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('applet-page:changed', handler);
    return () => ipcRenderer.removeListener('applet-page:changed', handler);
  },
  onVisibilityChanged: (callback: (visible: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, visible: boolean) => callback(visible);
    ipcRenderer.on('applet-page:visibility', handler);
    return () => ipcRenderer.removeListener('applet-page:visibility', handler);
  },
});

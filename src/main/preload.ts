import { contextBridge, ipcRenderer } from 'electron';
import type { DockApi } from '../shared/contracts';
let globalShortcutOwnership = new Set<string>(ipcRenderer.sendSync('dock:shortcutOwnership:get'));
ipcRenderer.on(
  'dock:shortcutOwnership',
  (_event, value: { generation: number; keys: string[] }) => {
    globalShortcutOwnership = new Set(value.keys);
    ipcRenderer.send('dock:shortcutOwnership:ack', value.generation);
  },
);
const api: DockApi = {
  settingsPage: {
    open: (request) => ipcRenderer.invoke('dock:settingsPage:open', request),
    get: (id) => ipcRenderer.invoke('dock:settingsPage:get', id),
    act: (id, action) => ipcRenderer.invoke('dock:settingsPage:act', id, action),
    close: (id) => ipcRenderer.invoke('dock:settingsPage:close', id),
    onChanged: (callback) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        connection: import('../shared/settings-page').SettingsPageConnection,
      ) => callback(connection);
      ipcRenderer.on('dock:settingsPage:changed', listener);
      return () => ipcRenderer.removeListener('dock:settingsPage:changed', listener);
    },
  },
  settingsEditing: () => ipcRenderer.invoke('dock:settingsEditing'),
  flushSettings: () => ipcRenderer.invoke('dock:flushSettings'),
  onSettingsSidebarWidth: (callback) => {
    const listener = (_: Electron.IpcRendererEvent, width: number) => callback(width);
    ipcRenderer.on('dock:settingsSidebarWidth', listener);
    return () => ipcRenderer.removeListener('dock:settingsSidebarWidth', listener);
  },
  editSettings: (request) => ipcRenderer.invoke('dock:editSettings', request),
  onSettingsEditingChanged: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('dock:settingsEditingChanged', handler);
    return () => ipcRenderer.removeListener('dock:settingsEditingChanged', handler);
  },
  onHomeCommandResult: (callback) => {
    const handler = (
      _: Electron.IpcRendererEvent,
      result: import('../shared/shell-pages').HomeCommandResult,
    ) => callback(result);
    ipcRenderer.on('dock:homeCommandResult', handler);
    return () => ipcRenderer.removeListener('dock:homeCommandResult', handler);
  },
  shellPage: (request, bounds) => ipcRenderer.invoke('dock:shellPage', request, bounds),
  closeShellPage: (id) => ipcRenderer.invoke('dock:closeShellPage', id),
  focusShellPage: (id, edge) => ipcRenderer.invoke('dock:focusShellPage', id, edge),
  onShellPageFocusHost: (callback) => {
    const handler = (_: Electron.IpcRendererEvent, id: string, edge: 'before' | 'after') =>
      callback(id, edge);
    ipcRenderer.on('dock:shellPageFocusHost', handler);
    return () => ipcRenderer.removeListener('dock:shellPageFocusHost', handler);
  },
  onLogSourceChanged: (callback) => {
    const handler = (_: Electron.IpcRendererEvent, source: string) => callback(source);
    ipcRenderer.on('dock:logSourceChanged', handler);
    return () => ipcRenderer.removeListener('dock:logSourceChanged', handler);
  },
  onPaletteExecuted: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('dock:paletteExecuted', handler);
    return () => ipcRenderer.removeListener('dock:paletteExecuted', handler);
  },
  focusShell: (edge) => ipcRenderer.invoke('dock:focusShell', edge),
  onShellFocusHost: (callback) => {
    const handler = (_: Electron.IpcRendererEvent, edge: 'before' | 'after') => callback(edge);
    ipcRenderer.on('dock:shellFocusHost', handler);
    return () => ipcRenderer.removeListener('dock:shellFocusHost', handler);
  },
  navigate: (route, restore) => ipcRenderer.invoke('dock:navigate', route, restore),
  shellViewport: (bounds) => ipcRenderer.invoke('dock:shellViewport', bounds),
  retryShell: () => ipcRenderer.invoke('dock:retryShell'),
  setAppletApiPermissions: (permissions) =>
    ipcRenderer.invoke('dock:appletApiPermissions', permissions),
  automation: (action) => ipcRenderer.invoke('dock:automation', action),
  refreshLaunchState: () => ipcRenderer.invoke('dock:refreshLaunchState'),
  restartAsAdministrator: () => ipcRenderer.invoke('dock:restartAsAdministrator'),
  focusNotifications: () => ipcRenderer.invoke('dock:focusNotifications'),
  settingsInputsFlushed: (id) => ipcRenderer.invoke('dock:settingsInputsFlushed', id),
  onFlushSettingsInputs: (callback) => {
    const listener = (_: Electron.IpcRendererEvent, id: string) => callback(id);
    ipcRenderer.on('dock:flushSettingsInputs', listener);
    return () => ipcRenderer.removeListener('dock:flushSettingsInputs', listener);
  },

  webNavigate: (id, action) => ipcRenderer.invoke('dock:webNavigate', id, action),
  clearWebAccount: (id) => ipcRenderer.invoke('dock:clearWebAccount', id),
  createWebAccount: (name) => ipcRenderer.invoke('dock:createWebAccount', name),
  renameWebAccount: (id, name) => ipcRenderer.invoke('dock:renameWebAccount', id, name),
  deleteWebAccount: (id) => ipcRenderer.invoke('dock:deleteWebAccount', id),
  cancelUpdates: () => ipcRenderer.invoke('dock:cancelUpdates'),
  onAppletPage: (callback) => {
    const handler = (_: Electron.IpcRendererEvent, key: string | null) => callback(key);
    ipcRenderer.on('dock:appletPage', handler);
    return () => ipcRenderer.removeListener('dock:appletPage', handler);
  },
  openAppletPage: (extensionId, pageId) =>
    ipcRenderer.invoke('dock:openAppletPage', extensionId, pageId),
  pageViewport: (key, bounds) => ipcRenderer.invoke('dock:pageViewport', key, bounds),
  chooseDirectory: () => ipcRenderer.invoke('dock:chooseDirectory'),
  checkUpdates: (id) => ipcRenderer.invoke('dock:checkUpdates', id),
  checkAllUpdates: () => ipcRenderer.invoke('dock:checkAllUpdates'),
  installUpdates: (target) => ipcRenderer.invoke('dock:installUpdates', target),
  openReleases: (id) => ipcRenderer.invoke('dock:openReleases', id),
  startExtensionNow: (id) => ipcRenderer.invoke('dock:startExtensionNow', id),
  dispatchShortcut: (key) => ipcRenderer.invoke('dock:dispatchShortcut', key),
  retryGlobalHotKeys: () => ipcRenderer.invoke('dock:retryGlobalHotKeys'),
  setShortcutRecording: (recording) => ipcRenderer.invoke('dock:setShortcutRecording', recording),
  setShortcutCapture: (request) => ipcRenderer.invoke('dock:setShortcutCapture', request),
  ownsGlobalShortcut: (key) => globalShortcutOwnership.has(key),
  onShortcutCaptured: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      value: { token: string; key: string; sequence: number },
    ) => callback(value);
    ipcRenderer.on('dock:shortcutCaptured', listener);
    return () => {
      ipcRenderer.removeListener('dock:shortcutCaptured', listener);
    };
  },
  onHostCommand: (callback) => {
    const handler = (_: Electron.IpcRendererEvent, id: string) => callback(id);
    ipcRenderer.on('dock:hostCommand', handler);
    return () => ipcRenderer.removeListener('dock:hostCommand', handler);
  },
  snapshot: () => ipcRenderer.invoke('dock:snapshot'),
  saveSettings: (value, revision, avatar, avatarName) =>
    ipcRenderer.invoke('dock:saveSettings', value, revision, avatar, avatarName),
  restoreSettingsBackup: (revision) => ipcRenderer.invoke('dock:restoreSettingsBackup', revision),
  setPinnedCommands: (ids) => ipcRenderer.invoke('dock:setPinnedCommands', ids),
  openCommandPalette: (request) => ipcRenderer.invoke('dock:openCommandPalette', request),
  cancelCommandPalette: (requestId) => ipcRenderer.invoke('dock:cancelCommandPalette', requestId),
  toggleExtension: (id, enabled) => ipcRenderer.invoke('dock:toggleExtension', id, enabled),
  restartExtension: (id) => ipcRenderer.invoke('dock:restartExtension', id),
  executeCommand: (id) => ipcRenderer.invoke('dock:executeCommand', id),
  executePanelAction: (id, actionId) => ipcRenderer.invoke('dock:executePanelAction', id, actionId),
  openPath: (kind) => ipcRenderer.invoke('dock:openPath', kind),
  windowAction: (action) => ipcRenderer.invoke('dock:windowAction', action),
  onChanged: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('dock:changed', handler);
    return () => ipcRenderer.removeListener('dock:changed', handler);
  },
};
contextBridge.exposeInMainWorld('dock', api);

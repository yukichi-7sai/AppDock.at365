import { contextBridge, ipcRenderer } from 'electron';
import type { DockApi } from '../shared/contracts';
// Track host dialogs without capturing or hiding the independent host views.
window.addEventListener('DOMContentLoaded', () => {
  let state = 'none';
  const update = () => {
    const focused = document.activeElement?.closest('dialog:modal');
    // Disabling all controls during submission can move focus to the document body.
    const modal = focused ?? Array.from(document.querySelectorAll('dialog:modal')).at(-1);
    const canConfirm =
      document.hasFocus() && !!modal?.querySelector('button[aria-keyshortcuts="Control+Enter"]');
    const next = canConfirm ? 'confirm' : modal ? 'open' : 'none';
    if (next === state) return;
    state = next;
    void ipcRenderer.invoke('dock:hostModal', state).catch(() => {});
  };
  document.addEventListener('focusin', update);
  window.addEventListener('focus', update);
  window.addEventListener('blur', update);
  new MutationObserver(update).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['open'],
  });
  update();
});

let globalShortcutOwnership = new Set<string>(ipcRenderer.sendSync('dock:shortcutOwnership:get'));
ipcRenderer.on(
  'dock:shortcutOwnership',
  (_event, value: { generation: number; keys: string[] }) => {
    globalShortcutOwnership = new Set(value.keys);
    ipcRenderer.send('dock:shortcutOwnership:ack', value.generation);
  },
);
const api: DockApi = {
  onOverlayState: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      state: import('../shared/contracts').HostSnapshot['overlay'],
    ) => callback(state);
    ipcRenderer.on('dock:overlayState', listener);
    return () => ipcRenderer.removeListener('dock:overlayState', listener);
  },
  overlayViewport: (bounds) => ipcRenderer.invoke('dock:overlayViewport', bounds),
  soundGeneration: {
    onChanged: (callback) => {
      let live = true,
        received = false;
      const listener = (
        _event: Electron.IpcRendererEvent,
        model: import('../shared/sound-generation').SoundGenerationModel | null,
      ) => {
        received = true;
        if (live) callback(model);
      };
      ipcRenderer.on('dock:soundGeneration:changed', listener);
      void ipcRenderer.invoke('dock:soundGeneration:pending').then((model) => {
        if (live && !received) callback(model);
      });
      return () => {
        live = false;
        ipcRenderer.removeListener('dock:soundGeneration:changed', listener);
      };
    },
    act: (id, action) => ipcRenderer.invoke('dock:soundGeneration:act', id, action),
  },
  imageLibraryDialog: {
    onRequest: (callback) => {
      let live = true;
      const listener = (
        _event: Electron.IpcRendererEvent,
        request: import('../shared/image-library-page').ImageLibraryDialogRequest | null,
      ) => {
        if (live) callback(request);
      };
      ipcRenderer.on('dock:imageLibraryDialog', listener);
      void ipcRenderer.invoke('dock:imageLibraryDialog:pending').then((request) => {
        if (live && request) callback(request);
      });
      return () => {
        live = false;
        ipcRenderer.removeListener('dock:imageLibraryDialog', listener);
      };
    },
    complete: (id, operation) =>
      ipcRenderer.invoke('dock:imageLibraryDialog:complete', id, operation),
  },
  imageLibrary: {
    snapshot: () => ipcRenderer.invoke('dock:imageLibrary:snapshot'),
    register: () => ipcRenderer.invoke('dock:imageLibrary:register'),
    retain: (image) => ipcRenderer.invoke('dock:imageLibrary:retain', image),
    edit: (operation) => ipcRenderer.invoke('dock:imageLibrary:edit', operation),
    createImageSession: () => ipcRenderer.invoke('dock:imageLibrary:createImageSession'),
    releaseImageSession: (session) =>
      ipcRenderer.invoke('dock:imageLibrary:releaseImageSession', session),
    preview: (image, original, session) =>
      ipcRenderer.invoke('dock:imageLibrary:preview', image, original, session),
    galleryImage: (image, generation, edge, session) =>
      ipcRenderer.invoke('dock:imageLibrary:galleryImage', image, generation, edge, session),
    galleryView: () => ipcRenderer.invoke('dock:imageLibrary:galleryView'),
    saveGalleryWidth: (value) => ipcRenderer.invoke('dock:imageLibrary:saveGalleryWidth', value),
    saveGalleryLayout: (value) => ipcRenderer.invoke('dock:imageLibrary:saveGalleryLayout', value),
    pick: (current) => ipcRenderer.invoke('dock:imageLibrary:pick', current),
    onChanged: (callback) => {
      const listener = () => callback();
      ipcRenderer.on('dock:changed', listener);
      return () => ipcRenderer.removeListener('dock:changed', listener);
    },
    onPickRequest: (callback) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        request: {
          id: string;
          current: import('../shared/registered-images').RegisteredImageRef | null;
        } | null,
      ) => callback(request);
      ipcRenderer.on('dock:imagePick', listener);
      void ipcRenderer.invoke('dock:imagePick:pending').then((request) => {
        if (request) callback(request);
      });
      return () => ipcRenderer.removeListener('dock:imagePick', listener);
    },
    completePick: (id, result) => ipcRenderer.invoke('dock:imagePick:complete', id, result),
    onPickBackdrop: (callback) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        surfaces: Parameters<typeof callback>[0],
      ) => callback(surfaces);
      ipcRenderer.on('dock:imagePickerBackdrop', listener);
      return () => ipcRenderer.removeListener('dock:imagePickerBackdrop', listener);
    },
  },
  soundLibrary: {
    media: 'sound',
    play: (ref) => ipcRenderer.invoke('dock:soundLibrary:play', ref),
    stop: () => ipcRenderer.invoke('dock:soundLibrary:stop'),
    snapshot: () => ipcRenderer.invoke('dock:soundLibrary:snapshot'),
    register: () => ipcRenderer.invoke('dock:soundLibrary:register'),
    retain: (image) => ipcRenderer.invoke('dock:soundLibrary:retain', image),
    edit: (operation) => ipcRenderer.invoke('dock:soundLibrary:edit', operation),
    createImageSession: () => ipcRenderer.invoke('dock:soundLibrary:createImageSession'),
    releaseImageSession: (session) =>
      ipcRenderer.invoke('dock:soundLibrary:releaseImageSession', session),
    preview: (image, original, session) =>
      ipcRenderer.invoke('dock:soundLibrary:preview', image, original, session),
    galleryImage: (image, generation, edge, session) =>
      ipcRenderer.invoke('dock:soundLibrary:galleryImage', image, generation, edge, session),
    galleryView: () => ipcRenderer.invoke('dock:soundLibrary:galleryView'),
    saveGalleryWidth: (value) => ipcRenderer.invoke('dock:soundLibrary:saveGalleryWidth', value),
    saveGalleryLayout: (value) => ipcRenderer.invoke('dock:soundLibrary:saveGalleryLayout', value),
    pick: (current) => ipcRenderer.invoke('dock:soundLibrary:pick', current),
    onChanged: (callback) => {
      const listener = () => callback();
      ipcRenderer.on('dock:changed', listener);
      return () => ipcRenderer.removeListener('dock:changed', listener);
    },
    onPickRequest: (callback) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        request: {
          id: string;
          current: import('../shared/registered-images').RegisteredImageRef | null;
        } | null,
      ) => callback(request);
      ipcRenderer.on('dock:soundPick', listener);
      void ipcRenderer.invoke('dock:soundPick:pending').then((request) => {
        if (request) callback(request);
      });
      return () => ipcRenderer.removeListener('dock:soundPick', listener);
    },
    completePick: (id, result) => ipcRenderer.invoke('dock:soundPick:complete', id, result),
  },
  settingsPage: {
    navigate: (id, request) => ipcRenderer.invoke('dock:settingsPage:navigate', id, request),
    index: () => ipcRenderer.invoke('dock:settingsPage:index'),
    open: (request) => ipcRenderer.invoke('dock:settingsPage:open', request),
    get: (id) => ipcRenderer.invoke('dock:settingsPage:get', id),
    act: (id, action) => ipcRenderer.invoke('dock:settingsPage:act', id, action),
    input: (id, request) => ipcRenderer.invoke('dock:settingsPage:input', id, request),
    palette: (id, request) => ipcRenderer.invoke('dock:settingsPage:palette', id, request),
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
  pages: {
    open: (request) => ipcRenderer.invoke('dock:pages:open', request),
    get: (id) => ipcRenderer.invoke('dock:pages:get', id),
    act: async (action) => {
      const result = await ipcRenderer.invoke('dock:pages:act', action);
      // Keep cancelled requests rejected in the renderer without reporting an IPC failure.
      if (action.type === 'gallery' && result?.pageClosed)
        throw Error('Host page connection is stale');
      return result;
    },
    close: (id) => ipcRenderer.invoke('dock:pages:close', id),
    onChanged: (callback) => {
      const handler = (
        _: Electron.IpcRendererEvent,
        model: import('../shared/host-pages').HostPageModel,
      ) => callback(model);
      ipcRenderer.on('dock:pages:changed', handler);
      return () => ipcRenderer.removeListener('dock:pages:changed', handler);
    },
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
  focusRibbon: (edge) => ipcRenderer.invoke('dock:focusRibbon', edge),
  onRibbonFocusHost: (callback) => {
    const handler = (_: Electron.IpcRendererEvent, edge: 'before' | 'after') => callback(edge);
    ipcRenderer.on('dock:ribbonFocusHost', handler);
    return () => ipcRenderer.removeListener('dock:ribbonFocusHost', handler);
  },
  navigate: (route, restore) => ipcRenderer.invoke('dock:navigate', route, restore),
  ribbonViewport: (bounds) => ipcRenderer.invoke('dock:ribbonViewport', bounds),
  setAppletApiPermissions: (permissions, before) =>
    ipcRenderer.invoke('dock:appletApiPermissions', permissions, before),
  automation: (action) => ipcRenderer.invoke('dock:automation', action),
  refreshLaunchState: () => ipcRenderer.invoke('dock:refreshLaunchState'),
  restartAsAdministrator: () => ipcRenderer.invoke('dock:restartAsAdministrator'),
  settingsInputsFlushed: (id) => ipcRenderer.invoke('dock:settingsInputsFlushed', id),
  onFlushSettingsInputs: (callback) => {
    const listener = (_: Electron.IpcRendererEvent, id: string) => callback(id);
    ipcRenderer.on('dock:flushSettingsInputs', listener);
    return () => ipcRenderer.removeListener('dock:flushSettingsInputs', listener);
  },

  webNavigate: (id, action) => ipcRenderer.invoke('dock:webNavigate', id, action),
  clearWebAccount: (id, confirmed) => ipcRenderer.invoke('dock:clearWebAccount', id, confirmed),
  createWebAccount: (name) => ipcRenderer.invoke('dock:createWebAccount', name),
  renameWebAccount: (id, name) => ipcRenderer.invoke('dock:renameWebAccount', id, name),
  deleteWebAccount: (id, confirmed) => ipcRenderer.invoke('dock:deleteWebAccount', id, confirmed),
  cancelUpdates: () => ipcRenderer.invoke('dock:cancelUpdates'),
  onAppletPage: (callback) => {
    const handler = (_: Electron.IpcRendererEvent, key: string | null) => callback(key);
    ipcRenderer.on('dock:appletPage', handler);
    return () => ipcRenderer.removeListener('dock:appletPage', handler);
  },
  openAppletPage: (extensionId, pageId, navigationRequest) =>
    ipcRenderer.invoke('dock:openAppletPage', extensionId, pageId, navigationRequest),
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
  hostUiRendered: () => ipcRenderer.invoke('dock:hostUiRendered'),
  saveSettings: (value, revision) => ipcRenderer.invoke('dock:saveSettings', value, revision),
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
  barViewport: (region, bounds) => ipcRenderer.invoke('dock:barViewport', region, bounds),
  focusBar: (region, edge) => ipcRenderer.invoke('dock:focusBar', region, edge),
  onBarFocusHost: (callback) => {
    const handler = (
      _: Electron.IpcRendererEvent,
      region: import('../shared/window-bars').WindowBarRegion,
      edge: 'before' | 'after',
    ) => callback(region, edge);
    ipcRenderer.on('dock:barFocusHost', handler);
    return () => ipcRenderer.removeListener('dock:barFocusHost', handler);
  },
  onChanged: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('dock:changed', handler);
    return () => ipcRenderer.removeListener('dock:changed', handler);
  },
};
contextBridge.exposeInMainWorld('dock', api);

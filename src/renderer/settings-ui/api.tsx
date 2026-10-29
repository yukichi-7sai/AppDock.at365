import type { DockApi, Settings, UpdateState } from '../../shared/contracts';
import { createContext, useContext, type ReactNode } from 'react';
/** Public, injectable control dependencies. No transport or host implementation is imported. */
export type SettingsControlsApi = Pick<
  DockApi,
  | 'onChanged'
  | 'checkUpdates'
  | 'checkAllUpdates'
  | 'installUpdates'
  | 'cancelUpdates'
  | 'openReleases'
  | 'setShortcutRecording'
  | 'setShortcutCapture'
  | 'onShortcutCaptured'
  | 'retryGlobalHotKeys'
  | 'openCommandPalette'
  | 'cancelCommandPalette'
  | 'createWebAccount'
  | 'renameWebAccount'
  | 'deleteWebAccount'
  | 'clearWebAccount'
  | 'chooseDirectory'
  | 'setAppletApiPermissions'
  | 'automation'
  | 'executeCommand'
> & {
  snapshot(): Promise<{ updates: UpdateState }>;
  checkHostOnAboutOpen?(): Promise<void>;
};
const ControlsContext = createContext<SettingsControlsApi | null>(null);
export function SettingsControlsProvider({
  api,
  children,
}: {
  api: SettingsControlsApi;
  children: ReactNode;
}) {
  return <ControlsContext.Provider value={api}>{children}</ControlsContext.Provider>;
}
export function useSettingsControls() {
  const api = useContext(ControlsContext);
  if (!api) throw Error('Settings controls are not connected');
  return api;
}
export function useOptionalSettingsControls() {
  return useContext(ControlsContext);
}
export interface SettingsControlEditor {
  value: Settings;
  edit(value: Settings): void;
}

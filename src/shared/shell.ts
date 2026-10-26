import { hostText } from './i18n';
/** Public presentation contract. No renderer implementation or host internals. */
export const defaultShellId = 'appdock.default-shell';
/** Shell targets are deliberately limited. New targets require an explicit request. */
export type ShellRegion =
  | 'titlebar'
  | 'ribbon'
  | 'statusbar'
  | 'overlay.command-palette'
  | 'notification.banner'
  | 'notification.desktop';

export const shellRegions: readonly { id: ShellRegion; title: string }[] = [
  { id: 'titlebar', title: hostText('services.sharedShell.titleBar') },
  { id: 'ribbon', title: hostText('services.sharedShell.ribbon') },
  { id: 'statusbar', title: hostText('services.sharedShell.statusBar') },
  { id: 'overlay.command-palette', title: hostText('services.sharedShell.commandPalette') },
  { id: 'notification.banner', title: hostText('services.sharedShell.banner') },
  { id: 'notification.desktop', title: hostText('services.sharedShell.desktopNotifications') },
];
export function isShellRegion(value: unknown): value is ShellRegion {
  return shellRegions.some((r) => r.id === value);
}
export type LegacyShellRegion =
  | 'page.settings'
  | 'page.home'
  | 'page.logs'
  | 'page.image-library'
  | 'page.notifications'
  | 'overlay.ribbon-group';
export function isRetiredShellRegion(value: unknown): value is LegacyShellRegion {
  return [
    'page.settings',
    'page.home',
    'page.logs',
    'page.image-library',
    'page.notifications',
    'overlay.ribbon-group',
  ].includes(value as string);
}
export type ShellRequirement = {
  region: ShellRegion | LegacyShellRegion;
  state: 'resolved' | 'visible';
};
export interface ShellRegionStatus {
  region: ShellRegion;
  configuredProvider: string;
  resolvedProvider: string | null;
  boundProvider: string | null;
  pendingProvider: string | null;
  ready: boolean;
  visible: boolean;
  reason: string | null;
}
export interface ShellRegionsSnapshot {
  contextId: 'primary';
  revision: number;
  regions: ShellRegionStatus[];
}
export interface OwnShellState {
  contextId: 'primary';
  revision: number;
  regions: {
    region: ShellRegion;
    configured: boolean;
    resolved: boolean;
    bound: boolean;
    ready: boolean;
    visible: boolean;
    reason: string | null;
  }[];
}
/** Legacy scalar input expands only to the eight regions fixed by this migration. */
export function parseShellProviders(host: Record<string, unknown>): Record<string, string> {
  const id = (v: unknown): v is string =>
    typeof v === 'string' &&
    /^[a-z0-9][a-z0-9.-]{0,100}$/.test(v) &&
    !['__proto__', 'constructor', 'prototype'].includes(v);
  if (Object.hasOwn(host, 'shellProviders')) {
    const value = host.shellProviders;
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.keys(value).length > 32
    )
      throw Error(hostText('services.sharedShell.providerLimit'));
    const entries = Object.entries(value);
    if (
      entries.some(
        ([key, provider]) =>
          !/^[a-z][a-z0-9.-]{0,63}$/.test(key) ||
          ['__proto__', 'constructor', 'prototype'].includes(key) ||
          !id(provider),
      )
    )
      throw Error(hostText('services.sharedShell.invalidProvider'));
    return Object.fromEntries(entries) as Record<string, string>;
  }
  if (!Object.hasOwn(host, 'shellProvider') || host.shellProvider === undefined) return {};
  if (!id(host.shellProvider)) throw Error(hostText('services.sharedShell.invalidLegacyProvider'));
  return Object.fromEntries(
    [
      'ribbon',
      'overlay.command-palette',
      'page.home',
      'page.logs',
      'page.settings',
      'page.notifications',
      'notification.banner',
      'notification.desktop',
    ].map((region) => [region, host.shellProvider as string]),
  );
}

export function shellView(
  shell: { ui?: string; views?: Record<string, string> } | undefined,
  region: ShellRegion | LegacyShellRegion,
) {
  if (isRetiredShellRegion(region)) return undefined;
  return shell?.views?.[region] ?? (region === 'ribbon' ? shell?.ui : undefined);
}
export interface RibbonView {
  schemaVersion: 1 | 2;
  epoch: string;
  revision: number;
  contextId: 'primary';
  dark: boolean;
  route: string;
  contextActionId: string;
  displayMode?: import('./ribbon').RibbonDisplayMode;
  displayModeToggle?: { actionId: string; title: string; enabled: boolean };
  contextActionEnabled?: boolean;
  contextDisabledReason?: string;
  items: {
    id: string;
    kind: 'button' | 'separator' | 'group';
    color?: string | null;
    title: string;
    tooltip: string;
    placement: 'top' | 'bottom';
    selected: boolean;
    enabled: boolean;
    disabledReason?: string;
    actionId?: string;
    icon: { name?: string; assetId?: string; text?: string };
    badge?: import('./ribbon').RibbonBadgeView;
    expansion?: 'persistent' | 'temporary';
    expanded?: boolean;
    children?: RibbonView['items'];
    childCount?: number;
    iconOnly?: boolean;
    hideLabel?: boolean;
  }[];
}
export interface UiActionRequest {
  contextId?: 'primary';
  epoch: string;
  requestId: string;
  actionId: string;
  anchor?: import('./ribbon').RibbonAnchor;
}
export interface ShellConnection {
  providerAppletId: string;
  contextId: 'primary';
  sessionId: string;
  bindingId: 'primary';
  snapshot: RibbonView;
}
export interface ShellAppletApi {
  /** Execute a command registered by this provider Applet, through the normal dispatcher. */
  executeCommand(id: string): Promise<unknown>;
  getSettings(): Promise<Record<string, unknown>>;
  onSettingsChanged(callback: () => void): () => void;
}
export interface ShellApi extends ShellAppletApi {
  focusHost(edge: 'before' | 'after'): Promise<void>;
  onFocus(callback: (edge: 'first' | 'last') => void): () => void;
  connect(): Promise<ShellConnection>;
  ready(sessionId: string): Promise<void>;
  dispose(sessionId: string): Promise<void>;
  get(): Promise<RibbonView>;
  asset(id: string): Promise<{ dataUrl: string }>;
  invoke(request: UiActionRequest): Promise<unknown>;
  invalidateAnchor(): Promise<void>;
  onChanged(callback: (snapshot: RibbonView) => void): () => void;
}
export interface ShellStatus {
  selected: string;
  active: string | null;
  error: string | null;
  safeMode: boolean;
}
export type NavigationState = {
  route: string;
  request: number;
  section?: 'ribbon' | 'general' | 'applets' | 'about';
  appletId?: string;
  appletDetail?: 'description' | 'settings';
};

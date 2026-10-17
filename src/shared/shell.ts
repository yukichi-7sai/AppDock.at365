/** Public presentation contract. No renderer implementation or host internals. */
export const defaultShellId = 'appdock.default-shell';
/** Only these regions are mounted today. Additional page regions need their own public contract. */
export type ShellRegion =
  | 'ribbon'
  | 'overlay.command-palette'
  | 'overlay.ribbon-group'
  | 'page.logs'
  | 'page.home'
  | 'page.notifications'
  | 'notification.banner'
  | 'notification.desktop';

export const shellRegions: readonly { id: ShellRegion; title: string }[] = [
  { id: 'ribbon', title: 'リボン' },
  { id: 'overlay.command-palette', title: 'コマンドパレット' },
  { id: 'overlay.ribbon-group', title: 'リボングループ' },
  { id: 'page.home', title: 'ホーム' },
  { id: 'page.logs', title: 'ログ' },
  { id: 'page.notifications', title: '通知センター' },
  { id: 'notification.banner', title: '通知バナー' },
  { id: 'notification.desktop', title: 'デスクトップ通知' },
];
export function isShellRegion(value: unknown): value is ShellRegion {
  return shellRegions.some((r) => r.id === value);
}
export type LegacyShellRegion = 'page.settings';
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
      throw Error('host.shellProviders は32件以内の領域とShell IDのオブジェクトです。');
    const entries = Object.entries(value);
    if (
      entries.some(
        ([key, provider]) =>
          !/^[a-z][a-z0-9.-]{0,63}$/.test(key) ||
          ['__proto__', 'constructor', 'prototype'].includes(key) ||
          !id(provider),
      )
    )
      throw Error('host.shellProviders の領域またはShell IDが不正です。');
    return Object.fromEntries(entries) as Record<string, string>;
  }
  if (!Object.hasOwn(host, 'shellProvider') || host.shellProvider === undefined) return {};
  if (!id(host.shellProvider)) throw Error('host.shellProvider はShellのIDです。');
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
  items: {
    id: string;
    kind: 'button' | 'separator' | 'group';
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
  section?: 'profile' | 'ribbon' | 'general';
  appletId?: string;
};

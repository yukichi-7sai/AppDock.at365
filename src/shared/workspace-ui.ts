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
export interface RibbonConnection {
  contextId: 'primary';
  sessionId: string;
  bindingId: 'primary';
  snapshot: RibbonView;
}
export interface RibbonApi {
  focusHost(edge: 'before' | 'after'): Promise<void>;
  onFocus(callback: (edge: 'first' | 'last') => void): () => void;
  connect(): Promise<RibbonConnection>;
  ready(sessionId: string): Promise<void>;
  dispose(sessionId: string): Promise<void>;
  get(): Promise<RibbonView>;
  asset(id: string): Promise<{ dataUrl: string; monochrome?: boolean }>;
  invoke(request: UiActionRequest): Promise<unknown>;
  invalidateAnchor(): Promise<void>;
  onChanged(callback: (snapshot: RibbonView) => void): () => void;
}
export type NavigationState = {
  route: string;
  request: number;
  section?: 'ribbon' | 'general' | 'applets' | 'about';
  appletId?: string;
  appletDetail?: 'description' | 'settings';
};

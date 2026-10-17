import { randomUUID, createHash } from 'node:crypto';
import { visibleRibbonItems, type RibbonItem } from '../../shared/applet-pages';
import { ribbonRoots, ribbonPlacement, ribbonPresentation } from '../../shared/ribbon-layout';
import { ribbonBadgeView, type RibbonBadge, type RibbonAnchor } from '../../shared/ribbon';
import type { ExtensionSnapshot, Settings } from '../../shared/contracts';
import type { NavigationState, RibbonView, UiActionRequest } from '../../shared/shell';

export class NavigationCoordinator {
  private requestSequence = 0;
  state: NavigationState = { route: 'home', request: 0 };
  constructor(
    private changed: () => void,
    private beforeNavigate?: () => Promise<void>,
    private failed?: (error: unknown) => void,
  ) {}
  restore(route: string) {
    // Startup restoration has lower priority than any explicit or pending navigation.
    if (this.requestSequence !== 0) return;
    return this.navigate(route);
  }
  navigate(route: string, section?: NavigationState['section'], appletId?: string) {
    if (
      !['home', 'extensions', 'settings', 'logs', 'notifications'].includes(route) &&
      !/^page:[a-z0-9.-]+:[a-z0-9.-]+$/.test(route)
    )
      throw Error('Unknown route');
    const sequence = ++this.requestSequence;
    if (route === this.state.route && !section && !appletId) return;
    const apply = () => {
      if (sequence !== this.requestSequence) return;
      this.state = { route, section, appletId, request: this.state.request + 1 };
      this.changed();
    };
    if (this.beforeNavigate)
      return this.beforeNavigate()
        .then(apply)
        .catch((error) => {
          this.failed?.(error);
        });
    apply();
  }
}
type Action = {
  route?: string;
  section?: NavigationState['section'];
  command?: string;
  theme?: true;
  group?: string;
};
export class UiPresentation {
  readonly epoch = randomUUID();
  private revision = 0;
  private signature = '';
  private assets = new Map<string, string>();
  private actions = new Map<string, Action>();
  private requests = new Map<
    string,
    { action: string; promise: Promise<unknown>; completed: boolean; expires: number }
  >();
  constructor(
    private options: {
      settings(): Settings;
      applets(): ExtensionSnapshot[];
      dark(): boolean;
      avatar(): string | undefined;
      navigation: NavigationCoordinator;
      execute(command: string): Promise<unknown>;
      theme(): Promise<unknown>;
      expanded?(id: string): boolean;
      temporaryExpanded?(id: string): boolean;
      toggleGroup?(id: string): void;
      badge?(id: string): RibbonBadge;
    },
  ) {}
  private asset(data: string | undefined) {
    if (
      !data ||
      data.length > 1024 * 1024 ||
      !/^data:image\/(png|webp);base64,[A-Za-z0-9+/=]+$/.test(data)
    )
      return;
    const id = createHash('sha256').update(data).digest('hex');
    this.assets.set(id, data);
    return id;
  }
  get(
    allowed: (action: Action) => boolean = () => true,
    schemaVersion: 1 | 2 = 2,
    local = true,
  ): RibbonView {
    const settings = this.options.settings();
    const applets = this.options.applets();
    const dark = this.options.dark();
    const route = this.options.navigation.state.route;
    this.assets.clear();
    this.actions.clear();
    this.actions.set('ribbon.configure', { route: 'settings', section: 'ribbon' });
    const catalog = visibleRibbonItems(applets, settings.ribbon.separators, settings.ribbon.groups);
    const project = (item: RibbonItem): RibbonView['items'][number] => {
      const appearance = ribbonPresentation(settings.ribbon, item);
      const actionId = `ribbon.${item.id}`;
      const provider = applets.find((e) => e.id === item.extensionId);
      const page = provider?.pages?.find((p) => p.id === item.pageId);
      const action: Action =
        item.kind === 'group'
          ? { group: item.id }
          : item.extensionId
            ? { command: page?.openCommand }
            : item.id === 'theme'
              ? { theme: true }
              : item.id === 'profile'
                ? { route: 'settings', section: 'profile' }
                : { route: item.id };
      if (item.kind !== 'separator') this.actions.set(actionId, action);
      const available =
        !action.command ||
        provider?.commands?.some((c) => c.id === action.command && c.available) === true;
      const enabled =
        item.kind === 'separator' ||
        (!!(action.route || action.theme || action.command || action.group) &&
          available &&
          allowed(action) &&
          (item.group?.expansion !== 'temporary' || local));
      return {
        id: item.id,
        kind: item.kind ?? 'button',
        title: appearance.title,
        tooltip:
          item.id === 'profile' && !settings.ribbon.itemOverrides?.profile?.title
            ? settings.profile.name
            : appearance.title,
        placement: ribbonPlacement(settings.ribbon, item.id),
        selected: route === item.id,
        enabled,
        ...(!enabled
          ? {
              disabledReason:
                provider?.commands?.find((c) => c.id === action.command)?.disabledReason ??
                'この接続からは実行できません。',
            }
          : {}),
        ...(item.kind === 'separator' ? {} : { actionId }),
        ...(schemaVersion === 2
          ? {
              badge: ribbonBadgeView(this.options.badge?.(item.id) ?? null),
              iconOnly: appearance.iconOnly,
            }
          : {}),
        icon:
          item.id === 'profile'
            ? {
                assetId: this.asset(this.options.avatar()),
                text: Array.from(settings.profile.name || 'A')[0],
              }
            : {
                assetId: this.asset(item.iconImage),
                name: item.id === 'theme' ? (dark ? 'sun' : 'moon') : item.icon,
              },
      };
    };
    const prune = (items: RibbonView['items']) =>
      items.filter(
        (item, i) =>
          item.kind !== 'separator' ||
          (i > 0 &&
            i < items.length - 1 &&
            items[i - 1].kind !== 'separator' &&
            items.slice(i + 1).some((next) => next.kind !== 'separator')),
      );
    const allChildren = new Map<string, RibbonView['items']>();
    const roots = ribbonRoots(settings.ribbon, catalog).filter(
      (item) => !settings.ribbon.hidden.includes(item.id),
    );
    const grouped = roots.flatMap((item) => {
      if (!item.group) return [project(item)];
      const children = prune(
        item.group.children.flatMap((id) => {
          const child = catalog.find((c) => c.id === id);
          return child && !settings.ribbon.hidden.includes(id) ? [project(child)] : [];
        }),
      );
      if (!children.some((c) => c.kind !== 'separator')) return [];
      allChildren.set(item.id, children);
      const group = project(item);
      const persistentOpen =
        item.group.expansion === 'persistent' && !!this.options.expanded?.(item.id);
      const expanded =
        persistentOpen ||
        (item.group.expansion === 'temporary' && !!this.options.temporaryExpanded?.(item.id));
      if (schemaVersion === 1)
        return [{ ...group, kind: 'button' as const }, ...(persistentOpen ? children : [])];
      return [
        {
          ...group,
          expansion: item.group.expansion,
          expanded,
          selected: children.some((c) => c.selected),
          badge: children.some((c) => c.badge)
            ? ribbonBadgeView({ kind: 'dot', label: 'グループ内に新しい情報があります' })
            : undefined,
          childCount: children.filter((c) => c.kind !== 'separator').length,
          children: persistentOpen ? children : [],
        },
      ];
    });
    const items = (['top', 'bottom'] as const).flatMap((p) =>
      prune(grouped.filter((item) => item.placement === p)),
    );
    this.children = allChildren;
    const body = {
      schemaVersion,
      epoch: this.epoch,
      contextId: 'primary' as const,
      dark,
      route,
      contextActionId: 'ribbon.configure',
      items,
    };
    // Projection permissions may differ between callers; revision describes host state only.
    const signature = JSON.stringify({
      settings,
      route,
      dark,
      applets: applets.map((e) => [e.id, e.state, e.enabled, e.pages, e.commands]),
      assets: [...this.assets.keys()],
      state: roots.map((i) => [i.id, this.options.expanded?.(i.id)]),
      temporary: roots.map((i) => [i.id, this.options.temporaryExpanded?.(i.id)]),
      badges: catalog.map((i) => [i.id, this.options.badge?.(i.id)]),
    });
    if (signature !== this.signature) {
      this.signature = signature;
      this.revision++;
    }
    return { ...body, revision: this.revision };
  }
  private children = new Map<string, RibbonView['items']>();
  group(id: string) {
    const view = this.get();
    const group = view.items.find((item) => item.id === id && item.kind === 'group');
    const layout = this.options.settings().ribbon;
    const config = layout.groups?.find((g) => g.id === id);
    return group
      ? {
          view,
          group,
          items: this.children.get(id)!,
          configuration: JSON.stringify([
            config,
            layout.hidden.filter((key) => key === id || config?.children.includes(key)),
            ribbonPlacement(layout, id),
          ]),
        }
      : undefined;
  }
  getAsset(id: unknown) {
    this.get();
    if (typeof id !== 'string' || !this.assets.has(id)) throw Error('Unknown presentation asset');
    return { dataUrl: this.assets.get(id)! };
  }
  invoke(
    request: UiActionRequest,
    scope: string,
    execute?: (action: Action) => Promise<unknown>,
    local?: { openGroup?(id: string, anchor: RibbonAnchor | undefined): void; groupId?: string },
  ) {
    if (
      !request ||
      (request.contextId !== undefined && request.contextId !== 'primary') ||
      request.epoch !== this.epoch ||
      typeof request.requestId !== 'string' ||
      !/^[a-zA-Z0-9-]{1,100}$/.test(request.requestId)
    )
      throw Error('Stale epoch or invalid request ID');
    const key = `${scope}:${request.requestId}`;
    for (const [id, entry] of this.requests)
      if (entry.completed && entry.expires < Date.now()) this.requests.delete(id);
    const previous = this.requests.get(key);
    if (previous) {
      if (previous.action !== request.actionId)
        throw Error('Request ID reused with another action');
      return previous.promise;
    }
    this.get();
    const action = this.actions.get(request.actionId);
    if (!action) throw Error('Unknown or hidden action');
    if (this.requests.size >= 512) {
      const oldest = [...this.requests].find(([, entry]) => entry.completed);
      if (oldest) this.requests.delete(oldest[0]);
      else throw Error('Too many pending UI actions');
    }
    const promise = Promise.resolve().then(async () => {
      const current = this.get();
      const candidates = local?.groupId
        ? (this.children.get(local.groupId) ?? [])
        : current.items.flatMap((item) => [item, ...(item.children ?? [])]);
      if (
        request.actionId !== current.contextActionId &&
        !candidates.some((i) => i.actionId === request.actionId && i.enabled)
      )
        throw Error('Action is no longer available');
      if (action.group && !execute) {
        const group = this.group(action.group);
        if (!group) throw Error('グループは現在利用できません。');
        if (group.group.expansion === 'temporary') {
          if (!local?.openGroup) throw Error('一時グループはローカルのリボンから開いてください。');
          local.openGroup(action.group, request.anchor);
        } else this.toggleGroup(action.group);
        return { accepted: true };
      }
      if (execute) return execute(action);
      if (action.command) return this.options.execute(action.command);
      if (action.theme) return this.options.theme();
      await this.options.navigation.navigate(action.route!, action.section);
      return { accepted: true };
    });
    const entry = { action: request.actionId, promise, completed: false, expires: Infinity };
    this.requests.set(key, entry);
    const completed = () => {
      entry.completed = true;
      entry.expires = Date.now() + 120000;
    };
    void promise.then(completed, completed);
    return promise;
  }
  toggleGroup(id: string) {
    const group = this.group(id);
    if (!group || group.group.expansion !== 'persistent' || !this.options.toggleGroup)
      throw Error('持続的グループは現在利用できません。');
    this.options.toggleGroup(id);
  }
  disconnect(scope: string) {
    for (const key of this.requests.keys())
      if (key.startsWith(scope + ':')) this.requests.delete(key);
  }
}

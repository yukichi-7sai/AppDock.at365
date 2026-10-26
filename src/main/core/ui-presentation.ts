import { hostText } from '../../shared/i18n';
import { randomUUID, createHash } from 'node:crypto';
import { defaultNavigation, isPageRoute } from '../../shared/navigation';
import { visibleRibbonItems, type RibbonItem } from '../../shared/applet-pages';
import { ribbonRoots, ribbonPlacement, ribbonPresentation } from '../../shared/ribbon-layout';
import { ribbonBadgeView, type RibbonBadge, type RibbonAnchor } from '../../shared/ribbon';
import type { ExtensionSnapshot, Settings } from '../../shared/contracts';
import type { NavigationState, RibbonView, UiActionRequest } from '../../shared/shell';
import type { UiCommand } from '../../shared/commands';

export class NavigationCoordinator {
  private requestSequence = 0;
  state: NavigationState = { ...defaultNavigation, request: 0 };
  constructor(
    private changed: () => void,
    private beforeNavigate?: () => Promise<void>,
    private failed?: (error: unknown) => void,
  ) {}
  restore(route: string) {
    // Startup restoration has lower priority than any explicit or pending navigation.
    if (this.requestSequence !== 0) return;
    return this.navigate(isPageRoute(route) ? route : null);
  }
  navigate(
    route: string | null,
    section?: NavigationState['section'],
    appletId?: string,
    appletDetail?: NavigationState['appletDetail'],
  ) {
    if (route === null) {
      route = defaultNavigation.route;
      section = defaultNavigation.section;
    }
    if (route === 'extensions') {
      route = 'settings';
      if (appletDetail !== 'settings') section = 'applets';
    }
    if (!isPageRoute(route)) throw Error('Unknown route');
    const sequence = ++this.requestSequence;
    if (route === this.state.route && !section && !appletId) return;
    const apply = () => {
      if (sequence !== this.requestSequence) return;
      this.state = {
        route,
        section,
        appletId,
        request: this.state.request + 1,
        ...(appletDetail ? { appletDetail } : {}),
      };
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
  appletId?: string;
  appletDetail?: 'settings';
  route?: string;
  section?: NavigationState['section'];
  command?: string;
  theme?: true;
  group?: string;
  displayMode?: true;
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
      commands?(): UiCommand[];
      dark(): boolean;
      image?(ref: unknown, shape?: string): string | undefined;
      navigation: NavigationCoordinator;
      execute(command: string): Promise<unknown>;
      theme(): Promise<unknown>;
      expanded?(id: string): boolean;
      temporaryExpanded?(id: string): boolean;
      toggleGroup?(id: string): void;
      displayMode?(): import('../../shared/ribbon').RibbonDisplayMode;
      toggleDisplayMode?(): void;
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
    const displayMode = this.options.displayMode?.() ?? 'compact';
    const applets = this.options.applets();
    const dark = this.options.dark();
    const route = this.options.navigation.state.route;
    this.assets.clear();
    this.actions.clear();
    const contextAction: Action = settings.ribbon.rightClickCommand
      ? { command: settings.ribbon.rightClickCommand }
      : { route: 'settings', section: 'ribbon' };
    this.actions.set('ribbon.configure', contextAction);
    const commands = this.options.commands?.();
    const commandAvailable = (action: Action, provider?: ExtensionSnapshot) =>
      !action.command ||
      (commands
        ? commands.some((c) => c.id === action.command && c.available)
        : provider?.commands?.some((c) => c.id === action.command && c.available) === true);
    const contextEnabled = commandAvailable(contextAction) && allowed(contextAction);
    const catalog = visibleRibbonItems(
      applets,
      settings.ribbon.separators,
      settings.ribbon.groups,
      settings.ribbon.buttons,
    );
    const project = (item: RibbonItem): RibbonView['items'][number] => {
      const appearance = ribbonPresentation(settings.ribbon, item);
      const modeItem = item.id === 'ribbon-display-mode';
      const baseIcon = settings.ribbon.itemOverrides?.[item.id];
      const modeIcon = modeItem ? baseIcon?.displayModeIcons?.[displayMode] : undefined;
      const iconAppearance = modeIcon ?? baseIcon;
      const iconOverride = iconAppearance?.icon;
      const modeTitle = hostText(
        displayMode === 'compact'
          ? 'services.uiPresentation.expandRibbon'
          : 'services.uiPresentation.collapseRibbon',
      );
      const title = appearance.title;
      const actionId = modeItem ? 'ribbon.display-mode' : `ribbon.${item.id}`;
      const provider = applets.find((e) => e.id === item.extensionId);
      const page = provider?.pages?.find((p) => p.id === item.pageId);
      const action: Action = modeItem
        ? { displayMode: true }
        : item.kind === 'group'
          ? { group: item.id }
          : item.contribution
            ? { route: 'extensions', appletId: item.extensionId, appletDetail: 'settings' }
            : item.command
              ? { command: item.command.commandId }
              : item.extensionId
                ? { command: page?.openCommand }
                : item.id === 'theme'
                  ? { theme: true }
                  : { route: item.id };
      if (item.kind !== 'separator') this.actions.set(actionId, action);
      const available = modeItem
        ? local && schemaVersion === 2 && !!this.options.toggleDisplayMode
        : commandAvailable(action, provider);
      const enabled =
        item.kind === 'separator' ||
        (!!(action.route || action.theme || action.command || action.group || action.displayMode) &&
          available &&
          allowed(action) &&
          (item.group?.expansion !== 'temporary' || local));
      return {
        id: item.id,
        kind: item.kind === 'command' ? 'button' : (item.kind ?? 'button'),
        title,
        tooltip: modeItem && title !== modeTitle ? `${title}（${modeTitle}）` : title,
        placement: ribbonPlacement(settings.ribbon, item.id, catalog),
        selected: item.contribution
          ? route === 'extensions' &&
            this.options.navigation.state.appletId === item.extensionId &&
            this.options.navigation.state.appletDetail === 'settings'
          : route === item.id,
        enabled,
        ...(!enabled
          ? {
              disabledReason:
                provider?.commands?.find((c) => c.id === action.command)?.disabledReason ??
                (available
                  ? hostText('services.uiPresentation.connectionForbidden')
                  : hostText('services.uiPresentation.commandUnavailable')),
            }
          : {}),
        ...(item.kind === 'separator' || (modeItem && (!local || schemaVersion !== 2))
          ? {}
          : { actionId }),
        ...(schemaVersion === 2
          ? {
              badge: ribbonBadgeView(this.options.badge?.(item.id) ?? null),
              iconOnly: displayMode === 'compact' || appearance.iconOnly,
              hideLabel: appearance.iconOnly,
            }
          : {}),
        icon: {
          assetId: this.asset(
            (iconOverride || modeIcon
              ? [iconAppearance?.image]
              : [
                  iconAppearance?.image,
                  item.group?.image,
                  item.command?.image,
                  item.image,
                  item.contribution?.imageSetting
                    ? (settings.extensions[item.extensionId!]?.settings[
                        item.contribution.imageSetting
                      ] ??
                      provider?.settings?.find((s) => s.key === item.contribution!.imageSetting)
                        ?.default)
                    : undefined,
                ]
            )
              .map((ref) => this.options.image?.(ref, item.contribution?.imageShape))
              .find(Boolean) ?? (iconOverride || modeIcon ? undefined : item.iconImage),
          ),
          name:
            iconOverride ??
            (modeItem
              ? displayMode === 'expanded'
                ? 'chevron-left'
                : 'chevron'
              : item.id === 'theme'
                ? dark
                  ? 'sun'
                  : 'moon'
                : item.icon),
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
          color: item.group.color ?? null,
          expanded,
          selected: children.some((c) => c.selected),
          badge: children.some((c) => c.badge)
            ? ribbonBadgeView({
                kind: 'dot',
                label: hostText('services.uiPresentation.groupAttention'),
              })
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
    const modeItem = items
      .flatMap((item) => [item, ...(item.children ?? [])])
      .find((item) => item.id === 'ribbon-display-mode');
    const body = {
      schemaVersion,
      epoch: this.epoch,
      contextId: 'primary' as const,
      dark,
      route,
      contextActionId: 'ribbon.configure',
      ...(schemaVersion === 2
        ? {
            displayMode,
            ...(local && modeItem
              ? {
                  displayModeToggle: {
                    actionId: 'ribbon.display-mode',
                    enabled: modeItem.enabled,
                    title: modeItem.title,
                  },
                }
              : {}),
            contextActionEnabled: contextEnabled,
            ...(!contextEnabled
              ? {
                  contextDisabledReason: hostText(
                    'services.uiPresentation.contextCommandUnavailable',
                  ),
                }
              : {}),
          }
        : {}),
      items,
    };
    // Projection permissions may differ between callers; revision describes host state only.
    const signature = JSON.stringify({
      settings,
      commands,
      route,
      dark,
      displayMode,
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
  private runningCommands = new Set<string>();
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
            (layout.buttons ?? []).filter((button) => config?.children.includes(button.id)),
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
      if (JSON.stringify(this.actions.get(request.actionId)) !== JSON.stringify(action))
        throw Error('Action target changed');
      if (request.actionId === current.contextActionId && current.contextActionEnabled === false)
        throw Error(hostText('services.uiPresentation.contextCommandUnavailable'));
      const candidates = local?.groupId
        ? (this.children.get(local.groupId) ?? [])
        : current.items.flatMap((item) => [item, ...(item.children ?? [])]);
      if (
        request.actionId !== current.contextActionId &&
        !candidates.some((i) => i.actionId === request.actionId && i.enabled)
      )
        throw Error('Action is no longer available');
      if (action.displayMode) {
        if (execute || !this.options.toggleDisplayMode)
          throw Error(hostText('services.uiPresentation.localRibbonOnly'));
        this.options.toggleDisplayMode();
        return { accepted: true };
      }
      if (action.group && !execute) {
        const group = this.group(action.group);
        if (!group) throw Error(hostText('services.uiPresentation.groupUnavailable'));
        if (group.group.expansion === 'temporary') {
          if (!local?.openGroup) throw Error(hostText('services.uiPresentation.localRibbonOnly'));
          local.openGroup(action.group, request.anchor);
        } else this.toggleGroup(action.group);
        return { accepted: true };
      }
      if (action.command) {
        if (this.runningCommands.has(action.command))
          throw Error(hostText('services.uiPresentation.commandBusy'));
        this.runningCommands.add(action.command);
        try {
          return await (execute ? execute(action) : this.options.execute(action.command));
        } finally {
          this.runningCommands.delete(action.command);
        }
      }
      if (execute) return execute(action);
      if (action.theme) return this.options.theme();
      await this.options.navigation.navigate(
        action.route!,
        action.section,
        action.appletId,
        action.appletDetail,
      );
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
      throw Error(hostText('services.uiPresentation.persistentGroupUnavailable'));
    this.options.toggleGroup(id);
  }
  disconnect(scope: string) {
    for (const key of this.requests.keys())
      if (key.startsWith(scope + ':')) this.requests.delete(key);
  }
}

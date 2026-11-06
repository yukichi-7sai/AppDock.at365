import { hostText } from '../../shared/i18n';
import type { ExtensionSnapshot, Settings } from '../../shared/contracts';
import { collectionPages, type CollectionPage } from '../../shared/page-collections';
import type { RemotePageDefinition } from '../../shared/web-content';
import { RemotePageService } from './remote-pages';
import { WebSiteAccounts } from './web-site-accounts';
import { closeAppletPages } from './applet-pages';
import { parseKeybindingDefaults } from '../../shared/keybindings';

export class PageCollectionManager {
  private services = new Map<string, RemotePageService>();
  private previous = new Set<string>();
  private invalid = new Set<string>();
  private lastGood = new Map<string, CollectionPage[]>();
  private sites: WebSiteAccounts;
  constructor(
    private options: {
      settings(): Settings;
      parents(): ExtensionSnapshot[];
      localRoot: string;
      sources: import('./device-settings-store').DeviceSettingsStore['confirmedAppletSources'];
      windowState?(id: string): import('./state-storage').StateStorage;
      changed(): void;
      failed(error: Error): void;
      openLocal(
        page: CollectionPage,
        presentation?: import('./applet-pages').PageOpenOptions,
      ): Promise<unknown>;
    },
  ) {
    this.sites = new WebSiteAccounts(options.localRoot, options.sources, options.failed);
  }
  entries(settings = this.options.settings()): CollectionPage[] {
    const result: CollectionPage[] = [];
    for (const parent of this.options.parents()) {
      try {
        const pages = collectionPages(settings, [parent]);
        if (
          pages.some(
            (page) =>
              this.options.parents().some((item) => item.id === page.id) ||
              result.some((item) => item.id === page.id),
          )
        )
          throw Error(hostText('services.pageCollections.duplicateId'));
        result.push(...pages);
        this.lastGood.set(parent.id, pages);
        this.invalid.delete(parent.id);
      } catch {
        result.push(...(this.lastGood.get(parent.id) ?? []).map((page) => ({ ...page, parent })));
        if (!this.invalid.has(parent.id)) {
          this.invalid.add(parent.id);
          queueMicrotask(() =>
            this.options.failed(Error(hostText('services.pageCollections.invalidCollection'))),
          );
        }
      }
    }
    return result;
  }
  find(id: string) {
    return this.entries().find((page) => page.id === id);
  }
  private remote(owner: string) {
    let service = this.services.get(owner);
    if (!service) {
      service = new RemotePageService(
        () => {
          const entries = this.entries();
          if (this.invalid.has(owner))
            throw Error(hostText('services.pageCollections.invalidCollection'));
          return entries
            .filter((page) => page.binding.owner === owner && page.definition.source === 'remote')
            .map(
              (page) =>
                ({
                  ...page.item,
                  id: page.id,
                  binding: page.binding,
                  enabled:
                    page.item.enabled && page.parent.enabled && page.parent.state === 'running',
                }) as RemotePageDefinition & { binding: CollectionPage['binding'] },
            );
        },
        this.sites,
        this.options.changed,
        this.options.windowState,
      );
      this.services.set(owner, service);
    }
    return service;
  }
  snapshot(): ExtensionSnapshot[] {
    return this.entries().map((page) => {
      const remote = page.definition.source === 'remote';
      const enabled = page.parent.enabled && page.item.enabled;
      const state = this.services.get(page.binding.owner)?.states()[page.id];
      const actions = remote ? ['open', 'back', 'forward', 'reload', 'home'] : ['open'];
      return {
        apiVersion: 1,
        id: page.id,
        name: page.item.name,
        displayName: page.item.name,
        version: page.parent.version,
        runtime: page.parent.runtime,
        entry: '',
        folder: '',
        collection: page.binding,
        capabilities: [],
        enabled,
        state: !enabled ? 'stopped' : state?.error ? 'error' : page.parent.state,
        error: state?.error || page.parent.error,
        description: hostText('services.pageCollections.pageTitle', {
          name: page.parent.displayName,
        }),
        settings: page.definition.fields.map((field) => {
          const inherited = page.parent.settings
            ?.find((setting) => setting.key === page.binding.key)
            ?.fields?.find((item) => item.key === field.key)?.default;
          return field.default === undefined && inherited !== undefined
            ? { ...field, default: inherited }
            : field;
        }),
        defaultKeybindings: page.definition.shortcutDefaultsKey
          ? parseKeybindingDefaults(
              this.options.settings().extensions[page.binding.owner]?.settings[
                page.definition.shortcutDefaultsKey
              ] ??
                page.parent.settings?.find(
                  (setting) => setting.key === page.definition.shortcutDefaultsKey,
                )?.default,
              actions,
            ).map((binding) => ({ ...binding, command: `${page.id}.${binding.command}` }))
          : [],
        commands: actions.map((action) => ({
          id: `${page.id}.${action}`,
          title: (
            {
              open: hostText('services.pageCollections.open'),
              back: hostText('services.pageCollections.back'),
              forward: hostText('services.pageCollections.forward'),
              reload: hostText('services.pageCollections.reload'),
              home: hostText('services.pageCollections.home'),
            } as Record<string, string>
          )[action],
          available: enabled && page.parent.state === 'running',
          automation: page.definition.automation?.includes(action as 'open') ?? false,
        })),
        pages: [
          {
            id: 'main',
            title: page.item.name,
            source: 'local',
            ui: '',
            icon: 'extensions',
            iconImage: page.item.icon,
            image: page.item.image,
            openCommand: `${page.id}.open`,
            defaultDisplay: page.item.display,
          },
        ],
        tray: [],
        settingOptions: {},
        panel: {
          title: page.item.name,
          description: hostText('services.pageCollections.description', {
            name: page.parent.displayName,
          }),
          actions: [
            { title: hostText('services.pageCollections.openPage'), command: `${page.id}.open` },
            ...(page.definition.managementCommand
              ? [
                  {
                    title: hostText('services.pageCollections.openManagement'),
                    command: page.definition.managementCommand,
                  },
                ]
              : []),
          ],
        },
      };
    });
  }
  validate(settings: Settings) {
    collectionPages(settings, this.options.parents());
  }
  cleanupSiteAccounts() {
    this.sites.cleanup(this.invalid);
  }
  states() {
    return Object.assign({}, ...[...this.services.values()].map((service) => service.states()));
  }
  reconcile() {
    const entries = this.entries();
    const current = new Set(
      entries
        .filter((p) => p.item.enabled && p.parent.enabled && p.parent.state === 'running')
        .map((p) => p.id),
    );
    for (const id of this.previous) if (!current.has(id)) closeAppletPages(id);
    this.previous = current;
    for (const [owner, service] of this.services) if (!this.invalid.has(owner)) service.reconcile();
  }
  async open(id: string, presentation?: import('./applet-pages').PageOpenOptions) {
    const page = this.find(id);
    if (!page || !page.item.enabled || !page.parent.enabled || page.parent.state !== 'running')
      throw Error(hostText('services.pageCollections.stopped'));
    return page.definition.source === 'remote'
      ? this.remote(page.binding.owner).open(id, presentation)
      : this.options.openLocal(page, presentation);
  }
  async navigate(id: string, action: unknown) {
    const page = this.find(id);
    if (
      !page ||
      page.definition.source !== 'remote' ||
      !page.parent.enabled ||
      page.parent.state !== 'running'
    )
      throw Error(hostText('services.pageCollections.unavailable'));
    return this.remote(page.binding.owner).navigate(id, action);
  }
  async restart(id: string) {
    const page = this.find(id);
    if (!page || !page.item.enabled || !page.parent.enabled || page.parent.state !== 'running')
      throw Error(hostText('services.pageCollections.stopped'));
    if (page.definition.source === 'remote') return this.remote(page.binding.owner).restart(id);
    closeAppletPages(id);
    return this.open(id);
  }
  async close() {
    for (const service of this.services.values()) service.close();
    await this.sites.flush();
  }
}

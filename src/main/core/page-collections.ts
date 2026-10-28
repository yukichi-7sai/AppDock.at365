import { hostText } from '../../shared/i18n';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import type { ExtensionSnapshot, Settings } from '../../shared/contracts';
import { collectionPages, type CollectionPage } from '../../shared/page-collections';
import type { RemotePageDefinition, WebProfile } from '../../shared/web-content';
import { RemotePageService } from './remote-pages';
import { WebProfileStore } from './web-profiles';
import { webProfileSettingsTarget } from './settings-web-profile-target';
import { closeAppletPages } from './applet-pages';
import { parseKeybindingDefaults } from '../../shared/keybindings';

export class PageCollectionManager {
  private services = new Map<string, RemotePageService>();
  private previous = new Set<string>();
  private invalid = new Set<string>();
  private lastGood = new Map<string, CollectionPage[]>();
  constructor(
    private options: {
      settings(): Settings;
      parents(): ExtensionSnapshot[];
      localRoot: string;
      sharedRoot: string;
      changed(): void;
      failed(error: Error): void;
      openLocal(page: CollectionPage): Promise<unknown>;
    },
  ) {}
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
  accounts() {
    return this.options
      .parents()
      .filter((parent) => parent.capabilities?.includes('web-profiles'))
      .flatMap((parent) =>
        this.profiles(parent.id)
          .accounts()
          .map((account) => ({ ...account, owner: parent.id })),
      );
  }
  settingOptions(owner: string) {
    if (
      !this.options
        .parents()
        .some((parent) => parent.id === owner && parent.capabilities?.includes('web-profiles'))
    )
      return [];
    return this.readProfiles(owner)
      .snapshot()
      .map((account) => ({ value: account.id, label: account.name }));
  }
  settingsTargets(checkRevision: (revision: string) => void) {
    return this.options
      .parents()
      .filter((parent) => parent.capabilities?.includes('web-profiles'))
      .map((parent) => {
        let store: WebProfileStore | undefined;
        try {
          store = this.services.get(parent.id)?.settingsProfiles() ?? this.readProfiles(parent.id);
        } catch {
          // Discovery reports an unavailable owner without exposing raw I/O errors.
        }
        return webProfileSettingsTarget({
          ownerId: parent.id,
          title: parent.displayName,
          store,
          checkRevision,
          changed: this.options.changed,
        });
      });
  }
  private readProfiles(owner: string) {
    const store = new WebProfileStore(this.locations(owner).file);
    store.loadStandalone(() => false);
    return store;
  }
  private accountService(id?: string, confirmed?: WebProfile) {
    const owners = id
      ? this.accounts()
          .filter((account) => account.id === id)
          .map((account) => account.owner)
      : this.options
          .parents()
          .filter((parent) => parent.capabilities?.includes('web-profiles'))
          .map((parent) => parent.id);
    if (owners.length !== 1)
      throw Error(hostText('services.pageCollections.manageAccountsAtProvider'));
    if (confirmed !== undefined && confirmed?.owner !== owners[0])
      throw Error(hostText('services.webProfiles.changed'));
    return this.profiles(owners[0]);
  }
  addAccount(name: unknown) {
    return this.accountService().addAccount(name);
  }
  renameAccount(id: string, name: unknown) {
    return this.accountService(id).renameAccount(id, name);
  }
  deleteAccount(id: string, confirmed?: WebProfile) {
    return this.accountService(id, confirmed).deleteAccount(id, confirmed);
  }
  clearAccount(id: string, confirmed?: WebProfile) {
    return this.accountService(id, confirmed).clearAccount(id, confirmed);
  }
  private locations(owner: string) {
    const legacy = this.options.settings().migrations?.webApplet;
    return legacy?.owner === owner
      ? {
          local: path.join(this.options.localRoot, 'web-applets'),
          file: path.join(this.options.sharedRoot, 'web-applets', 'accounts.json'),
        }
      : {
          local: path.join(this.options.localRoot, 'web-profiles', owner),
          file: path.join(this.options.sharedRoot, 'web-profiles', owner, 'accounts.json'),
        };
  }
  profiles(owner: string) {
    const parent = this.options.parents().find((parent) => parent.id === owner);
    if (!parent?.capabilities?.includes('web-profiles'))
      throw Error(hostText('services.pageCollections.profilesCapability'));
    let service = this.services.get(owner);
    if (!service) {
      const locations = this.locations(owner);
      service = new RemotePageService(
        () => {
          const entries = this.entries();
          if (this.invalid.has(owner))
            throw Error(hostText('services.pageCollections.invalidCollectionAccounts'));
          return entries
            .filter((page) => page.binding.owner === owner && page.definition.source === 'remote')
            .map(
              (page) =>
                ({
                  ...page.item,
                  id: page.id,
                  enabled:
                    page.item.enabled && page.parent.enabled && page.parent.state === 'running',
                }) as RemotePageDefinition,
            );
        },
        locations.local,
        this.options.changed,
        locations.file,
        this.options.failed,
      );
      this.services.set(owner, service);
    }
    return service;
  }
  snapshot(): ExtensionSnapshot[] {
    return this.entries().map((page) => {
      const remote = page.definition.source === 'remote';
      const accountMissing =
        remote &&
        !this.profiles(page.binding.owner)
          .accounts()
          .some((a) => a.id === page.item.accountId);
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
        state: !enabled ? 'stopped' : accountMissing || state?.error ? 'error' : page.parent.state,
        error: accountMissing
          ? hostText('services.pageCollections.syncPending')
          : state?.error || page.parent.error,
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
          available: enabled && page.parent.state === 'running' && !accountMissing,
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
  validate(settings: Settings, previous?: Settings) {
    const parents = this.options.parents();
    for (const page of collectionPages(settings, parents)) {
      const rows = previous?.extensions[page.binding.owner]?.settings[page.binding.key];
      if (
        page.definition.source === 'remote' &&
        !(
          Array.isArray(rows) &&
          rows.some((old) => old?.id === page.binding.itemId && isDeepStrictEqual(old, page.item))
        )
      ) {
        this.readProfiles(page.binding.owner).get(page.item.accountId);
        this.services
          .get(page.binding.owner)
          ?.validateAccounts([{ ...page.item, id: page.id } as RemotePageDefinition]);
      }
    }
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
  async open(id: string) {
    const page = this.find(id);
    if (!page || !page.item.enabled || !page.parent.enabled || page.parent.state !== 'running')
      throw Error(hostText('services.pageCollections.stopped'));
    return page.definition.source === 'remote'
      ? this.profiles(page.binding.owner).open(id)
      : this.options.openLocal(page);
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
    return this.profiles(page.binding.owner).navigate(id, action);
  }
  async restart(id: string) {
    const page = this.find(id);
    if (!page || !page.item.enabled || !page.parent.enabled || page.parent.state !== 'running')
      throw Error(hostText('services.pageCollections.stopped'));
    if (page.definition.source === 'remote') return this.profiles(page.binding.owner).restart(id);
    closeAppletPages(id);
    return this.open(id);
  }
  async close() {
    await Promise.all([...this.services.values()].map((service) => service.close()));
  }
}

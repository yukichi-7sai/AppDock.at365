import { hostText } from '../../shared/i18n';
import { withoutDeviceMcp } from '../../shared/mcp-device-settings';
import { hostStartupTiming } from './host-startup-timing';
import fs from 'node:fs';
import { AssignedImages } from './assigned-images';
import { appletEnabled } from '../../shared/applet-state';
import path from 'node:path';
import type { StateStorage } from './state-storage';
import { parseDeviceUiState } from './device-ui-state';
import {
  SettingsStore,
  SettingsConflictError,
  atomicWrite,
  type SettingsRecoveryPlan,
  type SettingsAsset,
  storedSettingRecord,
} from './settings';
import type { Settings, ExtensionManifest, ExtensionSnapshot } from '../../shared/contracts';
import { getTrayMenu } from '../../shared/tray-menu';
import type { CollectionBinding } from '../../shared/page-collections';
import { parseSettings } from '../../shared/settings-schema';
import { appletCommonKeys } from '../../shared/applet-common-settings';
import {
  applyHostPageConfiguration,
  hostPageConfiguration,
  hostPageForPath,
  hostPageSettingsIds,
  isDeviceOnlyHostPage,
  canSwitchHostPageSettings,
  type HostPageSettingsId,
} from '../../shared/host-page-settings';
import {
  settingsStorageValue,
  restoreSettingsCollections,
  restoreAppletConfiguration,
} from '../../shared/settings-storage';
import {
  combineSettings,
  configuration,
  deviceName,
  initialDeviceSettings,
  initializeHostPageSettings,
  parseDeviceSettings,
  splitSettings,
  deviceSettingsStorageValue,
  deviceHostKeys,
  type DeviceCollection,
  type DeviceSettings,
  type OperationPermissions,
} from './device-settings';

import {
  generationSettings,
  parseGenerationSettings,
  withGenerationSettings,
  withoutGenerationSettings,
  type GenerationSettings,
} from './generation-settings';

type Scope = 'shared' | 'device' | 'local';
interface Journal {
  version: 1;
  machineName: string;
  committed: boolean;
  files: { scope: Scope | 'mcp-secrets'; before: string | null; after: string }[];
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const read = (file: string) => {
  return fs.readFileSync(file);
};

/** One persisted settings view shared by GUI, Applets and automation. */
export class DeviceSettingsStore extends SettingsStore {
  readonly shared: SettingsStore;
  readonly local: SettingsStore<GenerationSettings>;
  readonly device: SettingsStore<DeviceSettings>;
  private readonly marker: string;
  private readonly journal: string;
  private mutating = false;
  private loaded = false;
  private healthKeys = new Set<string>();
  private deviceConfiguration = '';
  private configurationSignature(value: DeviceSettings) {
    const { uiState: _uiState, ...configuration } = value;
    return JSON.stringify(configuration);
  }
  get operationPermissionsError() {
    return this.device.recovered ? hostText('services.operationPermissions.readFailed') : undefined;
  }
  operationPermissions(): Readonly<OperationPermissions> {
    return this.device.recovered ? {} : (this.device.value.operationPermissions ?? {});
  }
  saveOperationPermissions(patch: Partial<Record<keyof OperationPermissions, unknown>>) {
    if (!this.loaded || this.mutating || fs.existsSync(this.journal))
      throw Error(hostText('services.deviceSettingsStore.busy'));
    const error = this.operationPermissionsError;
    if (error) throw Error(error);
    const device = this.device.value;
    this.device.save(
      { ...device, operationPermissions: { ...device.operationPermissions, ...patch } },
      this.device.revision,
    );
  }
  override uiStateStorage(
    section: 'ribbon' | 'gallery' | 'soundGallery' | 'textGallery' | 'windows',
    key?: string,
  ): StateStorage {
    if (
      (section === 'windows') !== (typeof key === 'string' && !!key) ||
      (key && ['__proto__', 'constructor', 'prototype'].includes(key))
    )
      throw Error('Invalid UI state target');
    const current = () =>
      section === 'windows'
        ? this.device.value.uiState?.windows?.[key!]
        : this.device.value.uiState?.[section];
    let previous: unknown;
    let read = false;
    return {
      read: () => {
        read = true;
        previous = structuredClone(current());
        return structuredClone(previous);
      },
      write: (value) => {
        if (!read) throw Error('Read UI state before saving');
        if (this.writesBlocked || this.mutating || fs.existsSync(this.journal))
          throw Error(hostText('services.deviceSettingsStore.busy'));
        this.device.reload();
        if (this.device.recovered || !same(previous, current()))
          throw new SettingsConflictError(hostText('services.settings.changedBeforeSave'));
        const next = structuredClone(this.device.value);
        const ui = (next.uiState ??= {});
        if (section === 'windows') (ui.windows ??= {})[key!] = value as any;
        else ui[section] = value as any;
        next.uiState = parseDeviceUiState(ui);
        this.device.save(next, this.device.revision);
        previous = structuredClone(current());
      },
    };
  }
  hostPageLocalSettings(pageId: HostPageSettingsId) {
    return (
      isDeviceOnlyHostPage(pageId) ||
      (this.device.value.hostPages[pageId]?.useLocalSettings ?? false)
    );
  }
  override settingScope(path: readonly string[]): Scope {
    if (path[0] === 'mcpClient') return 'device';
    if (
      ['ai', 'tts', 'imageAi'].includes(path[0]) ||
      (path[0] === 'notificationPreferences' && path[1] === 'speech' && path[2] === 'connectionId')
    )
      return 'local';
    const pageId = hostPageForPath(path);
    if (pageId) return this.hostPageLocalSettings(pageId) ? 'device' : 'shared';
    return path[0] === 'host' && (deviceHostKeys as readonly string[]).includes(path[1])
      ? 'device'
      : 'shared';
  }
  override storedValue(): Record<string, any> {
    const shared = this.shared.storedValue(),
      device = this.device.storedValue();
    const result = structuredClone(shared);
    delete result.mcpServers;
    delete result.operationPermissions;
    result.mcpClient = structuredClone(this.device.value.mcpClient);
    result.host ??= {};
    for (const key of deviceHostKeys) {
      const pageId = hostPageForPath(['host', key]);
      if (pageId) continue;
      delete result.host[key];
      if (device.host && Object.hasOwn(device.host, key)) result.host[key] = device.host[key];
    }
    for (const pageId of hostPageSettingsIds) {
      const entry = device.hostPages?.[pageId];
      if (isDeviceOnlyHostPage(pageId) || entry?.useLocalSettings)
        applyHostPageConfiguration(result, entry?.configuration ?? {}, pageId);
    }
    return withGenerationSettings(result, this.local.value);
  }
  override appletConfigurationScope(owner: string): 'shared' | 'device' {
    return this.localSettings(owner) ? 'device' : 'shared';
  }
  override storedAppletConfiguration(owner: string): Record<string, unknown> {
    const local = this.device.storedValue().extensions?.[owner];
    const entry = local?.useLocalSettings
      ? local.configuration
      : this.shared.storedValue().extensions?.[owner];
    return entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : {};
  }
  confirmedAppletSources() {
    if (!this.loaded || this.mutating || this.writesBlocked || fs.existsSync(this.journal)) return;
    const shared = this.shared.confirmedValue();
    const device = this.device.confirmedValue();
    if (shared && device) return { shared: shared.extensions, device: device.extensions };
  }
  override storedSettingOverrides(owner: string, collection?: CollectionBinding) {
    if (owner === 'appdock') return storedSettingRecord(this.storedValue(), owner);
    const shared = this.shared.storedValue(),
      device = this.device.storedValue();
    const actualOwner = collection?.owner ?? owner;
    const local = device.extensions?.[actualOwner];
    const raw = local?.useLocalSettings
      ? { extensions: { [actualOwner]: local.configuration } }
      : shared;
    const record = { ...storedSettingRecord(raw, owner, collection) };
    if (collection) {
      delete record.enabled;
      const states = device.collectionEnabled?.[collection.owner]?.[collection.key];
      if (states && Object.hasOwn(states, collection.itemId))
        record.enabled = states[collection.itemId];
    }
    return record;
  }
  constructor(
    file: string,
    private localRoot: string,
    readonly machineName: string,
    private collections: () => DeviceCollection[] = () => [],
    private applets: () => ExtensionManifest[] = () => [],
  ) {
    super(file);
    deviceName(machineName);
    const backups = path.join(localRoot, 'settings-backups');
    const deviceBackups = path.join(backups, 'device', machineName.toLowerCase());
    this.marker = path.join(deviceBackups, 'initialized.json');
    this.journal = path.join(localRoot, 'settings-transactions', 'settings.json');
    this.shared = new SettingsStore(file, backups, {
      defaults: () => this.value,
      parse: (raw) =>
        restoreSettingsCollections(
          parseSettings(withoutDeviceMcp(withoutGenerationSettings(raw))),
          this.applets(),
        ),
      serialize: (value) =>
        withoutDeviceMcp(withoutGenerationSettings(settingsStorageValue(value, this.applets()))),
    });
    this.device = new SettingsStore(
      path.join(path.dirname(file), `settings-${machineName}.json`),
      deviceBackups,
      {
        defaults: () => initialDeviceSettings(machineName),
        parse: (raw) => {
          const value = parseDeviceSettings(withoutGenerationSettings(raw), machineName);
          const applets = this.applets();
          for (const [owner, entry] of Object.entries(value.extensions))
            if (entry.configuration)
              entry.configuration = restoreAppletConfiguration(
                entry.configuration,
                applets.find((a) => a.id === owner),
              );
          return value;
        },
        serialize: (value) =>
          withoutGenerationSettings(deviceSettingsStorageValue(value, this.applets())),
        transientChange: (before, after) =>
          this.configurationSignature(before) === this.configurationSignature(after),
      },
    );
    this.local = new SettingsStore(
      path.join(localRoot, 'generation-ai.json'),
      path.join(backups, 'generation-ai'),
      {
        defaults: () => parseGenerationSettings({ version: 1 }),
        parse: parseGenerationSettings,
      },
    );
    for (const store of [this.shared, this.device, this.local]) {
      store.on('changed', () => {
        if (
          store === this.device &&
          this.deviceConfiguration === this.configurationSignature(this.device.value)
        )
          return;
        if (this.loaded && !this.mutating) this.refreshCombined(true);
      });
      store.on('statusChanged', () => {
        if (!this.mutating) this.syncHealth();
      });
    }
  }
  private syncHealth() {
    const keys = new Set<string>();
    for (const [scope, store] of [
      ['shared', this.shared],
      ['device', this.device],
      ['local', this.local],
    ] as const) {
      for (const issue of store.health.all()) {
        const key = `${scope}-${issue.key}`;
        keys.add(key);
        this.health.set(
          key,
          issue.kind,
          0,
          issue.immediate,
          hostText('services.deviceSettingsStore.scopedIssue', {
            scope: String(
              scope === 'local'
                ? hostText('settings.storage.local')
                : scope === 'device'
                  ? hostText('services.deviceSettingsStore.deviceScope')
                  : hostText('services.deviceSettingsStore.sharedScope'),
            ),
            message: String(issue.message.replaceAll('settings.json', path.basename(store.file))),
          }),
        );
      }
    }
    for (const key of this.healthKeys) if (!keys.has(key)) this.health.clear(key);
    this.healthKeys = keys;
    this.recovered = this.shared.recovered || this.device.recovered || this.local.recovered;
  }
  private refreshCombined(notify: boolean) {
    const initialized = initializeHostPageSettings(this.device.value, this.shared.value);
    if (initialized !== this.device.value && !this.shared.recovered && !this.device.recovered) {
      const mutating = this.mutating;
      this.mutating = true;
      try {
        this.device.save(initialized, this.device.revision);
      } finally {
        this.mutating = mutating;
      }
    }
    const value = hostStartupTiming.measure('settingsCombine', () =>
      combineSettings(this.shared.value, initialized, this.collections()),
    );
    this.value = withGenerationSettings(value, this.local.value);
    this.deviceConfiguration = this.configurationSignature(this.device.value);
    this.syncHealth();
    this.revision++;
    if (notify) this.emit('changed', this.snapshot());
  }
  private persistMarker() {
    if (!fs.existsSync(this.marker))
      atomicWrite(
        this.marker,
        JSON.stringify({ schemaVersion: 1, machineName: this.machineName }),
        { previous: undefined },
      );
  }
  private loadDevice() {
    if (!fs.existsSync(this.device.file) && !this.device.backupCandidate()) {
      if (fs.existsSync(this.marker)) {
        this.device.recovered = true;
        this.device.health.set('read', 'read-unavailable');
        throw Error(hostText('services.deviceSettingsStore.recoveryRequired'));
      }
      atomicWrite(
        this.device.file,
        this.device.serialize(
          initializeHostPageSettings(
            initialDeviceSettings(this.machineName, this.shared.value, this.collections()),
          ),
        ),
        { previous: undefined },
      );
    }
    this.device.load();
    this.persistMarker();
  }
  override load() {
    this.recoverTransaction();
    this.shared.load();
    this.loadDevice();
    this.local.load();
    this.loaded = true;
    this.refreshCombined(false);
    return this.snapshot();
  }
  override assertRevision(revision: number) {
    if (this.mutating || fs.existsSync(this.journal))
      throw Error(hostText('services.deviceSettingsStore.busy'));
    for (const store of [this.shared, this.device, this.local]) {
      try {
        store.assertRevision(store.revision);
      } catch (error) {
        if (!store.recovered) throw error;
      }
    }
    this.syncHealth();
    if (revision !== this.revision)
      throw new SettingsConflictError(hostText('services.deviceSettingsStore.revisionConflict'));
  }
  private fileFor(scope: Scope | 'mcp-secrets') {
    if (scope === 'mcp-secrets') return path.join(this.localRoot, 'mcp-client-secrets.json');
    return this.storeFor(scope).file;
  }
  private storeFor(scope: Scope) {
    return scope === 'local' ? this.local : scope === 'device' ? this.device : this.shared;
  }
  private recoverTransaction() {
    if (!fs.existsSync(this.journal)) return;
    try {
      const journal = JSON.parse(fs.readFileSync(this.journal, 'utf8')) as Journal;
      if (
        journal.version !== 1 ||
        journal.machineName.toLowerCase() !== this.machineName.toLowerCase() ||
        typeof journal.committed !== 'boolean' ||
        !Array.isArray(journal.files) ||
        journal.files.length > 4 ||
        new Set(journal.files.map((item) => item.scope)).size !== journal.files.length
      )
        throw Error('journal schema');
      for (const item of journal.files) {
        if (
          !['shared', 'device', 'local', 'mcp-secrets'].includes(item.scope) ||
          (typeof item.before !== 'string' &&
            !(item.scope === 'mcp-secrets' && item.before === null)) ||
          typeof item.after !== 'string' ||
          !/^[A-Za-z0-9+/=]*$/.test((item.before ?? '') + item.after)
        )
          throw Error('journal entry');
        // An explicitly reset secret document may contain invalid original bytes.
        for (const text of item.scope === 'mcp-secrets'
          ? [item.after]
          : [item.before!, item.after]) {
          const value = JSON.parse(
            Buffer.from(text, 'base64')
              .toString('utf8')
              .replace(/^\uFEFF/, ''),
          );
          if (item.scope === 'mcp-secrets') {
            if (
              !value ||
              value.version !== 1 ||
              !value.entries ||
              typeof value.entries !== 'object' ||
              Array.isArray(value.entries)
            )
              throw Error('secret journal schema');
          } else if (item.scope === 'local') parseGenerationSettings(value);
          else if (item.scope === 'shared') parseSettings(withoutGenerationSettings(value));
          else parseDeviceSettings(withoutGenerationSettings(value), this.machineName);
        }
      }
      if (!journal.committed) {
        // Check every target before restoring any file; never overwrite an external writer.
        for (const item of journal.files) {
          const file = this.fileFor(item.scope);
          const current = fs.existsSync(file) ? read(file).toString('base64') : null;
          if (current !== item.before && current !== item.after)
            throw Error('external settings change');
        }
        for (const item of [...journal.files].reverse()) {
          const file = this.fileFor(item.scope),
            current = fs.existsSync(file) ? read(file) : undefined;
          if (current?.toString('base64') === item.after) {
            if (item.before === null) fs.unlinkSync(file);
            else atomicWrite(file, Buffer.from(item.before, 'base64'), { previous: current });
          }
        }
      }
      fs.unlinkSync(this.journal);
      this.health.clear('transaction');
    } catch {
      this.health.set('transaction', 'save-failed');
      throw Error(hostText('services.deviceSettingsStore.unsafeRecovery'));
    }
  }
  private commitPair(
    shared: Settings,
    device: DeviceSettings,
    revision: number,
    asset?: SettingsAsset,
    rewrite: Scope[] = [],
    local = this.local.value,
  ) {
    shared = parseSettings(withoutDeviceMcp(withoutGenerationSettings(shared)));
    device = parseDeviceSettings(withoutGenerationSettings(device), this.machineName);
    if (this.writesBlocked) throw Error(hostText('services.deviceSettingsStore.restoring'));
    this.assertRevision(revision);
    const files: Journal['files'] = [];
    if (!same(shared, this.shared.value) || rewrite.includes('shared'))
      files.push({
        scope: 'shared',
        before: read(this.shared.file).toString('base64'),
        after: Buffer.from(this.shared.serialize(shared)).toString('base64'),
      });
    if (!same(device, this.device.value) || rewrite.includes('device'))
      files.push({
        scope: 'device',
        before: read(this.device.file).toString('base64'),
        after: Buffer.from(this.device.serialize(device)).toString('base64'),
      });
    if (!same(local, this.local.value) || rewrite.includes('local'))
      files.push({
        scope: 'local',
        before: read(this.local.file).toString('base64'),
        after: Buffer.from(this.local.serialize(local)).toString('base64'),
      });
    for (const item of files)
      if (item.scope !== 'mcp-secrets' && this.storeFor(item.scope).recovered)
        throw Error(hostText('services.deviceSettingsStore.targetRecoveryRequired'));
    if (asset?.recovery) files.unshift(asset.recovery);
    if (!files.length && !asset) return this.snapshot();
    this.mutating = true;
    const journal: Journal = { version: 1, machineName: this.machineName, committed: false, files };
    try {
      atomicWrite(this.journal, JSON.stringify(journal), { previous: undefined });
      asset?.commit();
      for (const item of files) {
        if (item.scope === 'mcp-secrets') continue; // Written by the guarded asset transaction.
        if (item.scope === 'local') this.local.save(local, this.local.revision);
        else if (item.scope === 'shared') this.shared.save(shared, this.shared.revision);
        else this.device.save(device, this.device.revision);
      }
      journal.committed = true;
      atomicWrite(this.journal, JSON.stringify(journal));
      try {
        fs.unlinkSync(this.journal);
      } catch {
        this.health.set('transaction', 'save-failed');
      } // Durable success must never roll back assets or the OS task.
    } catch (error) {
      try {
        asset?.rollback();
        this.recoverTransaction();
      } catch {
        this.health.set('transaction', 'save-failed');
      }
      for (const store of [this.shared, this.device, this.local])
        try {
          store.reload();
        } catch {
          /* Retain last-good with its read error. */
        }
      this.health.set('save', 'save-failed');
      if (!fs.existsSync(this.journal)) this.refreshCombined(true);
      throw error;
    } finally {
      this.mutating = false;
      this.syncHealth();
    }
    this.health.clear('save');
    this.refreshCombined(true);
    return this.snapshot();
  }
  override save(value: unknown, revision: number, asset?: SettingsAsset, rewrite: Scope[] = []) {
    this.assertRevision(revision);
    const next = restoreSettingsCollections(parseSettings(value), this.applets());
    new AssignedImages(path.join(path.dirname(this.file), 'assets', 'images')).prepare(
      next,
      this.value,
      this.applets(),
    );
    const split = splitSettings(
      parseSettings(withoutGenerationSettings(next)),
      parseSettings(withoutGenerationSettings(this.value)),
      this.shared.value,
      this.device.value,
      this.collections(),
    );
    return this.commitPair(
      split.shared,
      split.device,
      revision,
      asset,
      rewrite,
      generationSettings(next),
    );
  }
  setLocalSettings(
    owner: string,
    enabled: boolean,
    revision: number,
    validate?: (value: Settings) => void,
    disposition: 'keep' | 'share' | 'clear' = 'keep',
  ) {
    this.assertRevision(revision);
    if (typeof enabled !== 'boolean')
      throw Error(hostText('services.deviceSettingsStore.appletMissing'));
    if (!['keep', 'share', 'clear'].includes(disposition) || (enabled && disposition !== 'keep'))
      throw Error(hostText('services.deviceSettingsStore.invalidScope'));
    const shared = structuredClone(this.shared.value);
    const next = structuredClone(this.device.value);
    const entry = (next.extensions[owner] ??= {
      enabled: appletEnabled(this.value, owner),
      useLocalSettings: false,
    });
    if (entry.useLocalSettings === enabled) return this.snapshot();
    if (enabled && !entry.configuration) {
      if (this.shared.recovered)
        throw Error(hostText('services.deviceSettingsStore.sharedRecoveryBeforeCopy'));
      entry.configuration = configuration(this.value, owner);
    }
    if (!enabled && this.shared.recovered)
      throw Error(hostText('services.deviceSettingsStore.sharedRecoveryBeforeSwitch'));
    if (!enabled && disposition === 'share') {
      const stored = (shared.extensions[owner] ??= { enabled: false, settings: {} });
      const candidate = configuration(this.value, owner);
      // Collection flags remain local. Copy only the original persisted configuration values.
      for (const { owner: collectionOwner, definition } of this.collections()) {
        if (collectionOwner !== owner) continue;
        const rows = candidate.settings[definition.key];
        const raw = entry.configuration?.settings[definition.key];
        if (Array.isArray(rows))
          for (const row of rows) {
            const original = Array.isArray(raw)
              ? raw.find((item) => item?.id === row.id)
              : undefined;
            row.enabled = original?.enabled ?? false;
          }
      }
      stored.settings = candidate.settings;
      delete stored.pages;
      for (const key of appletCommonKeys()) delete stored[key];
      Object.assign(stored, candidate);
    }
    if (!enabled && disposition !== 'keep') delete entry.configuration;
    entry.useLocalSettings = enabled;
    parseDeviceSettings(next, this.machineName);
    validate?.(combineSettings(shared, next, this.collections()));
    return this.commitPair(parseSettings(shared), next, revision);
  }
  localSettings(owner: string) {
    return this.device.value.extensions[owner]?.useLocalSettings ?? false;
  }
  setHostPageLocalSettings(
    pageId: HostPageSettingsId,
    enabled: boolean,
    revision: number,
    validate?: (value: Settings) => void,
    disposition: 'keep' | 'share' | 'clear' = 'keep',
    applets: ExtensionSnapshot[] = [],
  ) {
    this.assertRevision(revision);
    if (
      !canSwitchHostPageSettings(pageId) ||
      typeof enabled !== 'boolean' ||
      !['keep', 'share', 'clear'].includes(disposition) ||
      (enabled && disposition !== 'keep')
    )
      throw Error(hostText('services.deviceSettingsStore.invalidScope'));
    const shared = structuredClone(this.shared.value);
    const next = structuredClone(initializeHostPageSettings(this.device.value, shared));
    const entry = next.hostPages[pageId]!;
    if (entry.useLocalSettings === enabled) return this.snapshot();
    if (enabled && !entry.configuration) {
      if (this.shared.recovered)
        throw Error(hostText('services.deviceSettingsStore.sharedRecoveryBeforeCopy'));
      entry.configuration = hostPageConfiguration(this.value, pageId);
      if (pageId === 'tray' && this.value.trayMenu === undefined)
        entry.configuration.trayMenu = getTrayMenu(this.value, applets);
    }
    if (!enabled && this.shared.recovered)
      throw Error(hostText('services.deviceSettingsStore.sharedRecoveryBeforeSwitch'));
    if (!enabled && disposition === 'share')
      applyHostPageConfiguration(shared, hostPageConfiguration(this.value, pageId), pageId);
    if (!enabled && disposition !== 'keep') delete entry.configuration;
    entry.useLocalSettings = enabled;
    const parsed = parseDeviceSettings(next, this.machineName);
    validate?.(combineSettings(shared, parsed, this.collections()));
    return this.commitPair(parseSettings(shared), parsed, revision);
  }
  targetFile(scope: Scope) {
    return this.fileFor(scope);
  }
  diagnostics() {
    return (['shared', 'device', 'local'] as const).map((scope) => {
      const store = this.storeFor(scope);
      return {
        scope,
        path: store.file,
        recovered: store.recovered,
        errors: store.health.all().map((item) => item.message),
        canRestore: store.recovered && !!store.backupCandidate(),
      };
    });
  }
  override watch(
    onError: (error: Error) => void,
    assistance?: import('./file-watch-assistance').FileWatchAssistance,
  ) {
    this.shared.watch(onError, assistance);
    this.device.watch(onError, assistance);
    this.local.watch(onError, assistance);
  }
  override reload() {
    this.recoverTransaction();
    this.mutating = true;
    try {
      this.shared.reload();
      if (this.loaded) this.device.reload();
      else this.loadDevice();
      if (this.loaded) this.local.reload();
      else this.local.load();
    } finally {
      this.mutating = false;
      this.syncHealth();
    }
    this.loaded = true;
    this.refreshCombined(true);
    return this.snapshot();
  }
  private recoveryStore(scope?: Scope) {
    return scope
      ? this.storeFor(scope)
      : this.local.recovered
        ? this.local
        : this.device.recovered
          ? this.device
          : this.shared;
  }
  override backupCandidate() {
    return this.recoveryStore().backupCandidate();
  }
  recoveryPath() {
    return this.recoveryStore().file;
  }
  override prepareRecovery(file?: string, scope?: Scope): SettingsRecoveryPlan {
    const store = this.recoveryStore(scope);
    return {
      ...store.prepareRecovery(file),
      scope: store === this.local ? 'local' : store === this.device ? 'device' : 'shared',
    };
  }
  override restoreRecovery(plan: SettingsRecoveryPlan) {
    this.recoveryStore(plan.scope).restoreRecovery(plan);
    this.persistMarker();
    this.loaded = true;
    this.refreshCombined(true);
    return this.snapshot();
  }
  override restoreBackup(revision: number) {
    if (revision !== this.revision)
      throw new SettingsConflictError(hostText('services.deviceSettingsStore.changed'));
    return this.restoreRecovery(this.prepareRecovery());
  }
  override close() {
    this.shared.close();
    this.device.close();
    this.local.close();
    super.close();
  }
}

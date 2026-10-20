import fs from 'node:fs';
import { appletEnabled } from '../../shared/applet-state';
import path from 'node:path';
import {
  SettingsStore,
  SettingsConflictError,
  atomicWrite,
  type SettingsRecoveryPlan,
} from './settings';
import type { Settings } from '../../shared/contracts';
import { parseSettings } from '../../shared/settings-schema';
import {
  combineSettings,
  configuration,
  deviceName,
  initialDeviceSettings,
  parseDeviceSettings,
  splitSettings,
  type DeviceCollection,
  type DeviceSettings,
} from './device-settings';

type Scope = 'shared' | 'device';
interface Journal {
  version: 1;
  machineName: string;
  committed: boolean;
  files: { scope: Scope; before: string; after: string }[];
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const read = (file: string) => {
  if (fs.statSync(file).size > 4 * 1024 * 1024) throw Error('設定は4MB以下にしてください。');
  return fs.readFileSync(file);
};

/** One persisted settings view shared by GUI, Applets and automation. */
export class DeviceSettingsStore extends SettingsStore {
  readonly shared: SettingsStore;
  readonly device: SettingsStore<DeviceSettings>;
  private readonly marker: string;
  private readonly journal: string;
  private mutating = false;
  private loaded = false;
  private healthKeys = new Set<string>();
  constructor(
    file: string,
    private localRoot: string,
    readonly machineName: string,
    private collections: () => DeviceCollection[] = () => [],
  ) {
    super(file);
    deviceName(machineName);
    const backups = path.join(localRoot, 'settings-backups');
    const deviceBackups = path.join(backups, 'device', machineName.toLowerCase());
    this.marker = path.join(deviceBackups, 'initialized.json');
    this.journal = path.join(localRoot, 'settings-transactions', 'settings.json');
    this.shared = new SettingsStore(file, backups);
    this.device = new SettingsStore(
      path.join(path.dirname(file), `settings-${machineName}.json`),
      deviceBackups,
      {
        defaults: () => initialDeviceSettings(machineName),
        parse: (raw) => parseDeviceSettings(raw, machineName),
      },
    );
    for (const store of [this.shared, this.device]) {
      store.on('changed', () => {
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
    ] as const) {
      for (const issue of store.health.all()) {
        const key = `${scope}-${issue.key}`;
        keys.add(key);
        this.health.set(
          key,
          issue.kind,
          0,
          issue.immediate,
          `${scope === 'device' ? 'このPCの設定' : '共有設定'}: ${issue.message.replaceAll('settings.json', path.basename(store.file))}`,
        );
      }
    }
    for (const key of this.healthKeys) if (!keys.has(key)) this.health.clear(key);
    this.healthKeys = keys;
    this.recovered = this.shared.recovered || this.device.recovered;
  }
  private refreshCombined(notify: boolean) {
    const value = combineSettings(this.shared.value, this.device.value, this.collections());
    this.value = value;
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
        throw Error('このPCの設定と正常なバックアップがありません。復元してください。');
      }
      atomicWrite(
        this.device.file,
        JSON.stringify(
          initialDeviceSettings(this.machineName, this.shared.value, this.collections()),
          null,
          2,
        ) + '\n',
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
    this.loaded = true;
    this.refreshCombined(false);
    return this.snapshot();
  }
  override assertRevision(revision: number) {
    if (this.mutating || fs.existsSync(this.journal))
      throw Error('設定を処理中です。復旧を完了してから再実行してください。');
    for (const store of [this.shared, this.device]) {
      try {
        store.assertRevision(store.revision);
      } catch (error) {
        if (!store.recovered) throw error;
      }
    }
    this.syncHealth();
    if (revision !== this.revision)
      throw new SettingsConflictError('設定または保存先が変更されています。再取得してください。');
  }
  private fileFor(scope: Scope) {
    return scope === 'shared' ? this.shared.file : this.device.file;
  }
  private recoverTransaction() {
    if (!fs.existsSync(this.journal)) return;
    try {
      if (fs.statSync(this.journal).size > 32 * 1024 * 1024) throw Error('journal size');
      const journal = JSON.parse(fs.readFileSync(this.journal, 'utf8')) as Journal;
      if (
        journal.version !== 1 ||
        journal.machineName.toLowerCase() !== this.machineName.toLowerCase() ||
        typeof journal.committed !== 'boolean' ||
        !Array.isArray(journal.files) ||
        journal.files.length > 2 ||
        new Set(journal.files.map((item) => item.scope)).size !== journal.files.length
      )
        throw Error('journal schema');
      for (const item of journal.files) {
        if (
          !['shared', 'device'].includes(item.scope) ||
          typeof item.before !== 'string' ||
          typeof item.after !== 'string' ||
          !/^[A-Za-z0-9+/=]*$/.test(item.before + item.after)
        )
          throw Error('journal entry');
        for (const text of [item.before, item.after]) {
          const value = JSON.parse(
            Buffer.from(text, 'base64')
              .toString('utf8')
              .replace(/^\uFEFF/, ''),
          );
          if (item.scope === 'shared') parseSettings(value);
          else parseDeviceSettings(value, this.machineName);
        }
      }
      if (!journal.committed) {
        // Check every target before restoring any file; never overwrite an external writer.
        for (const item of journal.files) {
          const current = read(this.fileFor(item.scope)).toString('base64');
          if (current !== item.before && current !== item.after)
            throw Error('external settings change');
        }
        for (const item of [...journal.files].reverse()) {
          const file = this.fileFor(item.scope),
            current = read(file);
          if (current.toString('base64') === item.after)
            atomicWrite(file, Buffer.from(item.before, 'base64'), { previous: current });
        }
      }
      fs.unlinkSync(this.journal);
      this.health.clear('transaction');
    } catch {
      this.health.set('transaction', 'save-failed');
      throw Error(
        '途中の設定保存を安全に復旧できません。設定ファイルと復旧記録を確認してください。',
      );
    }
  }
  private commitPair(
    shared: Settings,
    device: DeviceSettings,
    revision: number,
    asset?: { commit(): void; rollback(): void },
  ) {
    if (this.writesBlocked) throw Error('設定を復元中です。完了後に保存してください。');
    this.assertRevision(revision);
    const files: Journal['files'] = [];
    if (!same(shared, this.shared.value))
      files.push({
        scope: 'shared',
        before: read(this.shared.file).toString('base64'),
        after: Buffer.from(JSON.stringify(shared, null, 2) + '\n').toString('base64'),
      });
    if (!same(device, this.device.value))
      files.push({
        scope: 'device',
        before: read(this.device.file).toString('base64'),
        after: Buffer.from(JSON.stringify(device, null, 2) + '\n').toString('base64'),
      });
    for (const item of files)
      if (Buffer.from(item.after, 'base64').length > 4 * 1024 * 1024)
        throw Error('設定ファイルは4MB以下にしてください。');
    for (const item of files)
      if ((item.scope === 'shared' ? this.shared : this.device).recovered)
        throw Error('保存対象の設定ファイルを復旧してください。');
    if (!files.length && !asset) return this.snapshot();
    this.mutating = true;
    const journal: Journal = { version: 1, machineName: this.machineName, committed: false, files };
    try {
      atomicWrite(this.journal, JSON.stringify(journal), { previous: undefined });
      asset?.commit();
      for (const item of files) {
        if (item.scope === 'shared') this.shared.save(shared, this.shared.revision);
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
      for (const store of [this.shared, this.device])
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
  override save(value: unknown, revision: number, asset?: { commit(): void; rollback(): void }) {
    this.assertRevision(revision);
    const next = parseSettings(value);
    const split = splitSettings(
      next,
      this.value,
      this.shared.value,
      this.device.value,
      this.collections(),
    );
    return this.commitPair(split.shared, split.device, revision, asset);
  }
  setLocalSettings(
    owner: string,
    enabled: boolean,
    revision: number,
    validate?: (value: Settings) => void,
  ) {
    this.assertRevision(revision);
    if (typeof enabled !== 'boolean') throw Error('Appletの設定対象がありません。');
    const next = structuredClone(this.device.value);
    const entry = (next.extensions[owner] ??= {
      enabled: appletEnabled(this.value, owner),
      useLocalSettings: false,
    });
    if (entry.useLocalSettings === enabled) return this.snapshot();
    if (enabled && !entry.configuration) {
      if (this.shared.recovered) throw Error('共有設定を復旧してから端末用にコピーしてください。');
      entry.configuration = configuration(this.value, owner);
    }
    if (!enabled && this.shared.recovered)
      throw Error('共有設定を復旧してから切り替えてください。');
    entry.useLocalSettings = enabled;
    parseDeviceSettings(next, this.machineName);
    validate?.(combineSettings(this.shared.value, next, this.collections()));
    return this.commitPair(this.shared.value, next, revision);
  }
  localSettings(owner: string) {
    return this.device.value.extensions[owner]?.useLocalSettings ?? false;
  }
  targetFile(scope: Scope) {
    return this.fileFor(scope);
  }
  diagnostics() {
    return (['shared', 'device'] as const).map((scope) => {
      const store = scope === 'shared' ? this.shared : this.device;
      return {
        scope,
        path: store.file,
        recovered: store.recovered,
        errors: store.health.all().map((item) => item.message),
        canRestore: store.recovered && !!store.backupCandidate(),
      };
    });
  }
  override watch(onError: (error: Error) => void) {
    this.shared.watch(onError);
    this.device.watch(onError);
  }
  override reload() {
    this.recoverTransaction();
    this.mutating = true;
    try {
      this.shared.reload();
      if (this.loaded) this.device.reload();
      else this.loadDevice();
    } finally {
      this.mutating = false;
      this.syncHealth();
    }
    this.loaded = true;
    this.refreshCombined(true);
    return this.snapshot();
  }
  private recoveryStore(scope?: Scope) {
    return scope === 'device' || (!scope && this.device.recovered) ? this.device : this.shared;
  }
  override backupCandidate() {
    return this.recoveryStore().backupCandidate();
  }
  recoveryPath() {
    return this.recoveryStore().file;
  }
  override prepareRecovery(file?: string, scope?: Scope): SettingsRecoveryPlan {
    const store = this.recoveryStore(scope);
    return { ...store.prepareRecovery(file), scope: store === this.device ? 'device' : 'shared' };
  }
  override restoreRecovery(plan: SettingsRecoveryPlan) {
    this.recoveryStore(plan.scope).restoreRecovery(plan);
    this.persistMarker();
    this.loaded = true;
    this.refreshCombined(true);
    return this.snapshot();
  }
  override restoreBackup(revision: number) {
    if (revision !== this.revision) throw new SettingsConflictError('設定が変更されています。');
    return this.restoreRecovery(this.prepareRecovery());
  }
  override close() {
    this.shared.close();
    this.device.close();
    super.close();
  }
}

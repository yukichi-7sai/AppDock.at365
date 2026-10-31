import { hostText } from '../../shared/i18n';
import { hostStartupTiming } from './host-startup-timing';
import fs from 'node:fs';
import { defaultAppletEnabled } from '../../shared/applet-state';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { randomUUID, createHash } from 'node:crypto';
import { observeFile } from './file-observer';
import type { FileWatchAssistance } from './file-watch-assistance';
import { SettingsHealth, settingsIssueMessages } from './settings-health';
import type { Settings, SettingsSnapshot, ExtensionSettings } from '../../shared/contracts';
import { settingsStorageValue } from '../../shared/settings-storage';
import type { CollectionBinding } from '../../shared/page-collections';
import {
  createDefaultSettings as defaults,
  parseSettings as validate,
} from '../../shared/settings-schema';
const isObject = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
export function storedSettingRecord(
  raw: Record<string, any>,
  owner: string,
  collection?: CollectionBinding,
): Record<string, unknown> {
  if (owner === 'appdock') return isObject(raw.host) ? raw.host : {};
  const settings = raw.extensions?.[collection?.owner ?? owner]?.settings;
  if (!isObject(settings)) return {};
  if (!collection) return settings;
  const rows = settings[collection.key];
  return (
    (Array.isArray(rows) && rows.find((row) => isObject(row) && row.id === collection.itemId)) || {}
  );
}
export class SettingsConflictError extends Error {}
class SettingsReadError extends Error {
  constructor(readonly kind: 'read-invalid' | 'read-unavailable') {
    super(settingsIssueMessages[kind]);
  }
}
export interface SettingsRecoveryPlan {
  readonly scope?: 'shared' | 'device';
  readonly candidate: string;
  readonly candidateHash: string;
  readonly modifiedAt: number;
  readonly previous: Buffer | undefined;
  readonly revision: number;
}
const hashBytes = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const sameBytes = (a: Buffer | undefined, b: Buffer | undefined) =>
  a === undefined ? b === undefined : !!b?.equals(a);
function atomicWrite(
  file: string,
  text: string | Uint8Array,
  expected?: { previous: Buffer | undefined },
) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const readPrevious = () => {
    try {
      return fs.readFileSync(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  };
  const previous = expected ? expected.previous : readPrevious();
  const tmp = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(tmp, text, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    for (let attempt = 0; ; attempt++) {
      {
        const current = readPrevious();
        if (!sameBytes(previous, current))
          throw new SettingsConflictError(hostText('services.settings.pathChanged'));
      }
      try {
        fs.renameSync(tmp, file);
        break;
      } catch (error) {
        if (
          process.platform !== 'win32' ||
          attempt >= 3 ||
          !['EPERM', 'EACCES', 'EBUSY'].includes((error as NodeJS.ErrnoException).code ?? '')
        )
          throw error;
        // Retry only the same atomic replacement, never the setting operation or a toggle.
        // Readers can briefly deny rename on Windows; preserve any intervening writer.
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25 * (attempt + 1));
      }
    }
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}
class SettingsStore<T = Settings> extends EventEmitter {
  file: string;
  revision: number;
  value: T;
  watcher?: fs.FSWatcher;
  timer?: ReturnType<typeof setTimeout>;
  private observer?: ReturnType<typeof observeFile>;
  private lastBackup = '';
  private lastBackupTime = 0;
  readonly health = new SettingsHealth(() => this.emit('statusChanged', this.snapshot()));
  get syncError() {
    return (
      this.health
        .all()
        .map((i) => i.message)
        .join('\n') || undefined
    );
  }
  recovered = false;
  writesBlocked = false;
  /** Shared-only stores have session state; the host overrides this per device. */
  uiStateStorage(
    _section: 'ribbon' | 'gallery' | 'windows',
    _key?: string,
  ): import('./state-storage').StateStorage {
    let value: unknown;
    return {
      read: () => structuredClone(value),
      write: (next) => {
        value = structuredClone(next);
      },
    };
  }
  constructor(
    file: string,
    private backupDirectory?: string,
    private codec?: {
      defaults(): T;
      parse(value: unknown): T;
      serialize?(value: T): unknown;
      transientChange?(before: T, after: T): boolean;
    },
  ) {
    super();
    this.file = file;
    this.revision = 0;
    this.value = codec ? codec.defaults() : (defaults() as T);
  }
  serialize(value: T): string {
    const stored = this.codec
      ? (this.codec.serialize?.(value) ?? value)
      : settingsStorageValue(value as Settings);
    return JSON.stringify(stored, null, 2) + '\n';
  }
  storedValue(): Record<string, any> {
    const value = JSON.parse(
      this.readBytes(this.file)
        .toString('utf8')
        .replace(/^\uFEFF/, ''),
    );
    if (!isObject(value)) throw new SettingsReadError('read-invalid');
    return value;
  }
  storedSettingOverrides(owner: string, collection?: CollectionBinding) {
    return storedSettingRecord(this.storedValue(), owner, collection);
  }
  appletConfigurationScope(_owner: string): 'shared' | 'device' {
    return 'shared';
  }
  settingScope(_path: readonly string[]): 'shared' | 'device' {
    return 'shared';
  }
  storedAppletConfiguration(owner: string): Record<string, unknown> {
    const entry = this.storedValue().extensions?.[owner];
    return isObject(entry) ? entry : {};
  }
  private readBytes(file: string): Buffer {
    return hostStartupTiming.measure('settingsRead', () => this.readBytesCore(file));
  }
  private readBytesCore(file: string): Buffer {
    try {
      const stat = fs.statSync(file);
      if (!stat.isFile()) throw new SettingsReadError('read-unavailable');
      const bytes = fs.readFileSync(file);
      hostStartupTiming.count('readBytes', bytes.length, true);
      if (file === this.file) {
        const name = path.basename(file);
        if (name === 'settings.json') hostStartupTiming.countOnce('sharedBytes', bytes.length);
        else if (/^settings-.+\.json$/.test(name))
          hostStartupTiming.countOnce('deviceBytes', bytes.length);
      }
      return bytes;
    } catch {
      throw new SettingsReadError('read-unavailable');
    }
  }
  private parse(bytes: Buffer | string) {
    try {
      const raw = hostStartupTiming.measure('settingsJson', () =>
        JSON.parse(bytes.toString().replace(/^\uFEFF/, '')),
      );
      const value = hostStartupTiming.measure('settingsValidate', () =>
        this.codec ? this.codec.parse(raw) : (validate(raw) as T),
      );
      return value;
    } catch {
      throw new SettingsReadError('read-invalid');
    }
  }
  private readDisk() {
    this.observer?.invalidate();
    return this.parse(this.readBytes(this.file));
  }
  private readFailure(error: unknown, immediate = true) {
    this.recovered = true;
    this.health.set(
      'read',
      error instanceof SettingsReadError ? error.kind : 'read-unavailable',
      0,
      immediate,
    );
  }
  private backupFiles() {
    if (!this.backupDirectory) return [];
    try {
      return [
        'last-good.json',
        ...fs
          .readdirSync(this.backupDirectory)
          .filter((n) => /^settings-.*\.json$/.test(n))
          .sort()
          .reverse(),
      ].map((n) => path.join(this.backupDirectory!, n));
    } catch {
      return [];
    }
  }
  backupCandidate(): { file: string; modifiedAt: number } | undefined {
    for (const file of this.backupFiles()) {
      try {
        this.parse(this.readBytes(file));
        return { file, modifiedAt: fs.statSync(file).mtimeMs };
      } catch {
        /* Try the next local generation. */
      }
    }
  }
  private tryBackup(value: T) {
    try {
      hostStartupTiming.measure('settingsBackup', () => this.backup(value));
      this.health.clear('backup');
    } catch {
      this.health.set('backup', 'backup-failed');
    }
  }
  load() {
    try {
      if (!fs.existsSync(this.file)) {
        if (
          this.backupDirectory &&
          fs.existsSync(this.backupDirectory) &&
          fs
            .readdirSync(this.backupDirectory)
            .some(
              (name) =>
                name === 'last-good.json' || /^(settings-.*\.json|invalid-.*\.txt)$/.test(name),
            )
        )
          throw Error(hostText('services.settings.missing'));
        try {
          atomicWrite(this.file, this.serialize(this.value), {
            previous: undefined,
          });
        } catch (error) {
          if (!(error instanceof SettingsConflictError)) throw error;
        }
      }
      this.value = this.readDisk();
    } catch (error) {
      this.readFailure(error);
      const candidate = this.backupCandidate();
      if (!candidate) throw error;
      this.value = this.parse(this.readBytes(candidate.file));
    }
    if (!this.recovered) this.tryBackup(this.value);
    this.revision++;
    return this.snapshot();
  }
  snapshot(): SettingsSnapshot<T> {
    return hostStartupTiming.measure('settingsSnapshot', () => this.snapshotCore());
  }
  private snapshotCore(): SettingsSnapshot<T> {
    return {
      value: structuredClone(this.value),
      revision: this.revision,
      path: this.file,
      syncError: this.syncError,
      recovered: this.recovered,
    };
  }
  private backup(value: T) {
    if (!this.backupDirectory) return;
    const text = this.serialize(value);
    const hash = createHash('sha256').update(text).digest('hex');
    if (hash === this.lastBackup) {
      try {
        if (hashBytes(this.readBytes(path.join(this.backupDirectory, 'last-good.json'))) === hash)
          return;
      } catch {
        /* Retry a missing or unreadable backup. */
      }
    }
    this.lastBackupTime = Math.max(Date.now(), this.lastBackupTime + 1);
    atomicWrite(
      path.join(this.backupDirectory, `settings-${this.lastBackupTime}-${randomUUID()}.json`),
      text,
    );
    atomicWrite(path.join(this.backupDirectory, 'last-good.json'), text);
    const generations = fs
      .readdirSync(this.backupDirectory)
      .filter((n) => /^settings-.*\.json$/.test(n))
      .sort()
      .reverse();
    for (const old of generations.slice(20)) fs.unlinkSync(path.join(this.backupDirectory, old));
    this.lastBackup = hash;
  }
  private accept(next: T) {
    this.observer?.resetError();
    const changed = JSON.stringify(next) !== JSON.stringify(this.value);
    const unhealthy = this.syncError || this.recovered;
    this.recovered = false;
    this.health.clear('read');
    if (!this.codec?.transientChange?.(this.value, next)) this.tryBackup(next);
    if (changed) {
      this.value = next;
      this.revision++;
      this.emit('changed', this.snapshot());
    } else if (unhealthy) this.emit('statusChanged', this.snapshot());
  }
  assertRevision(revision: number) {
    // Also detect a manual edit before the file watcher has delivered it.
    let disk: T;
    try {
      disk = this.readDisk();
    } catch (error) {
      this.readFailure(error);
      throw error;
    }
    if (JSON.stringify(disk) !== JSON.stringify(this.value)) {
      this.accept(disk);
    }
    if (revision !== this.revision)
      throw new SettingsConflictError(hostText('services.settings.changedBeforeSave'));
  }
  save(value: unknown, revision: number, asset?: { commit(): void; rollback(): void }) {
    if (this.writesBlocked) throw Error(hostText('services.settings.restoring'));
    this.assertRevision(revision);
    const parsed = this.codec ? this.codec.parse(value) : (validate(value) as T);
    const serialized = this.serialize(parsed);
    const next = this.parse(serialized);
    const transient = this.codec?.transientChange?.(this.value, next) === true;
    if (!transient) this.tryBackup(this.value);
    const previous = this.readBytes(this.file);
    if (JSON.stringify(this.parse(previous)) !== JSON.stringify(this.value)) {
      this.accept(this.parse(previous));
      throw new SettingsConflictError(hostText('services.settings.changed'));
    }
    try {
      asset?.commit();
      atomicWrite(this.file, serialized, { previous });
    } catch (error) {
      if (!(error instanceof SettingsConflictError)) this.health.set('save', 'save-failed');
      try {
        asset?.rollback();
      } catch (rollbackError) {
        this.health.set('save', 'save-failed');
        throw new Error(hostText('services.settings.dataRestoreFailed'));
      }
      throw error;
    }
    this.value = next;
    this.observer?.invalidate(serialized);
    this.observer?.resetError();
    this.health.clear('save');
    this.health.clear('read');
    if (!transient) this.tryBackup(next);
    this.recovered = false;
    this.revision++;
    this.emit('changed', this.snapshot());
    return this.snapshot();
  }
  updateExtension(this: SettingsStore<Settings>, id: string, patch: Partial<ExtensionSettings>) {
    const v = structuredClone(this.value);
    const current = v.extensions[id] || { enabled: defaultAppletEnabled, settings: {} };
    v.extensions[id] = { ...current, ...patch };
    return this.save(v, this.revision);
  }
  watch(onError: (error: Error) => void, assistance?: FileWatchAssistance) {
    this.observer?.close();
    this.observer = observeFile(
      this.file,
      (text) => this.accept(this.parse(text)),
      (error) => {
        this.readFailure(error, false);
        onError(error);
      },
      assistance,
    );
  }
  restoreBackup(revision: number) {
    if (!this.recovered || revision !== this.revision)
      throw Error(hostText('services.settings.confirmRestore'));
    return this.restoreRecovery(this.prepareRecovery());
  }
  /** Read only: unlike load(), this never creates a missing shared file. */
  reload() {
    try {
      this.accept(this.readDisk());
      return this.snapshot();
    } catch (error) {
      this.readFailure(error);
      throw error;
    }
  }
  private recoveryTarget() {
    // A valid incoming sync update always wins over recovery.
    let incoming: T | undefined;
    try {
      incoming = this.readDisk();
    } catch {
      /* Only an invalid or missing shared file can be explicitly restored. */
    }
    if (incoming) {
      this.accept(incoming);
      throw new SettingsConflictError(hostText('services.settings.recoveryCancelled'));
    }
    try {
      fs.lstatSync(this.file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
    return this.readBytes(this.file);
  }
  prepareRecovery(file = this.backupCandidate()?.file): SettingsRecoveryPlan {
    if (!file) throw Error(hostText('services.settings.noBackup'));
    const bytes = this.readBytes(file);
    this.parse(bytes);
    return {
      candidate: file,
      candidateHash: hashBytes(bytes),
      modifiedAt: fs.statSync(file).mtimeMs,
      previous: this.recoveryTarget(),
      revision: this.revision,
    };
  }
  restoreRecovery(plan: SettingsRecoveryPlan) {
    const previous = this.recoveryTarget();
    if (this.revision !== plan.revision || !sameBytes(previous, plan.previous))
      throw new SettingsConflictError(hostText('services.settings.changedDuringRestore'));
    const bytes = this.readBytes(plan.candidate);
    const serialized = this.serialize(this.parse(bytes));
    const next = this.parse(serialized);
    if (hashBytes(bytes) !== plan.candidateHash)
      throw new SettingsConflictError(hostText('services.settings.sourceChanged'));
    try {
      if (previous !== undefined) {
        if (!this.backupDirectory) throw Error(hostText('services.settings.noBackupDestination'));
        atomicWrite(
          path.join(this.backupDirectory, `invalid-${Date.now()}-${randomUUID()}.txt`),
          previous,
        );
      }
    } catch {
      this.health.set('backup', 'backup-failed');
      throw Error(hostText('services.settings.backupFailed'));
    }
    try {
      atomicWrite(this.file, serialized, { previous });
    } catch (error) {
      if (!(error instanceof SettingsConflictError)) this.health.set('save', 'save-failed');
      throw error;
    }
    this.value = next;
    this.observer?.invalidate(serialized);
    this.observer?.resetError();
    this.recovered = false;
    this.health.clear('read');
    this.health.clear('save');
    this.tryBackup(next);
    this.revision++;
    this.emit('changed', this.snapshot());
    return this.snapshot();
  }
  close() {
    clearTimeout(this.timer);
    this.watcher?.close();
    this.observer?.close();
  }
}
export { SettingsStore, defaults, validate, atomicWrite, isObject };

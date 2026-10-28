import { hostText } from '../../shared/i18n';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { atomicWrite } from './settings';
import { observeFile } from './file-observer';
import {
  parseWebProfiles,
  profileId,
  webProfileName,
  type WebProfile,
} from '../../shared/web-content';

export class WebProfileSettingsError extends Error {
  constructor(readonly code: 'INVALID_ARGUMENT' | 'REVISION_CONFLICT' | 'UNAVAILABLE') {
    super(
      hostText(
        code === 'REVISION_CONFLICT'
          ? 'services.webProfiles.changed'
          : code === 'INVALID_ARGUMENT'
            ? 'services.settingsTargets.invalid'
            : 'services.settingsTargets.unavailable',
      ),
    );
  }
}

/** Account operations own their file and never change the settings revision. */
export class WebProfileStore {
  private accounts: WebProfile[] = [];
  private byId = new Map<string, WebProfile>();
  private get value() {
    return this.accounts;
  }
  private set value(accounts: WebProfile[]) {
    this.accounts = accounts;
    this.byId = new Map(accounts.map((account) => [account.id, account]));
  }
  private pending: string[] = [];
  private observer?: ReturnType<typeof observeFile>;
  private referenced?: () => boolean;
  constructor(
    readonly file: string,
    private localDirectory?: string,
  ) {}
  private get pendingFile() {
    return this.localDirectory && path.join(this.localDirectory, 'pending-deletion.json');
  }
  private read(received?: string) {
    if (received === undefined && !fs.existsSync(this.file) && this.value.length === 0)
      return { accounts: [], pendingDeletion: [...this.pending] };
    const text = (received ?? fs.readFileSync(this.file, 'utf8')).replace(/^\uFEFF/, '');
    const raw = JSON.parse(text);
    if (raw?.schemaVersion !== 1) throw Error(hostText('services.webProfiles.unsupportedFormat'));
    const accounts = parseWebProfiles(raw.accounts);
    const accountIds = new Set(accounts.map((account) => account.id));
    const pending = this.pendingFile
      ? fs.existsSync(this.pendingFile)
        ? JSON.parse(fs.readFileSync(this.pendingFile, 'utf8'))
        : []
      : (raw.pendingDeletion ?? []);
    if (
      !Array.isArray(pending) ||
      pending.some((id) => !profileId(id) || (!this.pendingFile && accountIds.has(id))) ||
      new Set(pending).size !== pending.length
    )
      throw Error(hostText('services.webProfiles.invalidDeletion'));
    return { accounts, pendingDeletion: pending as string[] };
  }
  loadStandalone(referenced: () => boolean) {
    this.referenced = referenced;
    if (fs.existsSync(this.file)) {
      const saved = this.read();
      this.value = saved.accounts;
      this.pending = saved.pendingDeletion;
    }
  }
  watch(changed: () => void, failed: (error: Error) => void) {
    this.observer = observeFile(
      this.file,
      (text) => {
        const saved = this.read(text);
        if (JSON.stringify(saved.accounts) !== JSON.stringify(this.value)) {
          this.value = saved.accounts;
          changed();
        }
      },
      (error) => {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || this.value.length) failed(error);
      },
    );
  }
  close() {
    this.observer?.close();
  }
  snapshot() {
    return structuredClone(this.value);
  }
  /** Public roster access never initializes a session or processes pending deletions. */
  publicConfiguration() {
    const previous = this.unchanged(true);
    return {
      accounts: this.snapshot(),
      revision: createHash('sha256')
        .update(JSON.stringify([previous?.toString('base64') ?? null, this.pending]))
        .digest('hex'),
    };
  }
  planPublicConfiguration(rows: unknown, expectedRevision: string) {
    const current = this.publicConfiguration();
    if (current.revision !== expectedRevision)
      throw new WebProfileSettingsError('REVISION_CONFLICT');
    const accounts = parseWebProfiles(rows);
    // Only additions and names are public. Existing identities and their relative order survive.
    const currentById = new Map(current.accounts.map((account) => [account.id, account]));
    const existing = accounts.filter((a) => currentById.has(a.id));
    if (
      existing.length !== current.accounts.length ||
      existing.some((a, index) => a.id !== current.accounts[index].id)
    )
      throw new WebProfileSettingsError('INVALID_ARGUMENT');
    const changed = JSON.stringify(accounts) !== JSON.stringify(current.accounts);
    const previous = this.unchanged(accounts.length > current.accounts.length);
    const raw = previous
      ? JSON.parse(previous.toString('utf8').replace(/^\uFEFF/, ''))
      : { schemaVersion: 1, accounts: [] };
    const previousById = new Map<string, WebProfile>(
      raw.accounts.map((account: WebProfile) => [account.id, account]),
    );
    const saved = {
      ...raw,
      accounts: accounts.map((a) => {
        const before = previousById.get(a.id);
        const known = currentById.get(a.id);
        return before ? { ...before, ...(known?.name === a.name ? {} : { name: a.name }) } : a;
      }),
    };
    const text = JSON.stringify(saved, null, 2) + '\n';
    return {
      changed,
      commit: () => {
        if (this.publicConfiguration().revision !== expectedRevision)
          throw new WebProfileSettingsError('REVISION_CONFLICT');
        if (!changed) return;
        // Keep unknown roster data and all local cleanup/session state byte-for-byte.
        atomicWrite(this.file, text, { previous });
        this.value = accounts;
      },
    };
  }
  get(id: unknown) {
    const result = profileId(id) ? this.byId.get(id) : undefined;
    if (!result) throw Error(hostText('services.webProfiles.missing'));
    return { ...result };
  }
  private unchanged(allowEmptyInitialization = false) {
    let previous: Buffer | undefined;
    try {
      previous = fs.readFileSync(this.file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (!allowEmptyInitialization && previous === undefined && this.referenced?.())
      throw Error(hostText('services.webProfiles.syncPending'));
    const current =
      previous === undefined
        ? { accounts: [], pendingDeletion: [...this.pending] }
        : this.read(previous.toString('utf8'));
    if (
      JSON.stringify(current) !==
      JSON.stringify({ accounts: this.value, pendingDeletion: this.pending })
    )
      throw Error(hostText('services.webProfiles.changed'));
    return previous;
  }
  private save(next: WebProfile[], pending = this.pending, allowEmptyInitialization = false) {
    const previous = this.unchanged(allowEmptyInitialization);
    const validated = parseWebProfiles(next);
    const text =
      JSON.stringify(
        {
          schemaVersion: 1,
          accounts: validated,
          ...(!this.pendingFile ? { pendingDeletion: pending } : {}),
        },
        null,
        2,
      ) + '\n';
    if (this.pendingFile) atomicWrite(this.pendingFile, JSON.stringify(pending));
    try {
      atomicWrite(this.file, text, { previous });
    } catch (error) {
      if (this.pendingFile) atomicWrite(this.pendingFile, JSON.stringify(this.pending));
      throw error;
    }
    this.value = validated;
    this.pending = [...pending];
  }
  add(rawName: unknown) {
    const account = { id: `account.${randomUUID()}`, name: webProfileName(rawName) };
    // A deliberate add can recover an empty roster left behind by old settings.
    // Still re-read any delivered file before saving; never initialize at startup.
    const current = this.publicConfiguration();
    this.planPublicConfiguration([...current.accounts, account], current.revision).commit();
    return { ...account };
  }
  rename(id: unknown, rawName: unknown) {
    const a = this.get(id),
      name = webProfileName(rawName);
    const current = this.publicConfiguration();
    this.planPublicConfiguration(
      current.accounts.map((p) => (p.id === a.id ? { ...p, name } : p)),
      current.revision,
    ).commit();
  }
  remove(id: unknown) {
    const a = this.get(id);
    // Removal and the cleanup record commit together, including after a crash.
    this.save(
      this.value.filter((p) => p.id !== a.id),
      [...this.pending, a.id],
    );
  }
  pendingDeletion() {
    return this.pending.filter((id) => !this.byId.has(id));
  }
  cleanupSessions(referenced: Iterable<string>, live: Iterable<string> = []) {
    const blocked = new Set([...referenced, ...live, ...this.value.map((a) => a.id)]);
    const root = path.resolve(this.localDirectory || path.dirname(this.file), 'sessions');
    for (const id of [...this.pending]) {
      if (blocked.has(id)) continue;
      this.unchanged();
      // Only a validated ID directly below our own, non-redirected session root.
      const target = path.resolve(root, id);
      if (!profileId(id) || path.dirname(target) !== root)
        throw Error(hostText('services.webProfiles.invalidPath'));
      try {
        let rootStat: fs.Stats | undefined;
        try {
          rootStat = fs.lstatSync(root);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
        if (rootStat) {
          const actual = fs.realpathSync(root);
          if (rootStat.isSymbolicLink() || actual.toLowerCase() !== root.toLowerCase())
            throw Error(hostText('services.webProfiles.redirectedPath'));
          if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink())
            throw Error(hostText('services.webProfiles.redirectedTarget'));
          fs.rmSync(target, { recursive: true, force: true });
        }
      } catch {
        // Locked/inaccessible files remain tracked for the next startup.
        continue;
      }
      if (this.pendingFile) {
        const remaining = this.pending.filter((p) => p !== id);
        atomicWrite(this.pendingFile, JSON.stringify(remaining));
        this.pending = remaining;
      } else
        this.save(
          this.value,
          this.pending.filter((p) => p !== id),
        );
    }
    return this.pendingDeletion();
  }
}

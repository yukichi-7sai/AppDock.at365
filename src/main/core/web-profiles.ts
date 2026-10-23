import { hostText } from '../../shared/i18n';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { atomicWrite } from './settings';
import { observeFile } from './file-observer';
import {
  parseWebProfiles,
  profileId,
  webProfileName,
  type WebProfile,
} from '../../shared/web-content';

/** Account operations own their file and never change the settings revision. */
export class WebProfileStore {
  private value: WebProfile[] = [];
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
    if (Buffer.byteLength(text) > 65536) throw Error(hostText('services.webProfiles.sizeLimit'));
    const raw = JSON.parse(text);
    if (raw?.schemaVersion !== 1) throw Error(hostText('services.webProfiles.unsupportedFormat'));
    const accounts = parseWebProfiles(raw.accounts);
    const pending = this.pendingFile
      ? fs.existsSync(this.pendingFile)
        ? JSON.parse(fs.readFileSync(this.pendingFile, 'utf8'))
        : []
      : (raw.pendingDeletion ?? []);
    if (
      !Array.isArray(pending) ||
      pending.some(
        (id) => !profileId(id) || (!this.pendingFile && accounts.some((a) => a.id === id)),
      ) ||
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
  get(id: unknown) {
    const result = profileId(id) ? this.value.find((a) => a.id === id) : undefined;
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
    if (Buffer.byteLength(text) > 65536) throw Error(hostText('services.webProfiles.sizeLimit'));
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
    this.save([...this.value, account], this.pending, this.value.length === 0);
    return { ...account };
  }
  rename(id: unknown, rawName: unknown) {
    const a = this.get(id),
      name = webProfileName(rawName);
    this.save(this.value.map((p) => (p.id === a.id ? { ...p, name } : p)));
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
    return this.pending.filter((id) => !this.value.some((a) => a.id === id));
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

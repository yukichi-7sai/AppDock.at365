import { hostText } from '../../shared/i18n';
import fs from 'node:fs';
import path from 'node:path';
import { atomicWrite } from './settings';
import { observeFile } from './file-observer';
import type { WebAccountSound } from '../../shared/web-accounts';
import { webAccountId } from '../../shared/web-accounts';
import { WebAccountRoster, WebAccountRosterError } from './web-account-roster';

export type AccountState = {
  version: 1;
  selected: string;
  accounts: {
    id: string;
    name: string;
    temporaryName?: boolean;
    monitoring?: boolean;
    sound?: WebAccountSound;
  }[];
};
type Identity = Pick<AccountState['accounts'][number], 'id' | 'name' | 'temporaryName'>;
type Member = {
  selected: string;
  preferences: Pick<AccountState['accounts'][number], 'id' | 'monitoring' | 'sound'>[];
};
type LocalState = {
  version: 1;
  rosterKnown: boolean;
  members: Record<string, Member>;
  legacySessions: Record<string, string>;
};
type Journal = { before: string | null; after: string; state: LocalState };
type Listener = { changed(): void; removing(id: string): void; failed(): void };

export const accountId = webAccountId;
export const groupId = (id: unknown): id is string =>
  typeof id === 'string' &&
  /^[a-z][a-z0-9-]{0,39}(\.[a-z][a-z0-9-]{0,39}){1,4}$/.test(id) &&
  !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])\./i.test(id);
const ownerId = (id: unknown): id is string =>
  typeof id === 'string' &&
  /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(id) &&
  !['constructor', 'prototype', '__proto__'].includes(id) &&
  !id.endsWith('.') &&
  !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(id);
const object = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const identity = (a: unknown): a is Identity =>
  object(a) &&
  accountId(a.id) &&
  typeof a.name === 'string' &&
  !!a.name.trim() &&
  a.name.length <= 60 &&
  !/[\u0000-\u001f\u007f]/.test(a.name) &&
  (a.temporaryName === undefined || typeof a.temporaryName === 'boolean');
function readText(file: string): string | null {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile()) throw Error(hostText('services.webAccountGroups.invalidFile'));
    return fs.readFileSync(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
function roster(text: string): Identity[] {
  const raw = JSON.parse(text.replace(/^\uFEFF/, ''));
  if (
    !object(raw) ||
    raw.version !== 1 ||
    !Array.isArray(raw.accounts) ||
    raw.accounts.some((a: unknown) => !identity(a)) ||
    new Set(raw.accounts.map((a: Identity) => a.id)).size !== raw.accounts.length
  )
    throw Error(hostText('services.webAccountGroups.invalidRoster'));
  return raw.accounts.map((a: Identity) => ({
    id: a.id,
    name: a.name,
    ...(a.temporaryName === undefined ? {} : { temporaryName: a.temporaryName }),
  }));
}
const rosterText = (accounts: Identity[]) =>
  JSON.stringify({ version: 1, accounts }, null, 2) + '\n';
const identityOf = (a: Identity): Identity => ({
  id: a.id,
  name: a.name,
  ...(a.temporaryName === undefined ? {} : { temporaryName: a.temporaryName }),
});
const memberOf = (state: AccountState): Member => ({
  selected: state.selected,
  preferences: state.accounts.map(({ id, monitoring, sound }) => ({
    id,
    ...(monitoring === undefined ? {} : { monitoring }),
    ...(sound === undefined ? {} : { sound }),
  })),
});

/** One host-owned roster and local transaction journal per explicitly declared group. */
export class WebAccountGroup {
  readonly file: string;
  private localFile: string;
  private text: string | null;
  private accounts: Identity[];
  private local: LocalState;
  private observer?: ReturnType<typeof observeFile>;
  private listeners = new Set<Listener>();
  private busy = false;
  removingId?: string;
  private broken = false;
  constructor(
    readonly id: string,
    sharedRoot: string,
    readonly localRoot: string,
    private validateSound: (sound: unknown) => WebAccountSound,
    private assistance?: import('./file-watch-assistance').FileWatchAssistance,
  ) {
    if (!groupId(id)) throw Error(hostText('services.webAccountGroups.invalidGroup'));
    this.file = path.join(sharedRoot, 'web-account-groups', id, 'accounts.json');
    this.localFile = path.join(localRoot, 'web-account-groups', id, 'state.json');
    const localText = readText(this.localFile);
    const disk =
      localText === null
        ? { version: 1 as const, rosterKnown: false, members: {}, legacySessions: {} }
        : JSON.parse(localText);
    this.local = this.validateLocal(disk);
    if (disk.pending !== undefined) {
      const p = disk.pending;
      if (
        !object(p) ||
        (p.before !== null && typeof p.before !== 'string') ||
        typeof p.after !== 'string'
      )
        throw Error(hostText('services.webAccountGroups.invalidRecovery'));
      roster(p.after);
      if (p.before !== null) roster(p.before);
      const next = this.validateLocal(p.state);
      const current = readText(this.file);
      if (current !== p.before && current !== p.after)
        throw Error(hostText('services.webAccountGroups.rosterChanged'));
      if (current !== p.after)
        atomicWrite(this.file, p.after, {
          previous: current === null ? undefined : Buffer.from(current),
        });
      atomicWrite(this.localFile, JSON.stringify(next, null, 2));
      this.local = next;
    }
    this.text = readText(this.file);
    this.accounts = this.text === null ? [] : roster(this.text);
    if (this.text !== null) {
      const local = this.reconcile({ ...this.local, rosterKnown: true }, this.accounts);
      if (JSON.stringify(local) !== JSON.stringify(this.local))
        atomicWrite(this.localFile, JSON.stringify(local, null, 2));
      this.local = local;
    }
  }
  private validateLocal(raw: unknown): LocalState {
    if (
      !object(raw) ||
      raw.version !== 1 ||
      !object(raw.members) ||
      !object(raw.legacySessions) ||
      (raw.rosterKnown !== undefined && typeof raw.rosterKnown !== 'boolean')
    )
      throw Error(hostText('services.webAccountGroups.invalidDevice'));
    for (const [owner, m] of Object.entries(raw.members)) {
      if (
        !ownerId(owner) ||
        !object(m) ||
        typeof m.selected !== 'string' ||
        (m.selected !== '' && !accountId(m.selected)) ||
        !Array.isArray(m.preferences) ||
        new Set(m.preferences.map((p: any) => p?.id)).size !== m.preferences.length
      )
        throw Error(hostText('services.webAccountGroups.invalidApplet'));
      for (const p of m.preferences) {
        if (
          !object(p) ||
          !accountId(p.id) ||
          Object.keys(p).some((key) => !['id', 'monitoring', 'sound'].includes(key)) ||
          (p.monitoring !== undefined && typeof p.monitoring !== 'boolean')
        )
          throw Error(hostText('services.webAccountGroups.invalidAccount'));
        if (p.sound !== undefined) this.validateSound(p.sound);
      }
    }
    for (const [id, owner] of Object.entries(raw.legacySessions))
      if (!accountId(id) || !ownerId(owner))
        throw Error(hostText('services.webAccountGroups.invalidSession'));
    return {
      version: 1,
      rosterKnown: raw.rosterKnown === true,
      members: structuredClone(raw.members),
      legacySessions: { ...raw.legacySessions },
    };
  }
  private unchanged() {
    if (this.broken) throw Error(hostText('services.webAccountGroups.interrupted'));
    if (this.text === null && this.local.rosterKnown)
      throw Error(hostText('services.webAccountGroups.syncPending'));
    if (readText(this.file) !== this.text)
      throw Error(hostText('services.webAccountGroups.externallyChanged'));
  }
  private commit(accounts: Identity[], local: LocalState) {
    this.unchanged();
    local = this.reconcile({ ...local, rosterKnown: true }, accounts);
    const after = rosterText(accounts);
    roster(after);
    this.validateLocal(local);
    // Persist intent first. Recovery never overwrites a third-party roster.
    const pending: Journal = { before: this.text, after, state: local };
    try {
      atomicWrite(this.localFile, JSON.stringify({ ...this.local, pending }, null, 2));
      this.unchanged();
      atomicWrite(this.file, after, {
        previous: this.text === null ? undefined : Buffer.from(this.text),
      });
      atomicWrite(this.localFile, JSON.stringify(local, null, 2));
    } catch (error) {
      this.broken = true;
      throw error;
    }
    this.text = after;
    this.accounts = accounts.map(identityOf);
    this.local = local;
    this.notify();
  }
  private saveLocal(next: LocalState) {
    this.unchanged();
    next = this.reconcile(next, this.accounts);
    atomicWrite(this.localFile, JSON.stringify(this.validateLocal(next), null, 2));
    this.local = next;
    this.notify();
  }
  private reconcile(local: LocalState, accounts: Identity[]) {
    local = structuredClone(local);
    for (const member of Object.values(local.members))
      if (!accounts.some((a) => a.id === member.selected)) member.selected = accounts[0]?.id ?? '';
    return local;
  }
  private notify() {
    for (const l of this.listeners) {
      try {
        l.changed();
      } catch {
        l.failed();
      }
    }
  }
  connect(owner: string, legacy?: AccountState) {
    if (!ownerId(owner) || this.busy)
      throw Error(hostText('services.webAccountGroups.connectionFailed'));
    this.unchanged();
    const bindingFile = path.join(this.localRoot, 'web-accounts', owner, 'group-binding.json');
    const bindingText = readText(bindingFile);
    if (bindingText !== null) {
      const binding = JSON.parse(bindingText);
      if (binding?.version !== 1 || binding.groupId !== this.id)
        throw Error(hostText('services.webAccountGroups.migrationRequired'));
    }
    if (bindingText === null)
      atomicWrite(bindingFile, JSON.stringify({ version: 1, groupId: this.id }));
    if (this.hasMember(owner)) return;
    const local = structuredClone(this.local);
    let accounts = [...this.accounts];
    if (legacy) {
      for (const a of legacy.accounts) {
        if (!identity(a)) throw Error(hostText('services.webAccountGroups.invalidSource'));
        if (!accounts.some((p) => p.id === a.id)) accounts.push(identityOf(a));
        const bound = local.legacySessions[a.id];
        if (bound && bound !== owner)
          throw Error(hostText('services.webAccountGroups.sessionConflict'));
        local.legacySessions[a.id] = owner;
      }
      local.members[owner] = memberOf(legacy);
    } else local.members[owner] = { selected: '', preferences: [] };
    if (legacy) this.commit(accounts, local);
    else this.saveLocal(local);
  }
  hasMember(owner: string) {
    return Object.hasOwn(this.local.members, owner);
  }
  settingsRoster(owner: string, legacyFile: string) {
    return new WebAccountRoster(this.file, {
      bindingFile: path.join(path.dirname(legacyFile), 'group-binding.json'),
      group: { id: this.id, owner, stateFile: this.localFile, legacyFile },
      check: () => {
        if (this.busy || this.broken) throw new WebAccountRosterError('UNAVAILABLE');
        this.unchanged();
        const localText = readText(this.localFile);
        if (
          localText &&
          JSON.stringify(this.validateLocal(JSON.parse(localText))) !== JSON.stringify(this.local)
        )
          throw new WebAccountRosterError('REVISION_CONFLICT');
      },
      applied: (raw, text) => {
        this.text = text;
        this.accounts = raw.accounts.map((row) => identityOf(row as Identity));
        this.notify();
      },
    });
  }
  snapshot(owner: string): AccountState {
    const member = this.hasMember(owner) ? this.local.members[owner] : undefined;
    if (!member) throw Error(hostText('services.webAccountGroups.notConnected'));
    return {
      version: 1,
      selected: this.accounts.some((a) => a.id === member.selected)
        ? member.selected
        : (this.accounts[0]?.id ?? ''),
      accounts: this.accounts.map((a) => ({
        ...a,
        ...member.preferences.find((p) => p.id === a.id),
      })),
    };
  }
  update(owner: string, next: AccountState) {
    if (this.busy) throw Error(hostText('services.webAccountGroups.deletionPending'));
    this.unchanged();
    if (!this.hasMember(owner)) throw Error(hostText('services.webAccountGroups.notConnected'));
    const accounts = next.accounts.map(identityOf);
    roster(rosterText(accounts));
    const local = structuredClone(this.local);
    local.members[owner] = memberOf(next);
    if (JSON.stringify(accounts) === JSON.stringify(this.accounts)) this.saveLocal(local);
    else this.commit(accounts, local);
  }
  sessionPath(id: string) {
    if (!accountId(id)) throw Error(hostText('services.webAccountGroups.invalidId'));
    const owner = this.local.legacySessions[id];
    return owner
      ? path.join(this.localRoot, 'web-accounts', owner, 'sessions', id)
      : path.join(this.localRoot, 'web-account-groups', this.id, 'sessions', id);
  }
  async remove(id: string, clear: () => Promise<void>) {
    if (this.busy) throw Error(hostText('services.webAccountGroups.deletionPending'));
    this.unchanged();
    if (this.accounts.length < 2 || !this.accounts.some((a) => a.id === id))
      throw Error(hostText('services.webAccountGroups.cannotDelete'));
    this.busy = true;
    this.removingId = id;
    try {
      for (const l of this.listeners) l.removing(id);
      await clear();
      const local = structuredClone(this.local);
      for (const m of Object.values(local.members)) {
        m.preferences = m.preferences.filter((p) => p.id !== id);
        if (m.selected === id) m.selected = '';
      }
      this.commit(
        this.accounts.filter((a) => a.id !== id),
        local,
      );
    } finally {
      this.busy = false;
      this.removingId = undefined;
      this.notify();
    }
  }
  subscribe(listener: Listener) {
    this.listeners.add(listener);
    if (!this.observer) {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      this.observer = observeFile(
        this.file,
        (text) => {
          if (this.busy || this.broken) throw Error(hostText('services.webAccountGroups.busy'));
          if (text === this.text) return;
          const accounts = roster(text);
          const local = this.reconcile({ ...this.local, rosterKnown: true }, accounts);
          if (JSON.stringify(local) !== JSON.stringify(this.local)) {
            atomicWrite(this.localFile, JSON.stringify(local, null, 2));
            this.local = local;
          }
          this.text = text;
          this.accounts = accounts;
          this.notify();
        },
        (error) => {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || this.text !== null)
            for (const l of this.listeners) l.failed();
        },
        this.assistance,
      );
    }
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) {
        this.observer?.close();
        this.observer = undefined;
      }
    };
  }
  get active() {
    return this.listeners.size > 0;
  }
}

const groups = new Map<string, WebAccountGroup>();
export function findWebAccountGroup(id: string, sharedRoot: string, localRoot: string) {
  const group = groups.get(JSON.stringify([path.resolve(sharedRoot), path.resolve(localRoot), id]));
  return group?.active ? group : undefined;
}
export function getWebAccountGroup(
  id: string,
  sharedRoot: string,
  localRoot: string,
  validateSound: (sound: unknown) => WebAccountSound,
  assistance?: import('./file-watch-assistance').FileWatchAssistance,
) {
  const key = JSON.stringify([path.resolve(sharedRoot), path.resolve(localRoot), id]);
  let group = groups.get(key);
  if (!group?.active) {
    group = new WebAccountGroup(id, sharedRoot, localRoot, validateSound, assistance);
    groups.set(key, group);
  }
  return group;
}

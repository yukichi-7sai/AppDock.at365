import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { webAccountId, webAccountName } from '../../shared/web-accounts';
import { hostText } from '../../shared/i18n';
import { atomicWrite } from './settings';

type Row = { id: string; name: string; [key: string]: unknown };
export type WebAccountRosterValue = { version: 1; accounts: Row[]; [key: string]: unknown };
export class WebAccountRosterError extends Error {
  constructor(readonly code: 'INVALID_ARGUMENT' | 'REVISION_CONFLICT' | 'UNAVAILABLE') {
    super(hostText('services.settingsTargets.unavailable'));
  }
}
const object = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
function read(file: string): Buffer | undefined {
  try {
    return fs.readFileSync(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}
const parse = (bytes: Buffer) => JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));

/** Only roster identities are public; this owner never opens sessions or migrates accounts. */
export class WebAccountRoster {
  constructor(
    readonly file: string,
    private options: {
      bindingFile: string;
      group?: { id: string; owner: string; stateFile: string; legacyFile: string };
      check?(raw: WebAccountRosterValue): void;
      applied?(raw: WebAccountRosterValue, text: string): void;
    },
  ) {}
  private current() {
    try {
      const previous = read(this.file);
      const binding = read(this.options.bindingFile);
      const group = this.options.group;
      const guards: (Buffer | undefined)[] = [binding];
      if (group) {
        if (binding) {
          const declared = parse(binding);
          if (declared?.version !== 1 || declared.groupId !== group.id) throw Error();
        }
        const local = read(group.stateFile);
        const legacy = read(group.legacyFile);
        guards.push(local, legacy);
        const state = local ? parse(local) : undefined;
        if (
          (local &&
            (!object(state) ||
              state.version !== 1 ||
              !object(state.members) ||
              (state.rosterKnown !== undefined && typeof state.rosterKnown !== 'boolean') ||
              state.pending !== undefined ||
              (state.rosterKnown === true && !previous))) ||
          (legacy && (!state || !Object.hasOwn(state.members, group.owner)))
        )
          throw Error();
      } else if (binding) throw Error();
      const raw = previous
        ? parse(previous)
        : { version: 1, accounts: [], ...(!group ? { selected: '' } : {}) };
      if (
        !object(raw) ||
        raw.version !== 1 ||
        !Array.isArray(raw.accounts) ||
        raw.accounts.some(
          (row: unknown) =>
            !object(row) ||
            !webAccountId(row.id) ||
            typeof row.name !== 'string' ||
            !webAccountName(row.name) ||
            (row.temporaryName !== undefined && typeof row.temporaryName !== 'boolean') ||
            (row.monitoring !== undefined && typeof row.monitoring !== 'boolean'),
        ) ||
        new Set(raw.accounts.map((row: Row) => row.id)).size !== raw.accounts.length ||
        (!group &&
          previous &&
          (!raw.accounts.length || !raw.accounts.some((row: Row) => row.id === raw.selected)))
      )
        throw Error();
      this.options.check?.(raw as WebAccountRosterValue);
      return {
        raw: raw as WebAccountRosterValue,
        previous,
        revision: createHash('sha256')
          .update(
            JSON.stringify([
              this.file,
              [previous, ...guards].map((bytes) => bytes?.toString('base64')),
            ]),
          )
          .digest('hex'),
      };
    } catch (error) {
      if (error instanceof WebAccountRosterError) throw error;
      throw new WebAccountRosterError('UNAVAILABLE');
    }
  }
  publicConfiguration() {
    const current = this.current();
    return {
      accounts: current.raw.accounts.map(({ id, name }) => ({ id, name })),
      revision: current.revision,
    };
  }
  planPublicConfiguration(rows: unknown, expectedRevision: string) {
    const current = this.current();
    if (current.revision !== expectedRevision) throw new WebAccountRosterError('REVISION_CONFLICT');
    const before = new Map(current.raw.accounts.map((row) => [row.id, row]));
    let accounts: { id: string; name: string }[];
    try {
      if (
        !Array.isArray(rows) ||
        rows.some(
          (row) =>
            !object(row) ||
            !webAccountId(row.id) ||
            Object.keys(row).some((key) => !['id', 'name'].includes(key)),
        )
      )
        throw Error();
      accounts = rows.map((row) => {
        const previous = before.get(row.id);
        return {
          id: row.id,
          name: previous && row.name === previous.name ? previous.name : webAccountName(row.name),
        };
      });
      const known = new Set(current.raw.accounts.map((row) => row.id));
      const existing = accounts.filter((row) => known.has(row.id));
      if (
        new Set(accounts.map((row) => row.id)).size !== accounts.length ||
        existing.length !== known.size ||
        existing.some((row, index) => row.id !== current.raw.accounts[index].id)
      )
        throw Error();
    } catch {
      throw new WebAccountRosterError('INVALID_ARGUMENT');
    }
    const changed =
      JSON.stringify(accounts) !==
      JSON.stringify(current.raw.accounts.map(({ id, name }) => ({ id, name })));
    const saved: WebAccountRosterValue = {
      ...current.raw,
      accounts: accounts.map((row) => {
        const previous = before.get(row.id);
        return previous
          ? {
              ...previous,
              ...(previous.name === row.name ? {} : { name: row.name, temporaryName: false }),
            }
          : { ...row, temporaryName: false };
      }),
      ...(!this.options.group && !current.raw.accounts.length
        ? { selected: accounts[0]?.id ?? '' }
        : {}),
    };
    const text = JSON.stringify(saved, null, 2) + '\n';
    return {
      changed,
      commit: () => {
        if (this.current().revision !== expectedRevision)
          throw new WebAccountRosterError('REVISION_CONFLICT');
        if (!changed) return;
        atomicWrite(this.file, text, { previous: current.previous });
        this.options.applied?.(structuredClone(saved), text);
      },
    };
  }
}

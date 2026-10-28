import { hostText } from '../../shared/i18n';
import type { Settings, SettingsSnapshot, ExtensionSnapshot } from '../../shared/contracts';
import { validCommandId } from '../../shared/commands';
import {
  getTrayMenu,
  parseTrayMenu,
  trayMenuCommandIds,
  fixedTrayCommands,
  type TrayMenuItem,
} from '../../shared/tray-menu';
import type { SettingsStore } from './settings';
import { SettingsCommands, SettingsCommandError } from './settings-commands';
import type { AutomationCommand } from './automation-commands';
const commandId = 'appdock.tray.update';
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const exact = (v: unknown, keys: string[]): v is Record<string, unknown> =>
  object(v) && Object.keys(v).every((k) => keys.includes(k));
const invalid = () =>
  new SettingsCommandError(
    'INVALID_ARGUMENT',
    hostText('services.trayEditingCommands.invalidArguments'),
  );
const missing = () =>
  new SettingsCommandError('NOT_FOUND', hostText('services.trayEditingCommands.missing'));
const idSchema = {
  type: 'string',
  minLength: 1,
  maxLength: 180,
  pattern: '^[a-zA-Z0-9][a-zA-Z0-9._-]*$',
};
const parentSchema = {
  anyOf: [idSchema, { type: 'null' }],
  description: 'トップレベルはnull、グループ内はグループの項目ID',
};
const titleSchema = { type: 'string', minLength: 1, maxLength: 80 };
const shape = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});
const op = (kind: string, properties: Record<string, unknown>) =>
  shape({ kind: { const: kind }, ...properties });
const validTitle = (v: unknown): v is string =>
  typeof v === 'string' && !!v.trim() && v.trim().length <= 80 && !/[\x00-\x1f\x7f]/.test(v);
export class TrayEditingCommands {
  constructor(
    private options: {
      settings: SettingsStore;
      settingsCommands: SettingsCommands;
      save(value: Settings, revision: number): SettingsSnapshot;
      commands(): AutomationCommand[];
      trayApplets?(): ExtensionSnapshot[];
    },
  ) {}
  commands(): AutomationCommand[] {
    return [
      {
        id: commandId,
        title: hostText('services.trayEditingCommands.title'),
        appletId: null,
        available: true,
        unavailableReason: null,
        completion: 'settingsSaved',
        permission: 'tray.write',
        inputSchema: shape(
          {
            expectedRevision: { type: 'string', description: 'tray.getのrevision' },
            operations: {
              type: 'array',
              minItems: 1,
              maxItems: 100,
              items: {
                oneOf: [
                  op('configure', {
                    changes: {
                      type: 'object',
                      properties: {
                        singleClickCommand: idSchema,
                        doubleClickCommand: { anyOf: [idSchema, { type: 'null' }] },
                      },
                      minProperties: 1,
                      additionalProperties: false,
                    },
                  }),
                  op('add', {
                    parentId: parentSchema,
                    item: {
                      oneOf: [
                        shape({ id: idSchema, type: { const: 'command' }, command: idSchema }),
                        shape({ id: idSchema, type: { const: 'separator' } }),
                        shape({ id: idSchema, type: { const: 'group' }, title: titleSchema }),
                      ],
                    },
                  }),
                  op('update', {
                    id: idSchema,
                    changes: {
                      type: 'object',
                      properties: { command: idSchema, title: titleSchema },
                      minProperties: 1,
                      additionalProperties: false,
                    },
                  }),
                  op('remove', { id: idSchema }),
                  op('ungroup', { id: idSchema }),
                  op('move', {
                    id: idSchema,
                    parentId: parentSchema,
                    beforeId: { ...parentSchema, description: '移動先の直前の項目ID、末尾はnull' },
                  }),
                  op('reorder', {
                    parentId: parentSchema,
                    ids: {
                      type: 'array',
                      items: idSchema,
                      uniqueItems: true,
                      description: '指定階層の全項目IDを希望順で指定',
                    },
                  }),
                ],
              },
            },
            dryRun: { type: 'boolean' },
          },
          ['expectedRevision', 'operations'],
        ),
      },
    ];
  }
  private assignable() {
    return this.options
      .commands()
      .filter(
        (c) =>
          c.id !== commandId &&
          (!c.inputSchema || Object.keys((c.inputSchema.properties as object) ?? {}).length === 0),
      );
  }
  private checkCommand(id: unknown, menu = false): asserts id is string {
    if (!validCommandId(id)) throw invalid();
    if (menu && fixedTrayCommands.includes(id)) throw invalid();
    if (!this.assignable().some((c) => c.id === id))
      throw new SettingsCommandError(
        'COMMAND_NOT_ASSIGNABLE',
        hostText('services.trayEditingCommands.publicCommandOnly'),
      );
  }
  private value() {
    const s = this.options.settings.value;
    return {
      menu: parseTrayMenu(getTrayMenu(s, this.options.trayApplets?.() ?? [])),
      clicks: {
        singleClickCommand: s.host.trayClickCommand,
        doubleClickCommand: s.host.trayDoubleClickCommand,
      },
    };
  }
  get() {
    return {
      ...this.value(),
      fixedCommands: [...fixedTrayCommands],
      assignableCommands: this.assignable().map((c) => ({
        id: c.id,
        title: c.title,
        available: c.available,
        menuAllowed: !fixedTrayCommands.includes(c.id),
      })),
      revision: this.options.settingsCommands.revision(),
      warning: this.options.settings.syncError ?? null,
    };
  }
  execute(args: unknown) {
    if (
      !exact(args, ['operations', 'expectedRevision', 'dryRun']) ||
      typeof args.expectedRevision !== 'string' ||
      !Array.isArray(args.operations) ||
      !args.operations.length ||
      args.operations.length > 100 ||
      (args.dryRun !== undefined && typeof args.dryRun !== 'boolean')
    )
      throw invalid();
    this.options.settingsCommands.checkRevision(args.expectedRevision);
    const store = this.options.settings,
      before = this.value(),
      next = structuredClone(before);
    const find = (id: unknown) => {
      if (!validCommandId(id)) throw invalid();
      for (const item of next.menu) {
        if (item.id === id) return { item, list: next.menu };
        if (item.type === 'group') {
          const child = item.children.find((c) => c.id === id);
          if (child) return { item: child as TrayMenuItem, list: item.children as TrayMenuItem[] };
        }
      }
      throw missing();
    };
    const list = (parent: unknown): TrayMenuItem[] => {
      if (parent === null) return next.menu;
      const row = find(parent);
      if (row.item.type !== 'group') throw invalid();
      return row.item.children;
    };
    try {
      for (const operation of args.operations) {
        if (!object(operation)) throw invalid();
        const o = operation;
        if (o.kind === 'configure') {
          if (
            !exact(o, ['kind', 'changes']) ||
            !exact(o.changes, ['singleClickCommand', 'doubleClickCommand']) ||
            !Object.keys(o.changes).length
          )
            throw invalid();
          for (const key of ['singleClickCommand', 'doubleClickCommand'] as const) {
            if (!Object.hasOwn(o.changes, key)) continue;
            const value = o.changes[key];
            if (key === 'doubleClickCommand' && value === null) {
              next.clicks.doubleClickCommand = null;
              continue;
            }
            if (!validCommandId(value)) throw invalid();
            if (value !== next.clicks[key]) this.checkCommand(value);
            next.clicks[key] = value;
          }
        } else if (o.kind === 'add') {
          if (
            !exact(o, ['kind', 'parentId', 'item']) ||
            !object(o.item) ||
            !validCommandId(o.item.id)
          )
            throw invalid();
          const target = list(o.parentId),
            item = o.item;
          let row: TrayMenuItem;
          if (item.type === 'command') {
            if (!exact(item, ['id', 'type', 'command'])) throw invalid();
            this.checkCommand(item.command, true);
            row = { id: item.id as string, type: 'command', command: item.command };
          } else if (item.type === 'separator') {
            if (!exact(item, ['id', 'type'])) throw invalid();
            row = { id: item.id as string, type: 'separator' };
          } else if (item.type === 'group') {
            if (
              !exact(item, ['id', 'type', 'title']) ||
              !validTitle(item.title) ||
              o.parentId !== null
            )
              throw invalid();
            row = { id: item.id as string, type: 'group', title: item.title.trim(), children: [] };
          } else throw invalid();
          target.push(row);
        } else if (o.kind === 'update') {
          if (!exact(o, ['kind', 'id', 'changes']) || !object(o.changes)) throw invalid();
          const row = find(o.id).item,
            c = o.changes;
          if (row.type === 'group') {
            if (!exact(c, ['title']) || !validTitle(c.title)) throw invalid();
            row.title = c.title.trim();
          } else if (row.type === 'command') {
            if (!exact(c, ['command']) || !validCommandId(c.command)) throw invalid();
            if (c.command !== row.command) this.checkCommand(c.command, true);
            row.command = c.command;
          } else throw invalid();
        } else if (o.kind === 'remove' || o.kind === 'ungroup') {
          if (!exact(o, ['kind', 'id'])) throw invalid();
          const row = find(o.id);
          if (o.kind === 'ungroup') {
            if (row.item.type !== 'group') throw invalid();
            row.list.splice(row.list.indexOf(row.item), 1, ...row.item.children);
          } else {
            if (row.item.type === 'group') throw invalid();
            row.list.splice(row.list.indexOf(row.item), 1);
          }
        } else if (o.kind === 'move') {
          if (!exact(o, ['kind', 'id', 'parentId', 'beforeId'])) throw invalid();
          const row = find(o.id),
            target = list(o.parentId);
          if (row.item.type === 'group' && o.parentId !== null) throw invalid();
          if (
            o.beforeId !== null &&
            (!validCommandId(o.beforeId) || !target.some((i) => i.id === o.beforeId))
          )
            throw invalid();
          if (o.beforeId === o.id) continue;
          row.list.splice(row.list.indexOf(row.item), 1);
          target.splice(
            o.beforeId === null ? target.length : target.findIndex((i) => i.id === o.beforeId),
            0,
            row.item,
          );
        } else if (o.kind === 'reorder') {
          if (!exact(o, ['kind', 'parentId', 'ids']) || !Array.isArray(o.ids)) throw invalid();
          const target = list(o.parentId),
            ids = o.ids;
          if (
            ids.length !== target.length ||
            new Set(ids).size !== ids.length ||
            ids.some((id) => !validCommandId(id) || !target.some((i) => i.id === id))
          )
            throw invalid();
          const ordered = ids.map((id) => target.find((i) => i.id === id)!);
          target.splice(0, target.length, ...ordered);
        } else throw invalid();
        next.menu = parseTrayMenu(next.menu);
      }
    } catch (error) {
      if (error instanceof SettingsCommandError) throw error;
      throw invalid();
    }
    const changed = JSON.stringify(before) !== JSON.stringify(next);
    if (changed && args.dryRun !== true) {
      try {
        this.options.save(
          {
            ...structuredClone(store.value),
            trayMenu: next.menu,
            trayCommands: trayMenuCommandIds(next.menu),
            host: {
              ...store.value.host,
              trayClickCommand: next.clicks.singleClickCommand,
              trayDoubleClickCommand: next.clicks.doubleClickCommand,
            },
          },
          store.revision,
        );
      } catch {
        throw new SettingsCommandError(
          'SAVE_FAILED',
          hostText('services.trayEditingCommands.saveFailed'),
        );
      }
    }
    return {
      ...next,
      dryRun: args.dryRun === true,
      changed,
      revision: this.options.settingsCommands.revision(),
      warning: store.syncError ?? null,
      applies: 'trayChanged',
      message: hostText('services.trayEditingCommands.savedEffect'),
    };
  }
}

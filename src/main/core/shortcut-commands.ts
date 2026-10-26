import { hostText } from '../../shared/i18n';
import { inputExecutionModesSchema } from '../../shared/input-execution';
import type { Settings, SettingsSnapshot, GlobalHotKeyStatus } from '../../shared/contracts';
import { parseCommandTriggerOptions } from '../../shared/command-trigger-options';
import {
  touchpadShortcutProjection,
  validateTouchpadKeyEdit,
} from '../../shared/touchpad-gestures';
import { normalizeShortcut, validCommandId } from '../../shared/commands';
import {
  getKeybindings,
  getKeybindingOptions,
  parseKeybindingOptions,
  parseKeybindings,
  withKeybindings,
  appendKeybinding,
  changeKeybindingKey,
  applyKeybindingOrder,
  keybindingScopes,
  externalShortcutScope,
  protectedShortcut,
  type Keybinding,
} from '../../shared/keybindings';
import type { SettingsStore } from './settings';
import { SettingsCommands, SettingsCommandError } from './settings-commands';
import type { AutomationCommand } from './automation-commands';
import {
  shortcutPageChoices,
  shortcutTargetSchema,
  type ShortcutPageChoice,
} from '../../shared/shortcut-pages';

const commandId = 'appdock.shortcuts.update';
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const invalid = () =>
  new SettingsCommandError(
    'INVALID_ARGUMENT',
    hostText('services.shortcutCommands.invalidArguments'),
  );
const exact = (v: unknown, keys: string[]): v is Record<string, unknown> =>
  object(v) && Object.keys(v).every((k) => keys.includes(k));
const idSchema = {
  type: 'string',
  minLength: 1,
  maxLength: 180,
  pattern: '^[a-zA-Z0-9][a-zA-Z0-9._-]*$',
};
const whenSchema = {
  type: 'object',
  properties: {
    scope: { type: 'string', enum: keybindingScopes.map((s) => s.id) },
    appletIds: { type: 'array', items: shortcutTargetSchema, maxItems: 500, uniqueItems: true },
    processes: {
      type: 'array',
      items: { type: 'string', minLength: 1, maxLength: 120 },
      maxItems: 100,
    },
    excludeDesktop: { type: 'boolean' },
    excludedProcesses: {
      type: 'array',
      items: { type: 'string', minLength: 1, maxLength: 120 },
      maxItems: 100,
      description: 'global条件のみ。トリガー全体の除外に追加するexe名。',
    },
  },
  required: ['scope', 'appletIds'],
  additionalProperties: false,
};
const fields = {
  command: idSchema,
  key: { type: 'string', minLength: 1, maxLength: 80 },
  enabled: { type: 'boolean' },
  blockOriginalInput: {
    type: 'boolean',
    description: '条件に一致した外部入力を止める。省略時はtrue。',
  },
  when: whenSchema,
};
const operation = (kind: string, properties: Record<string, unknown>) => ({
  type: 'object',
  properties: { kind: { const: kind }, ...properties },
  required: ['kind', ...Object.keys(properties)],
  additionalProperties: false,
});

export class ShortcutCommands {
  constructor(
    private options: {
      settings: SettingsStore;
      settingsCommands: SettingsCommands;
      save(value: Settings, revision: number): SettingsSnapshot;
      commands(): AutomationCommand[];
      applets(): { id: string }[];
      inputPages?(): ShortcutPageChoice[];
      status?(): GlobalHotKeyStatus[];
    },
  ) {}
  commands(): AutomationCommand[] {
    return [
      {
        id: commandId,
        title: hostText('services.shortcutCommands.title'),
        appletId: null,
        available: true,
        unavailableReason: null,
        completion: 'settingsSaved',
        permission: 'shortcuts.write',
        inputSchema: {
          type: 'object',
          properties: {
            expectedRevision: { type: 'string', description: 'shortcuts.getで取得したrevision' },
            dryRun: { type: 'boolean', description: '保存せず結果を検証する' },
            operations: {
              type: 'array',
              minItems: 1,
              maxItems: 100,
              items: {
                oneOf: [
                  operation('add', {
                    binding: {
                      type: 'object',
                      properties: { id: idSchema, ...fields },
                      required: ['id', 'command', 'key', 'enabled', 'when'],
                      additionalProperties: false,
                    },
                  }),
                  operation('update', {
                    id: idSchema,
                    changes: {
                      type: 'object',
                      properties: fields,
                      minProperties: 1,
                      additionalProperties: false,
                    },
                  }),
                  operation('remove', { id: idSchema }),
                  operation('configure', {
                    changes: {
                      type: 'object',
                      properties: {
                        executionMode: { type: 'string', enum: ['first', 'all'] },
                        inputExecutionModes: inputExecutionModesSchema,
                        excludedProcesses: {
                          ...whenSchema.properties.excludedProcesses,
                          description: 'このトリガーの全割り当てで除外するexe名。',
                        },
                        browsers: {
                          type: 'array',
                          items: { type: 'string', minLength: 1, maxLength: 120 },
                          maxItems: 100,
                        },
                        requireChromiumWindowClass: { type: 'boolean' },
                      },
                      minProperties: 1,
                      additionalProperties: false,
                    },
                  }),
                  operation('reorder', {
                    key: fields.key,
                    ids: {
                      type: 'array',
                      items: idSchema,
                      minItems: 1,
                      maxItems: 2000,
                      uniqueItems: true,
                      description: '同じキーの全行IDを実行順に指定',
                    },
                  }),
                ],
              },
            },
          },
          required: ['expectedRevision', 'operations'],
          additionalProperties: false,
        },
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
  get() {
    return {
      bindings: structuredClone(getKeybindings(this.options.settings.value)),
      ownedBindings: touchpadShortcutProjection(this.options.settings.value).map((row) => ({
        ...row,
        owner: 'touchpadGestures',
        readOnly: true,
      })),
      options: this.publicOptions(getKeybindingOptions(this.options.settings.value)),
      revision: this.options.settingsCommands.revision(),
      warning: this.options.settings.syncError ?? null,
      scopes: keybindingScopes,
      pages: this.options.inputPages?.() ?? shortcutPageChoices([]),
      assignableCommands: this.assignable().map((c) => ({
        id: c.id,
        title: c.title,
        available: c.available,
        ownerId: c.permission === 'applets.manage' ? null : c.appletId,
      })),
      globalHotKeys: (this.options.status?.() ?? []).map((s) => ({
        commandId: s.commandId,
        shortcut: s.shortcut,
        registered: s.registered,
        backend: s.backend,
        effectiveBlockOriginalInput: s.effectiveBlockOriginalInput,
        warning: s.error ? hostText('services.shortcutCommands.applyFailed') : null,
      })),
    };
  }
  private validateAssignment(row: Keybinding) {
    if (externalShortcutScope(row.when.scope) && protectedShortcut(row.key)) throw invalid();
    const command = this.assignable().find((c) => c.id === row.command);
    if (!command)
      throw new SettingsCommandError(
        'COMMAND_NOT_ASSIGNABLE',
        hostText('services.shortcutCommands.publicCommandOnly'),
      );
    if (
      row.when.scope === 'owner' &&
      (command.appletId === null || command.permission === 'applets.manage')
    )
      throw invalid();
    const pages = this.options.inputPages?.() ?? shortcutPageChoices([]);
    if (
      row.when.appletIds.some(
        (id) =>
          !pages.some((page) => page.id === id) && !this.options.applets().some((a) => a.id === id),
      )
    )
      throw invalid();
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
    const store = this.options.settings;
    const before = structuredClone(getKeybindings(store.value));
    const beforeOptions = structuredClone(getKeybindingOptions(store.value));
    let rows = structuredClone(before);
    let options = structuredClone(beforeOptions);
    try {
      for (const op of args.operations) {
        if (!object(op)) throw invalid();
        if (op.kind === 'add') {
          if (!exact(op, ['kind', 'binding']) || !exact(op.binding, ['id', ...Object.keys(fields)]))
            throw invalid();
          const [row] = parseKeybindings([op.binding]);
          if (rows.some((r) => r.id === row.id)) throw invalid();
          this.validateAssignment(row);
          rows = appendKeybinding(rows, row);
        } else if (op.kind === 'update' || op.kind === 'remove') {
          if (
            !exact(op, op.kind === 'update' ? ['kind', 'id', 'changes'] : ['kind', 'id']) ||
            !validCommandId(op.id)
          )
            throw invalid();
          const old = rows.find((r) => r.id === op.id);
          if (!old)
            throw new SettingsCommandError(
              'NOT_FOUND',
              hostText('services.shortcutCommands.bindingMissing'),
            );
          if (op.kind === 'remove') {
            rows = rows.filter((r) => r.id !== op.id);
            continue;
          }
          if (!exact(op.changes, Object.keys(fields)) || !Object.keys(op.changes).length)
            throw invalid();
          const [row] = parseKeybindings([{ ...old, ...op.changes }]);
          // Disabling an old private/missing target remains possible without granting new access.
          if (!(Object.keys(op.changes).length === 1 && op.changes.enabled === false))
            this.validateAssignment(row);
          if (row.key !== old.key) rows = changeKeybindingKey(rows, old.id, row.key);
          rows = rows.map((r) => (r.id === row.id ? row : r));
        } else if (op.kind === 'configure') {
          if (
            !exact(op, ['kind', 'changes']) ||
            !exact(op.changes, [
              'executionMode',
              'inputExecutionModes',
              'excludedProcesses',
              'browsers',
              'requireChromiumWindowClass',
            ]) ||
            !Object.keys(op.changes).length ||
            Object.values(op.changes).some((v) => v === undefined)
          )
            throw invalid();
          options = {
            ...parseKeybindingOptions({ ...options, ...op.changes }),
            ...parseCommandTriggerOptions({ ...options, ...op.changes }),
          };
        } else if (op.kind === 'reorder') {
          if (
            !exact(op, ['kind', 'key', 'ids']) ||
            !Array.isArray(op.ids) ||
            !op.ids.length ||
            op.ids.length > 2000 ||
            op.ids.some((id) => !validCommandId(id))
          )
            throw invalid();
          const key = normalizeShortcut(op.key),
            group = rows.filter((r) => r.key === key);
          const ids = op.ids as string[];
          if (
            ids.length !== group.length ||
            new Set(ids).size !== ids.length ||
            ids.some((id) => !group.some((r) => r.id === id))
          )
            throw invalid();
          let index = 0;
          const ordered = rows.map((r) => {
            if (r.key !== key) return r;
            const id = ids[index++];
            return group.find((g) => g.id === id)!;
          });
          rows = applyKeybindingOrder(rows, rows, ordered);
        } else throw invalid();
        rows = parseKeybindings(rows);
      }
    } catch (error) {
      if (error instanceof SettingsCommandError) throw error;
      throw invalid();
    }
    validateTouchpadKeyEdit(
      withKeybindings(
        {
          ...store.value,
          keybindingOptions: parseKeybindingOptions(options),
          commandTriggerOptions: parseCommandTriggerOptions(options),
        },
        rows,
      ),
      store.value,
    );
    const changed =
      JSON.stringify(before) !== JSON.stringify(rows) ||
      JSON.stringify(beforeOptions) !== JSON.stringify(options);
    if (changed && args.dryRun !== true) {
      try {
        this.options.save(
          withKeybindings(
            {
              ...structuredClone(store.value),
              keybindingOptions: parseKeybindingOptions(options),
              commandTriggerOptions: parseCommandTriggerOptions(options),
            },
            rows,
          ),
          store.revision,
        );
      } catch {
        throw new SettingsCommandError(
          'SAVE_FAILED',
          hostText('services.shortcutCommands.saveFailed'),
        );
      }
    }
    return {
      dryRun: args.dryRun === true,
      changed,
      bindings: rows,
      options: this.publicOptions(options),
      revision: this.options.settingsCommands.revision(),
      warning: store.syncError ?? null,
      applies: 'shortcutsChanged',
      message: hostText('services.shortcutCommands.savedEffect'),
    };
  }
  private publicOptions(options: ReturnType<typeof getKeybindingOptions>) {
    return {
      executionMode: options.executionMode,
      inputExecutionModes: { ...options.inputExecutionModes },
      excludedProcesses: [...options.excludedProcesses],
      browsers: [...options.browsers],
      requireChromiumWindowClass: options.requireChromiumWindowClass,
    };
  }
}

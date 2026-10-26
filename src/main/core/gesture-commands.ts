import { hostText } from '../../shared/i18n';
import { inputExecutionModesSchema } from '../../shared/input-execution';
import { isDeepStrictEqual } from 'node:util';
import {
  defaultTouchpadGestures,
  parseTouchpadGestures,
  touchpadGestureTypes,
  touchpadId,
  validateTouchpadKeyEdit,
  type TouchpadGestureSettings,
} from '../../shared/touchpad-gestures';
import type { Settings, SettingsSnapshot } from '../../shared/contracts';
import {
  getCommandTriggerOptions,
  parseCommandTriggerOptions,
  publicCommandTriggerFields,
  type CommandTriggerOptions,
} from '../../shared/command-trigger-options';
import { validCommandId } from '../../shared/commands';
import { shortcutScopes } from '../../shared/keybindings';
import {
  shortcutPageChoices,
  shortcutTargetSchema,
  type ShortcutPageChoice,
} from '../../shared/shortcut-pages';
import {
  defaultGestures,
  parseGestures,
  normalizeGesture,
  gestureTypes,
  applyGestureBinding,
  applyGestureOrder,
  type GestureBinding,
  type GestureSettings,
} from '../../shared/gestures';
import type { SettingsStore } from './settings';
import { SettingsCommands, SettingsCommandError } from './settings-commands';
import type { AutomationCommand } from './automation-commands';

const commandId = 'appdock.gestures.update';
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const invalid = () =>
  new SettingsCommandError(
    'INVALID_ARGUMENT',
    hostText('services.gestureCommands.invalidArguments'),
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
    scope: {
      type: 'string',
      enum: [...shortcutScopes.map((s) => s.id), 'desktop', 'browser', 'exe'],
    },
    excludeDesktop: { type: 'boolean', description: 'global/exe条件でデスクトップだけを除外する' },
    excludedProcesses: {
      type: 'array',
      items: { type: 'string', minLength: 1, maxLength: 120 },
      maxItems: 100,
      description: 'global条件のみ。トリガー全体の除外に追加するexe名。',
    },
    appletIds: { type: 'array', items: shortcutTargetSchema, maxItems: 500, uniqueItems: true },
    processes: {
      type: 'array',
      items: { type: 'string', maxLength: 120 },
      maxItems: 100,
      description: 'exe条件のみ、パスを含まない実行ファイル名',
    },
  },
  required: ['scope', 'appletIds', 'processes'],
  additionalProperties: false,
};
const fields = {
  command: idSchema,
  gesture: {
    type: 'string',
    minLength: 1,
    maxLength: 84,
    description:
      '移動はmove-up/down/left/right、2段階はmove-right-upなど異なる2方向。ほかはclick-left/middle、wheel-up/down、key:Ctrl+A形式（右ボタンを押しながら入力）',
  },
  enabled: { type: 'boolean' },
  when: whenSchema,
};
const operation = (kind: string, properties: Record<string, unknown>) => ({
  type: 'object',
  properties: { kind: { const: kind }, ...properties },
  required: ['kind', ...Object.keys(properties)],
  additionalProperties: false,
});

const processesSchema = {
  type: 'array',
  items: { type: 'string', minLength: 1, maxLength: 120 },
  maxItems: 100,
};
const configurationFields = {
  enabled: { type: 'boolean' },
  activateOnStart: { type: 'boolean' },
  browsers: processesSchema,
  excludedProcesses: processesSchema,
  requireChromiumWindowClass: { type: 'boolean' },
  distance: { type: 'integer', minimum: 5, maximum: 500 },
  wheelDelayMs: { type: 'integer', minimum: 0, maximum: 5000 },
  executionMode: { type: 'string', enum: ['all', 'first'] },
  inputExecutionModes: inputExecutionModesSchema,
  indicatorOpacity: { type: 'number', minimum: 0.1, maximum: 1 },
  indicatorStyle: { type: 'string', enum: ['compact', 'pill', 'ring', 'classic'] },
  indicatorShowNoAction: { type: 'boolean' },
  indicatorPosition: {
    type: 'string',
    enum: ['gesture-start', 'window-center', 'monitor-center', 'none'],
  },
};
const gestureSettings = (settings: Settings): GestureSettings & CommandTriggerOptions => {
  const source = {
    ...parseGestures(settings.gestures ?? defaultGestures()),
    ...getCommandTriggerOptions(settings),
  };
  // Retain extra persisted fields on save, but expose only the documented settings.
  return structuredClone({
    ...Object.fromEntries(
      Object.keys(configurationFields).map((key) => [key, source[key as keyof typeof source]]),
    ),
    bindings: parseRows(source.bindings),
  }) as GestureSettings & CommandTriggerOptions;
};
const parseRows = (bindings: unknown) => parseGestures({ ...defaultGestures(), bindings }).bindings;

export class GestureCommands {
  constructor(
    private options: {
      touchpad?: boolean;
      settings: SettingsStore;
      settingsCommands: SettingsCommands;
      save(value: Settings, revision: number): SettingsSnapshot;
      commands(): AutomationCommand[];
      applets(): { id: string }[];
      inputPages?(): ShortcutPageChoice[];
    },
  ) {}
  private get commandId() {
    return this.options.touchpad ? 'appdock.touchpadGestures.update' : commandId;
  }
  private get fields() {
    return this.options.touchpad
      ? { ...fields, gesture: { type: 'string', enum: touchpadGestureTypes.map(([id]) => id) } }
      : fields;
  }
  private get configurationFields(): Record<string, unknown> {
    return this.options.touchpad
      ? {
          executionMode: configurationFields.executionMode,
          inputExecutionModes: inputExecutionModesSchema,
          excludedProcesses: processesSchema,
          browsers: processesSchema,
          requireChromiumWindowClass: { type: 'boolean' },
          connections: {
            type: 'object',
            additionalProperties: false,
            properties: Object.fromEntries(
              touchpadGestureTypes.map(([id]) => [
                id,
                {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    key: { type: 'string', pattern: '^F(1[3-9]|2[0-4])$' },
                    modifiers: {
                      type: 'array',
                      maxItems: 4,
                      uniqueItems: true,
                      items: { enum: ['Ctrl', 'Alt', 'Shift', 'Win'] },
                    },
                  },
                  required: ['key', 'modifiers'],
                },
              ]),
            ),
          },
        }
      : configurationFields;
  }
  private parse(value: unknown): GestureSettings | TouchpadGestureSettings {
    return this.options.touchpad ? parseTouchpadGestures(value) : parseGestures(value);
  }
  private parseRows(value: unknown) {
    return this.options.touchpad
      ? parseTouchpadGestures({ ...defaultTouchpadGestures(), bindings: value }).bindings
      : parseRows(value);
  }
  private gestureSettings(settings: Settings) {
    return this.options.touchpad
      ? {
          ...parseTouchpadGestures(settings.touchpadGestures),
          ...getCommandTriggerOptions(settings),
        }
      : gestureSettings(settings);
  }
  commands(): AutomationCommand[] {
    return [
      {
        id: this.commandId,
        title: this.options.touchpad
          ? hostText('services.gestureCommands.touchpadTitle')
          : hostText('services.gestureCommands.mouseTitle'),
        description: this.options.touchpad
          ? 'AppDockの割り当てと希望キーだけを保存します。Windowsへ反映するにはset-enabledまたはreconnectを明示的に実行します。'
          : undefined,
        appletId: null,
        available: true,
        unavailableReason: null,
        completion: 'settingsSaved',
        permission: this.options.touchpad ? 'touchpadGestures.write' : 'gestures.write',
        inputSchema: {
          type: 'object',
          properties: {
            expectedRevision: { type: 'string', description: 'gestures.getで取得したrevision' },
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
                      properties: { id: idSchema, ...this.fields },
                      required: ['id', ...Object.keys(this.fields)],
                      additionalProperties: false,
                    },
                  }),
                  operation('update', {
                    id: idSchema,
                    changes: {
                      type: 'object',
                      properties: this.fields,
                      minProperties: 1,
                      additionalProperties: false,
                    },
                  }),
                  operation('remove', { id: idSchema }),
                  operation('configure', {
                    changes: {
                      type: 'object',
                      properties: publicCommandTriggerFields(this.configurationFields),
                      minProperties: 1,
                      additionalProperties: false,
                    },
                  }),
                  operation('reorder', {
                    gesture: this.fields.gesture,
                    ids: {
                      type: 'array',
                      items: idSchema,
                      minItems: 1,
                      maxItems: 2000,
                      uniqueItems: true,
                      description: '同じジェスチャーの全行IDを実行順に指定',
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
          c.id !== this.commandId &&
          (!c.inputSchema || Object.keys((c.inputSchema.properties as object) ?? {}).length === 0),
      );
  }
  get() {
    return {
      bindings: structuredClone(this.gestureSettings(this.options.settings.value).bindings),
      pages: this.options.inputPages?.() ?? shortcutPageChoices([]),
      revision: this.options.settingsCommands.revision(),
      warning: this.options.settings.syncError ?? null,
      scopes: [
        ...shortcutScopes.flatMap((scope) =>
          scope.id === 'global'
            ? [scope, { id: 'desktop', title: hostText('services.gestureCommands.desktop') }]
            : [scope],
        ),
        { id: 'browser', title: hostText('services.gestureCommands.browser') },
        { id: 'exe', title: hostText('services.gestureCommands.executable') },
      ],
      assignableCommands: this.assignable().map((c) => ({
        id: c.id,
        title: c.title,
        available: c.available,
        ownerId: c.permission === 'applets.manage' ? null : c.appletId,
      })),
      settings: publicCommandTriggerFields(this.gestureSettings(this.options.settings.value)),
      gestureTypes: (this.options.touchpad ? touchpadGestureTypes : gestureTypes).map(
        ([id, title]) => ({ id, title }),
      ),
    };
  }
  private validateAssignment(row: GestureBinding) {
    const command = this.assignable().find((c) => c.id === row.command);
    if (!command)
      throw new SettingsCommandError(
        'COMMAND_NOT_ASSIGNABLE',
        hostText('services.gestureCommands.publicCommandOnly'),
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
    const before = this.gestureSettings(store.value);
    let commonOptions = getCommandTriggerOptions(store.value);
    let next = structuredClone(before);
    let rows = next.bindings;
    try {
      for (const op of args.operations) {
        if (!object(op)) throw invalid();
        if (op.kind === 'add') {
          if (
            !exact(op, ['kind', 'binding']) ||
            !exact(op.binding, ['id', ...Object.keys(this.fields)])
          )
            throw invalid();
          const [row] = this.parseRows([op.binding]);
          if (rows.some((r) => r.id === row.id)) throw invalid();
          this.validateAssignment(row);
          rows = applyGestureBinding(rows, row);
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
              hostText('services.gestureCommands.bindingMissing'),
            );
          if (op.kind === 'remove') {
            rows = rows.filter((r) => r.id !== op.id);
            continue;
          }
          if (!exact(op.changes, Object.keys(this.fields)) || !Object.keys(op.changes).length)
            throw invalid();
          const [row] = this.parseRows([{ ...old, ...op.changes }]);
          // Disabling an old private/missing target remains possible without granting new access.
          if (!(Object.keys(op.changes).length === 1 && op.changes.enabled === false))
            this.validateAssignment(row);
          rows = applyGestureBinding(rows, row, old);
        } else if (op.kind === 'configure') {
          if (
            !exact(op, ['kind', 'changes']) ||
            !exact(op.changes, Object.keys(publicCommandTriggerFields(this.configurationFields))) ||
            !Object.keys(op.changes).length ||
            Object.values(op.changes).some((value) => value === undefined)
          )
            throw invalid();
          commonOptions = parseCommandTriggerOptions({ ...commonOptions, ...op.changes });
          next = { ...this.parse({ ...next, ...op.changes, bindings: rows }), ...commonOptions };
        } else if (op.kind === 'reorder') {
          if (
            !exact(op, ['kind', 'gesture', 'ids']) ||
            !Array.isArray(op.ids) ||
            !op.ids.length ||
            op.ids.length > 2000 ||
            op.ids.some((id) => !validCommandId(id))
          )
            throw invalid();
          const key = this.options.touchpad ? touchpadId(op.gesture) : normalizeGesture(op.gesture),
            group = rows.filter((r) => r.gesture === key);
          const ids = op.ids as string[];
          if (
            ids.length !== group.length ||
            new Set(ids).size !== ids.length ||
            ids.some((id) => !group.some((r) => r.id === id))
          )
            throw invalid();
          let index = 0;
          const ordered = rows.map((r) => {
            if (r.gesture !== key) return r;
            const id = ids[index++];
            return group.find((g) => g.id === id)!;
          });
          rows = applyGestureOrder(rows, rows, ordered);
        } else throw invalid();
        rows = this.parseRows(rows);
      }
    } catch (error) {
      if (error instanceof SettingsCommandError) throw error;
      throw invalid();
    }
    next = { ...this.parse({ ...next, bindings: rows }), ...commonOptions };
    if (this.options.touchpad)
      validateTouchpadKeyEdit(
        { ...store.value, touchpadGestures: next as TouchpadGestureSettings },
        store.value,
      );
    const changed = !isDeepStrictEqual(before, next);
    if (changed && args.dryRun !== true) {
      try {
        this.options.save(
          {
            ...structuredClone(store.value),
            commandTriggerOptions: commonOptions,
            [this.options.touchpad ? 'touchpadGestures' : 'gestures']: this.options.touchpad
              ? parseTouchpadGestures(next)
              : parseGestures({ ...structuredClone(store.value.gestures), ...next }),
          },
          store.revision,
        );
      } catch {
        throw new SettingsCommandError(
          'SAVE_FAILED',
          hostText('services.gestureCommands.saveFailed'),
        );
      }
    }
    return {
      dryRun: args.dryRun === true,
      changed,
      bindings: rows,
      settings: publicCommandTriggerFields(next),
      revision: this.options.settingsCommands.revision(),
      warning: store.syncError ?? null,
      applies: 'gesturesChanged',
      message: hostText('services.gestureCommands.savedEffect'),
    };
  }
}

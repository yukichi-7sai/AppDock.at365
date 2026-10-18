import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv-provider.js';
import type { InputInvocation } from './command-contexts';
import type { CustomCommandService } from './custom-commands';
import { customUpdateCommand } from '../../shared/custom-commands';
import type { AppletApiPermissions } from '../../shared/appdock-api';
import {
  appDockMethods,
  appDockOperations,
  operationsFor,
  type AppDockMethod,
} from '../../shared/appdock-api';
import type { Settings, SettingsSnapshot } from '../../shared/contracts';
import type { SettingsStore } from './settings';
import type { AutomationApplet, AutomationCommand } from './automation-commands';
import { SettingsCommands, SettingsCommandError } from './settings-commands';
import { AppletManagement, AppletManagementError } from './applet-management';
import { TrayEditingCommands } from './tray-editing-commands';
import { RibbonCommands } from './ribbon-commands';
import { GestureCommands } from './gesture-commands';
import { ShortcutCommands } from './shortcut-commands';
import type { GlobalHotKeyStatus, ExtensionSnapshot } from '../../shared/contracts';

export class AutomationError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
export const automationMethods = appDockMethods;
const schemaValidator = new AjvJsonSchemaValidator();
const inputValidators = new Map(
  Object.entries(appDockOperations).map(([method, operation]) => [
    method,
    schemaValidator.getValidator(operation.inputSchema),
  ]),
);
export class AppDockApi {
  private executing = 0;
  private settingsCommands: SettingsCommands;
  private shortcuts: ShortcutCommands;
  private gestures: GestureCommands;
  private tray: TrayEditingCommands;
  private ribbon: RibbonCommands;
  constructor(
    private options: {
      handlers?: Partial<
        Record<
          AppDockMethod,
          (
            params: Record<string, unknown>,
            appletId: string | undefined,
            context: InputInvocation,
          ) => Promise<Record<string, unknown>>
        >
      >;
      settings: SettingsStore;
      appletPermissions?(id: string): AppletApiPermissions;
      save(value: Settings, revision: number): SettingsSnapshot;
      settingsCommands?: SettingsCommands;
      customCommands?: CustomCommandService;
      customCommandsManageable?(): boolean;
      mcpClientAllowed?(): boolean;
      appletManagement?: AppletManagement;
      manageable?(): boolean;
      shortcutsEditable?(): boolean;
      gesturesEditable?(): boolean;
      ribbonEditable?(): boolean;
      trayEditable?(): boolean;
      trayApplets?(): ExtensionSnapshot[];
      ribbonApplets?(): ExtensionSnapshot[];
      shortcutStatus?(): GlobalHotKeyStatus[];
      applets(): AutomationApplet[];
      commands(): AutomationCommand[];
      execute(id: string, context?: InputInvocation): Promise<unknown>;
      ttsAllowed?(): boolean;
      aiAllowed?(): boolean;
      executable(): boolean;
      version: string;
      instanceId: string;
      writable(): boolean;
      ready(): boolean;
    },
  ) {
    this.settingsCommands =
      options.settingsCommands ?? new SettingsCommands({ ...options, applets: () => [] });
    this.tray = new TrayEditingCommands({
      ...options,
      settingsCommands: this.settingsCommands,
      commands: () => this.commands(),
    });
    this.ribbon = new RibbonCommands({ ...options, settingsCommands: this.settingsCommands });
    this.gestures = new GestureCommands({
      ...options,
      settingsCommands: this.settingsCommands,
      commands: () => this.commands(),
    });
    this.shortcuts = new ShortcutCommands({
      ...options,
      settingsCommands: this.settingsCommands,
      commands: () => this.commands(),
      status: options.shortcutStatus,
    });
  }
  private permissions(appletId?: string) {
    if (appletId !== undefined) return this.options.appletPermissions?.(appletId) ?? {};
    return {
      useTts: this.options.ttsAllowed?.() ?? false,
      useAi: this.options.aiAllowed?.() ?? false,
      useMcp: this.options.mcpClientAllowed?.() ?? false,
      read: true,
      execute: this.options.executable(),
      write: this.options.writable(),
      manageApplets: this.options.manageable?.() ?? false,
      editShortcuts: this.options.shortcutsEditable?.() ?? false,
      editGestures: this.options.gesturesEditable?.() ?? false,
      editRibbon: this.options.ribbonEditable?.() ?? false,
      editTray: this.options.trayEditable?.() ?? false,
      manageCustomCommands: this.options.customCommandsManageable?.() ?? false,
    };
  }
  private effectivePermissions(appletId: string | undefined, context: InputInvocation) {
    const own = this.permissions(appletId);
    const origin = context.origin;
    if (!origin || origin.kind === 'local') return own;
    const root = this.permissions(origin.kind === 'applet' ? origin.appletId : undefined);
    return Object.fromEntries(
      Object.entries(own).map(([key, value]) => [
        key,
        value === true &&
          (key === 'sendInput' && origin.kind === 'mcp'
            ? root.execute === true
            : root[key as keyof AppletApiPermissions] === true),
      ]),
    ) as AppletApiPermissions;
  }
  private commands() {
    return [
      ...new Map(
        [
          ...this.options.commands(),
          ...(this.options.customCommands
            ? [
                ...this.options.customCommands.publicCommands(),
                this.options.customCommands.managementCommand(),
              ]
            : []),
          ...this.settingsCommands.commands(),
          ...(this.options.appletManagement?.commands() ?? []),
          ...this.shortcuts.commands(),
          ...this.gestures.commands(),
          ...this.ribbon.commands(),
          ...this.tray.commands(),
        ].map((c) => [
          c.id,
          {
            ...c,
            inputSchema: c.inputSchema ?? {
              type: 'object',
              properties: {},
              additionalProperties: false,
            },
          },
        ]),
      ).values(),
    ];
  }
  auditTarget(method: string, params: unknown): string | undefined {
    if (!object(params)) return undefined;
    if (method === 'commands.execute') return this.commands().find((c) => c.id === params.id)?.id;
    if (method === 'applets.get') return this.options.applets().find((a) => a.id === params.id)?.id;
    if (method === 'settings.get' || method === 'settings.getSchema')
      return this.options.applets().find((a) => a.id === params.appletId)?.id;
    return undefined;
  }
  call(
    method: string,
    params: unknown = {},
    appletId?: string,
    context: InputInvocation = {},
  ): Record<string, unknown> | Promise<Record<string, unknown>> {
    const permissions = this.effectivePermissions(appletId, context);
    const definition = Object.hasOwn(appDockOperations, method)
      ? appDockOperations[method as AppDockMethod]
      : undefined;
    const caller = appletId === undefined ? 'mcp' : 'applet';
    if (!definition || !(definition.callers as readonly string[]).includes(caller))
      throw new AutomationError('NOT_FOUND', '対応していない操作です。');
    for (const permission of definition.permissions)
      if (!permissions[permission])
        throw new AutomationError('API_DISABLED', 'この操作を設定画面で許可してください。');
    if (!this.options.ready())
      throw new AutomationError('NOT_READY', 'AppDockは起動中または終了中です。');
    if (!object(params)) throw new AutomationError('INVALID_ARGUMENT', '引数はオブジェクトです。');
    if (method.startsWith('customCommands.')) {
      if (!inputValidators.get(method)!(params).valid)
        throw new AutomationError('INVALID_ARGUMENT', '引数が操作の形式に一致しません。');
      if (!this.options.customCommands)
        throw new AutomationError('NOT_READY', 'カスタムコマンドを利用できません。');
      try {
        return this.options.customCommands.read(method, params, appletId);
      } catch (error) {
        if (error instanceof SettingsCommandError)
          throw new AutomationError(error.code, error.message);
        throw error;
      }
    }
    const handler = this.options.handlers?.[method as AppDockMethod];
    if (handler) {
      if (!inputValidators.get(method)!(params).valid)
        throw new AutomationError('INVALID_ARGUMENT', '引数が操作の形式に一致しません。');
      return handler(params, appletId, context);
    }
    if (
      !['settings.get', 'settings.getSchema', 'applets.get', 'commands.execute'].includes(method) &&
      Object.keys(params).length
    )
      throw new AutomationError('INVALID_ARGUMENT', 'この操作には引数がありません。');
    switch (method) {
      case 'system.getInfo':
        return {
          apiVersion: 2,
          trayEditingAllowed: permissions.editTray === true,
          ribbonEditingAllowed: permissions.editRibbon === true,
          appletManagementAllowed: permissions.manageApplets === true,
          gestureEditingAllowed: permissions.editGestures === true,
          shortcutEditingAllowed: permissions.editShortcuts === true,
          version: this.options.version,
          instanceId: this.options.instanceId,
          methods: operationsFor(caller).map(([method]) => method),
          writable: permissions.write === true,
          executable: permissions.execute === true,
        };
      case 'applets.list':
        return {
          applets: this.options.applets().map(({ id, name, version, state, enabled }) => ({
            id,
            name,
            version,
            state,
            enabled,
          })),
        };
      case 'applets.get': {
        const id = this.id(params);
        const applet = this.options.applets().find((a) => a.id === id);
        if (!applet) throw new AutomationError('NOT_FOUND', 'Appletが見つかりません。');
        return {
          applet,
          commands: this.commands().filter((c) => c.appletId === id),
          executable: permissions.execute === true,
        };
      }
      case 'commands.list':
        return {
          trayEditingAllowed: permissions.editTray === true,
          ribbonEditingAllowed: permissions.editRibbon === true,
          gestureEditingAllowed: permissions.editGestures === true,
          shortcutEditingAllowed: permissions.editShortcuts === true,
          appletManagementAllowed: permissions.manageApplets === true,
          commands: this.commands(),
          executable: permissions.execute === true,
          writable: permissions.write === true,
        };
      case 'commands.execute':
        return this.execute(
          this.id(params, true),
          params.args === undefined ? {} : params.args,
          appletId,
          context,
        );
      case 'tray.get':
        return {
          ...this.tray.get(),
          writable: permissions.write === true,
          executable: permissions.execute === true,
          trayEditingAllowed: permissions.editTray === true,
        };
      case 'ribbon.get':
        return {
          ...this.ribbon.get(),
          writable: permissions.write === true,
          executable: permissions.execute === true,
          ribbonEditingAllowed: permissions.editRibbon === true,
        };
      case 'gestures.get':
        return {
          ...this.gestures.get(),
          writable: permissions.write === true,
          executable: permissions.execute === true,
          gestureEditingAllowed: permissions.editGestures === true,
        };
      case 'shortcuts.get':
        return {
          ...this.shortcuts.get(),
          writable: permissions.write === true,
          executable: permissions.execute === true,
          gestureEditingAllowed: permissions.editGestures === true,
          shortcutEditingAllowed: permissions.editShortcuts === true,
        };
      case 'settings.getSchema':
      case 'settings.get': {
        if (
          Object.keys(params).some((k) => k !== 'appletId') ||
          (params.appletId !== undefined &&
            (typeof params.appletId !== 'string' ||
              !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/.test(params.appletId) ||
              params.appletId === 'appdock'))
        )
          throw new AutomationError(
            'INVALID_ARGUMENT',
            'Appletの設定はappletIdだけを指定してください。',
          );
        try {
          return method === 'settings.get'
            ? this.settingsCommands.get(params.appletId as string | undefined)
            : {
                ...this.settingsCommands.schema(params.appletId as string | undefined),
                writable: permissions.write === true,
              };
        } catch (error) {
          if (error instanceof SettingsCommandError)
            throw new AutomationError(error.code, error.message);
          throw error;
        }
      }
      default:
        throw new AutomationError('NOT_FOUND', '対応していない操作です。');
    }
  }
  private id(params: Record<string, unknown>, argumentsAllowed = false): string {
    if (
      Object.keys(params).some((k) => k !== 'id' && !(argumentsAllowed && k === 'args')) ||
      typeof params.id !== 'string' ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/.test(params.id)
    )
      throw new AutomationError(
        'INVALID_ARGUMENT',
        '正しいidと対応する引数だけを指定してください。',
      );
    return params.id;
  }
  private async execute(
    id: string,
    args: unknown,
    appletId?: string,
    context: InputInvocation = {},
  ): Promise<Record<string, unknown>> {
    const permissions = this.effectivePermissions(appletId, context);
    if (!permissions.execute)
      throw new AutomationError(
        'EXECUTION_DISABLED',
        '呼び出し元の許可設定でコマンド実行を許可してください。',
      );
    const command = this.commands().find((c) => c.id === id);
    if (!command)
      throw new AutomationError('NOT_FOUND', '外部に公開されているコマンドではありません。');
    if (!command.available)
      throw new AutomationError('UNAVAILABLE', 'このコマンドは現在利用できません。');
    if (
      !object(args) ||
      (![
        'settings.write',
        'customCommands.write',
        'shortcuts.write',
        'gestures.write',
        'ribbon.write',
        'tray.write',
      ].includes(command.permission ?? '') &&
        Object.keys(args).length)
    )
      throw new AutomationError(
        'INVALID_ARGUMENT',
        'コマンドのinputSchemaに合うargsを指定してください。',
      );
    if (
      [
        'settings.write',
        'customCommands.write',
        'shortcuts.write',
        'gestures.write',
        'ribbon.write',
        'tray.write',
      ].includes(command.permission ?? '') &&
      !permissions.write
    )
      throw new AutomationError(
        'WRITE_DISABLED',
        '呼び出し元の許可設定で設定変更を許可してください。',
      );
    if (
      appletId &&
      command.appletId === appletId &&
      (command.permission === 'applets.manage' || !command.permission)
    )
      throw new AutomationError('SELF_CALL', '自身の実行・停止・再起動はこの入口から行えません。');
    // Synchronous settings edits can complete while an Applet handler awaits this API.
    // Further asynchronous dispatch is refused, preventing A -> B -> A wait cycles.
    if (this.executing && !(appletId && command.permission?.endsWith('.write')))
      throw new AutomationError('BUSY', '別のAPIコマンドを実行中です。');
    if (command.permission === 'tray.write' && !permissions.editTray)
      throw new AutomationError(
        'TRAY_EDITING_DISABLED',
        '呼び出し元の許可設定でタスクトレイ編集を許可してください。',
      );
    if (command.permission === 'ribbon.write' && !permissions.editRibbon)
      throw new AutomationError(
        'RIBBON_EDITING_DISABLED',
        '呼び出し元の許可設定でリボン編集を許可してください。',
      );
    if (command.permission === 'gestures.write' && !permissions.editGestures)
      throw new AutomationError(
        'GESTURE_EDITING_DISABLED',
        '呼び出し元の許可設定でジェスチャー編集を許可してください。',
      );
    if (command.permission === 'shortcuts.write' && !permissions.editShortcuts)
      throw new AutomationError(
        'SHORTCUT_EDITING_DISABLED',
        '呼び出し元の許可設定でショートカット編集を許可してください。',
      );
    if (command.permission === 'applets.manage' && !permissions.manageApplets)
      throw new AutomationError(
        'APPLET_MANAGEMENT_DISABLED',
        '呼び出し元の許可設定でApplet管理を許可してください。',
      );
    this.executing++;
    try {
      if (command.permission === 'customCommands.write') {
        if (!permissions.manageCustomCommands || !this.options.customCommands)
          throw new AutomationError('API_DISABLED', 'カスタムコマンドの管理を許可してください。');
        const result = this.options.customCommands.update(args, appletId);
        return {
          id: customUpdateCommand,
          completion: result.dryRun ? 'validated' : 'settingsSaved',
          effectVerified: false,
          ...result,
        };
      }
      if (this.options.customCommands?.has(id))
        return await this.options.customCommands.execute(id, {
          ...context,
          apiCaller: appletId ? { kind: 'applet', appletId } : { kind: 'mcp' },
          origin: context.origin ?? (appletId ? { kind: 'applet', appletId } : { kind: 'mcp' }),
        });
      if (command.permission === 'tray.write') {
        const result = this.tray.execute(args);
        return {
          id,
          completion: result.dryRun ? 'validated' : 'settingsSaved',
          effectVerified: false,
          ...result,
        };
      }
      if (command.permission === 'ribbon.write') {
        const result = this.ribbon.execute(args);
        return {
          id,
          completion: result.dryRun ? 'validated' : 'settingsSaved',
          effectVerified: false,
          ...result,
        };
      }
      if (command.permission === 'shortcuts.write' || command.permission === 'gestures.write') {
        const result = (
          command.permission === 'shortcuts.write' ? this.shortcuts : this.gestures
        ).execute(args);
        return {
          id,
          completion: result.dryRun ? 'validated' : 'settingsSaved',
          effectVerified: false,
          ...result,
        };
      }
      if (command.permission === 'applets.manage') {
        if (!this.options.appletManagement)
          throw new AppletManagementError('NOT_FOUND', 'Applet管理を利用できません。');
        const result = await this.options.appletManagement.execute(id);
        return { id, completion: 'lifecycleApplied', effectVerified: false, ...result };
      }
      if (command.permission === 'settings.write') {
        const result = this.settingsCommands.execute(id, args);
        return {
          id,
          completion: result.dryRun ? 'validated' : 'settingsSaved',
          effectVerified: false,
          ...result,
        };
      }
      await this.options.execute(id, {
        ...context,
        origin: context.origin ?? (appletId ? { kind: 'applet', appletId } : { kind: 'mcp' }),
      });
      return {
        id,
        completion: command.completion,
        effectVerified: false,
        message:
          command.completion === 'accepted'
            ? '表示要求を受け付けました。表示の完了は未確認です。'
            : 'コマンド処理から応答が返りました。操作先での効果は未確認です。',
      };
    } catch (error) {
      if (error instanceof AutomationError) throw error;
      if (error instanceof SettingsCommandError || error instanceof AppletManagementError)
        throw new AutomationError(error.code, error.message);
      throw new AutomationError(
        'COMMAND_FAILED',
        '実行に失敗したか、完了を確認できません。再実行する前に操作先の状態を確認してください。',
      );
    } finally {
      this.executing--;
    }
  }
}

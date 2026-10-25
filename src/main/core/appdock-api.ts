import { hostText } from '../../shared/i18n';
import { AsyncLocalStorage } from 'node:async_hooks';
import { touchpadBridgeCommands, executeTouchpadBridgeCommand } from './touchpad-commands';
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
import { SettingsTargets, SettingsTargetError } from './settings-targets';
import { settingsOperations, type SettingsMethod } from '../../shared/settings-operations';
import type { GlobalHotKeyStatus, ExtensionSnapshot } from '../../shared/contracts';
import type { ShortcutPageChoice } from '../../shared/shortcut-pages';

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
  private callContext = new AsyncLocalStorage<InputInvocation>();
  private settingsCommands: SettingsCommands;
  private settingsTargets: SettingsTargets;
  private shortcuts: ShortcutCommands;
  private gestures: GestureCommands;
  private touchpadGestures: GestureCommands;
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
      settingsPrincipal?(): string;
      customCommands?: CustomCommandService;
      mcpClientAllowed?(): boolean;
      inputAllowed?(): boolean;
      processesAllowed?(): boolean;
      appletManagement?: AppletManagement;
      inputPages?(): ShortcutPageChoice[];
      touchpadBridge?: {
        snapshot(): unknown;
        connect(
          ids: import('../../shared/touchpad-gestures').TouchpadGestureId[],
        ): Promise<unknown>;
        afterLocalEdit(before: Settings): Promise<unknown>;
      };
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
    this.settingsTargets = new SettingsTargets({
      targets: () => this.settingsCommands.fieldTargets(),
      revision: () => this.settingsCommands.revision(),
      principal: () => this.options.settingsPrincipal?.() ?? this.options.instanceId,
    });
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
    this.touchpadGestures = new GestureCommands({
      ...options,
      touchpad: true,
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
      sendInput: (this.options.inputAllowed?.() ?? false) && this.options.executable(),
      runProcesses: this.options.processesAllowed?.() ?? false,
      read: true,
      execute: this.options.executable(),
      write: this.options.writable(),
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
        value === true && root[key as keyof AppletApiPermissions] === true,
      ]),
    ) as AppletApiPermissions;
  }
  publishedCommandIds(): ReadonlySet<string> {
    return new Set(this.commands().map((command) => command.id));
  }
  private commands(context: InputInvocation = this.callContext.getStore() ?? {}) {
    return [
      ...new Map(
        [
          ...this.options
            .commands()
            .filter((command) => !this.settingsCommands.hasGenerated(command.id)),
          ...(this.options.customCommands
            ? [
                ...this.options.customCommands.publicCommands(context),
                this.options.customCommands.managementCommand(),
              ]
            : []),
          ...this.settingsCommands.commands(
            context.apiCaller?.kind === 'applet' || context.origin?.kind === 'applet'
              ? 'applet'
              : 'mcp',
          ),
          ...(this.options.appletManagement?.commands() ?? []),
          ...this.shortcuts.commands(),
          ...this.gestures.commands(),
          ...this.touchpadGestures.commands(),
          ...touchpadBridgeCommands,
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
    const invocation: InputInvocation = {
      ...context,
      apiCaller: appletId ? { kind: 'applet', appletId } : { kind: 'mcp' },
    };
    // Editors resolve assignable commands lazily; preserve this request's publication scope.
    return this.callContext.run(invocation, () =>
      this.dispatch(method, params, appletId, invocation),
    );
  }
  private dispatch(
    method: string,
    params: unknown,
    appletId: string | undefined,
    context: InputInvocation,
  ): Record<string, unknown> | Promise<Record<string, unknown>> {
    const permissions = this.effectivePermissions(appletId, context);
    const definition = Object.hasOwn(appDockOperations, method)
      ? appDockOperations[method as AppDockMethod]
      : undefined;
    const caller = appletId === undefined ? 'mcp' : 'applet';
    if (!definition || !(definition.callers as readonly string[]).includes(caller))
      throw new AutomationError('NOT_FOUND', hostText('services.appdockApi.unsupported'));
    for (const permission of definition.permissions)
      if (!permissions[permission])
        throw new AutomationError(
          permission === 'write' && method === 'settings.apply' ? 'WRITE_DISABLED' : 'API_DISABLED',
          hostText('services.appdockApi.permission'),
        );
    if (!this.options.ready())
      throw new AutomationError('NOT_READY', hostText('services.appdockApi.unavailable'));
    if (!object(params))
      throw new AutomationError('INVALID_ARGUMENT', hostText('services.appdockApi.argumentObject'));
    if (Object.hasOwn(settingsOperations, method)) {
      if (context.origin?.kind === 'applet')
        throw new AutomationError('NOT_FOUND', hostText('services.appdockApi.unsupported'));
      if (!inputValidators.get(method)!(params).valid)
        throw new AutomationError(
          'INVALID_ARGUMENT',
          hostText('services.appdockApi.argumentSchema'),
        );
      try {
        return this.settingsTargets.call(method as SettingsMethod, params);
      } catch (error) {
        if (error instanceof SettingsTargetError || error instanceof SettingsCommandError)
          throw new AutomationError(error.code, error.message);
        throw error;
      }
    }
    if (method.startsWith('customCommands.')) {
      if (!inputValidators.get(method)!(params).valid)
        throw new AutomationError(
          'INVALID_ARGUMENT',
          hostText('services.appdockApi.argumentSchema'),
        );
      if (!this.options.customCommands)
        throw new AutomationError(
          'NOT_READY',
          hostText('services.appdockApi.customCommandsUnavailable'),
        );
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
        throw new AutomationError(
          'INVALID_ARGUMENT',
          hostText('services.appdockApi.argumentSchema'),
        );
      return handler(params, appletId, context);
    }
    if (
      !['settings.get', 'settings.getSchema', 'applets.get', 'commands.execute'].includes(method) &&
      Object.keys(params).length
    )
      throw new AutomationError('INVALID_ARGUMENT', hostText('services.appdockApi.noArguments'));
    switch (method) {
      case 'system.getInfo':
        return {
          apiVersion: 2,
          trayEditingAllowed: permissions.write === true,
          ribbonEditingAllowed: permissions.write === true,
          appletManagementAllowed: permissions.write === true,
          gestureEditingAllowed: permissions.write === true,
          shortcutEditingAllowed: permissions.write === true,
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
        if (!applet)
          throw new AutomationError('NOT_FOUND', hostText('services.appdockApi.appletMissing'));
        return {
          applet,
          commands: this.commands({
            ...context,
            apiCaller: appletId ? { kind: 'applet', appletId } : { kind: 'mcp' },
            origin: context.origin ?? (appletId ? { kind: 'applet', appletId } : { kind: 'mcp' }),
          }).filter((c) => c.appletId === id),
          executable: permissions.execute === true,
        };
      }
      case 'commands.list':
        return {
          trayEditingAllowed: permissions.write === true,
          ribbonEditingAllowed: permissions.write === true,
          gestureEditingAllowed: permissions.write === true,
          shortcutEditingAllowed: permissions.write === true,
          appletManagementAllowed: permissions.write === true,
          commands: this.commands({
            ...context,
            apiCaller: appletId ? { kind: 'applet', appletId } : { kind: 'mcp' },
            origin: context.origin ?? (appletId ? { kind: 'applet', appletId } : { kind: 'mcp' }),
          }),
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
          trayEditingAllowed: permissions.write === true,
        };
      case 'ribbon.get':
        return {
          ...this.ribbon.get(this.commands(context)),
          writable: permissions.write === true,
          executable: permissions.execute === true,
          ribbonEditingAllowed: permissions.write === true,
        };
      case 'touchpadGestures.get':
        return {
          ...this.touchpadGestures.get(),
          state: this.options.touchpadBridge?.snapshot(),
          editingAllowed: permissions.write === true,
        };
      case 'gestures.get':
        return {
          ...this.gestures.get(),
          writable: permissions.write === true,
          executable: permissions.execute === true,
          gestureEditingAllowed: permissions.write === true,
        };
      case 'shortcuts.get':
        return {
          ...this.shortcuts.get(),
          writable: permissions.write === true,
          executable: permissions.execute === true,
          gestureEditingAllowed: permissions.write === true,
          shortcutEditingAllowed: permissions.write === true,
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
            hostText('services.appdockApi.appletSettingsArguments'),
          );
        try {
          const settingsCaller =
            appletId === undefined && context.origin?.kind !== 'applet' ? 'mcp' : 'applet';
          return method === 'settings.get'
            ? this.settingsCommands.get(params.appletId as string | undefined, settingsCaller)
            : {
                ...this.settingsCommands.schema(
                  params.appletId as string | undefined,
                  settingsCaller,
                ),
                writable: permissions.write === true,
              };
        } catch (error) {
          if (error instanceof SettingsCommandError)
            throw new AutomationError(error.code, error.message);
          throw error;
        }
      }
      default:
        throw new AutomationError('NOT_FOUND', hostText('services.appdockApi.unsupported'));
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
        hostText('services.appdockApi.commandArguments'),
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
    const command = this.commands({
      ...context,
      apiCaller: appletId ? { kind: 'applet', appletId } : { kind: 'mcp' },
    }).find((c) => c.id === id);
    if (!command)
      throw new AutomationError('NOT_FOUND', hostText('services.appdockApi.privateCommand'));
    if (!command.available)
      throw new AutomationError('UNAVAILABLE', hostText('services.appdockApi.commandUnavailable'));
    const settingsEdit =
      command.permission?.endsWith('.write') ||
      (command.permission === 'applets.manage' &&
        (command.operation === 'enable' || command.operation === 'disable'));
    if (!settingsEdit && !permissions.execute)
      throw new AutomationError(
        'EXECUTION_DISABLED',
        hostText('services.appdockApi.executionPermission'),
      );
    if (settingsEdit && (!permissions.read || !permissions.write))
      throw new AutomationError(
        'WRITE_DISABLED',
        hostText('services.appdockApi.settingsPermission'),
      );
    if (
      !object(args) ||
      (![
        'settings.write',
        'customCommands.write',
        'shortcuts.write',
        'gestures.write',
        'touchpadGestures.write',
        'ribbon.write',
        'tray.write',
      ].includes(command.permission ?? '') &&
        Object.keys(args).length)
    )
      throw new AutomationError('INVALID_ARGUMENT', hostText('services.appdockApi.commandSchema'));
    if (
      [
        'settings.write',
        'customCommands.write',
        'shortcuts.write',
        'gestures.write',
        'touchpadGestures.write',
        'ribbon.write',
        'tray.write',
      ].includes(command.permission ?? '') &&
      !permissions.write
    )
      throw new AutomationError(
        'WRITE_DISABLED',
        hostText('services.appdockApi.settingsPermission'),
      );
    if (
      appletId &&
      command.appletId === appletId &&
      (command.permission === 'applets.manage' || !command.permission)
    )
      throw new AutomationError('SELF_CALL', hostText('services.appdockApi.selfCall'));
    // Synchronous settings edits can complete while an Applet handler awaits this API.
    // Further asynchronous dispatch is refused, preventing A -> B -> A wait cycles.
    if (this.executing && !(appletId && command.permission?.endsWith('.write')))
      throw new AutomationError('BUSY', hostText('services.appdockApi.busy'));
    this.executing++;
    try {
      if (command.permission === 'customCommands.write') {
        if (!this.options.customCommands)
          throw new AutomationError(
            'API_DISABLED',
            hostText('services.appdockApi.customCommandPermission'),
          );
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
        const result = this.ribbon.execute(args, this.commands(context));
        return {
          id,
          completion: result.dryRun ? 'validated' : 'settingsSaved',
          effectVerified: false,
          ...result,
        };
      }
      if (command.permission === 'touchpadGestures.write') {
        if (id === 'appdock.touchpadGestures.update') {
          const result = this.touchpadGestures.execute(args);
          return {
            id,
            completion: result.dryRun ? 'validated' : 'settingsSaved',
            effectVerified: false,
            ...result,
          };
        }
        const result = await executeTouchpadBridgeCommand(id, args, {
          ...this.options,
          settingsCommands: this.settingsCommands,
        });
        return { id, ...result };
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
          throw new AppletManagementError(
            'NOT_FOUND',
            hostText('services.appdockApi.appletManagementUnavailable'),
          );
        const result = await this.options.appletManagement.execute(id);
        return { id, completion: 'lifecycleApplied', effectVerified: false, ...result };
      }
      if (command.permission === 'settings.write') {
        const settingsCaller =
          appletId === undefined && context.origin?.kind !== 'applet' ? 'mcp' : 'applet';
        const result = this.settingsCommands.execute(id, args, true, settingsCaller);
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
            ? hostText('services.appdockApi.displayAccepted')
            : hostText('services.appdockApi.commandResponded'),
      };
    } catch (error) {
      if (error instanceof AutomationError) throw error;
      if (error instanceof SettingsCommandError || error instanceof AppletManagementError)
        throw new AutomationError(error.code, error.message);
      throw new AutomationError(
        'COMMAND_FAILED',
        hostText('services.appdockApi.executionUnconfirmed'),
      );
    } finally {
      this.executing--;
    }
  }
}

import { hostText } from '../../shared/i18n';
import { createHash, randomUUID } from 'node:crypto';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv-provider.js';
import {
  boundedJson,
  customCommandId,
  customCommandVersion,
  customDescription,
  customItems,
  customEditableKeys,
  customUpdateCommand,
  customUpdateSchema,
  jsonObject,
  parseCustomCommands,
  parseCustomTypes,
  sameCustomOwner,
  type CustomCommandDefinition,
  type CustomCommandDescriptor,
  type CustomCommandOwner,
  type CustomCommandType,
  type JsonObject,
} from '../../shared/custom-commands';
import type { Settings, SettingsSnapshot } from '../../shared/contracts';
import type { UiCommand } from '../../shared/commands';
import type { AutomationCommand } from './automation-commands';
import type { SettingsStore } from './settings';
import { SettingsCommands, SettingsCommandError } from './settings-commands';
import type { InputInvocation } from './command-contexts';

export class CustomCommandError extends SettingsCommandError {}
export interface CustomCommandProvider {
  owner: CustomCommandOwner;
  title: string;
  types: CustomCommandType[];
  generation: string;
  available: boolean;
  invoke(definition: CustomCommandDefinition, context: InputInvocation): Promise<unknown>;
  validateConfig?(config: JsonObject): string | null;
  unavailableReason?(config: JsonObject): string | null;
  authorized?(context: InputInvocation): boolean;
}
const failure = (code: string, message: string): never => {
  throw new CustomCommandError(code, message);
};
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
// The installed SDK's validator uses draft-07. Only the checked common subset is
// passed to it; removing the dialect marker never enables unsupported keywords.
function executableSchema(value: unknown): any {
  if (!jsonObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== '$schema')
      .map(([key, v]) => [
        key,
        ['properties', '$defs'].includes(key) && jsonObject(v)
          ? Object.fromEntries(Object.entries(v).map(([k, child]) => [k, executableSchema(child)]))
          : ['allOf', 'anyOf', 'oneOf'].includes(key) && Array.isArray(v)
            ? v.map(executableSchema)
            : ['items', 'additionalProperties', 'not', 'if', 'then', 'else'].includes(key)
              ? executableSchema(v)
              : v,
      ]),
  );
}
export function compileCustomType(type: CustomCommandType) {
  const validator = new AjvJsonSchemaValidator();
  const validate = validator.getValidator(executableSchema(type.configSchema));
  for (const field of type.fields ?? [])
    if (field.default !== undefined) {
      const schema = { ...executableSchema(type.configSchema), required: [field.key] };
      if (!validator.getValidator(schema)({ [field.key]: field.default }).valid)
        throw Error(hostText('services.customCommands.defaultSchema'));
    }
  return validate;
}
export class CustomCommandService {
  private hosts = new Map<string, CustomCommandProvider>();
  private bindings = new Map<string, string>();
  private compiled = new Map<string, ReturnType<typeof compileCustomType>>();
  private active = new Map<
    string,
    {
      definition: CustomCommandDefinition;
      generation: string;
      context: InputInvocation;
      controller: AbortController;
    }
  >();
  private epoch = randomUUID();
  constructor(
    private options: {
      settings: SettingsStore;
      settingsCommands: SettingsCommands;
      save(value: Settings, revision: number): SettingsSnapshot;
      providers(): CustomCommandProvider[];
      reservedIds?(): string[];
      authorized?(context: InputInvocation): boolean;
      changed?(): void;
      failed?(code: string, commandId: string): void;
      unavailable?(ids: string[]): void;
      timeoutMs?: number;
    },
  ) {}
  hostTypeIds() {
    return [...this.hosts.keys()];
  }
  registerHost(
    type: CustomCommandType,
    handler: (config: JsonObject, context: InputInvocation) => Promise<unknown>,
    checks: Pick<CustomCommandProvider, 'validateConfig' | 'unavailableReason' | 'authorized'> = {},
  ) {
    const [parsed] = parseCustomTypes(null, [type]);
    if (this.hosts.has(parsed.id)) throw Error(hostText('services.customCommands.duplicateType'));
    compileCustomType(parsed);
    if (this.records().length >= 256) throw Error(hostText('services.customCommands.typeLimit'));
    this.hosts.set(parsed.id, {
      owner: { kind: 'host' },
      title: 'AppDock',
      types: [parsed],
      available: true,
      generation: randomUUID(),
      invoke: (definition, context) => handler(definition.config, context),
      ...checks,
    });
    this.options.changed?.();
  }
  registerApplet(owner: string, generation: string, typeId: unknown) {
    const record = this.records().find(
      (r) =>
        r.type.id === typeId && r.provider.owner.kind === 'applet' && r.provider.owner.id === owner,
    );
    if (!record || !generation || record.provider.generation !== generation)
      throw Error(hostText('services.customCommands.ownTypeOnly'));
    if (this.bindings.get(record.type.id) === generation)
      throw Error(hostText('services.customCommands.generationDuplicate'));
    this.validator(record.type);
    this.bindings.set(record.type.id, generation);
    this.options.changed?.();
  }
  private records() {
    const providers = [...this.hosts.values(), ...this.options.providers()];
    const result = providers.flatMap((provider) =>
      provider.types.map((type) => ({ provider, type })),
    );
    if (result.length > 256 || new Set(result.map((r) => r.type.id)).size !== result.length)
      return failure('TYPE_UNAVAILABLE', hostText('services.customCommands.invalidDeclarations'));
    return result;
  }
  private validator(type: CustomCommandType) {
    const key = digest(type);
    let validator = this.compiled.get(key);
    if (!validator) {
      validator = compileCustomType(type);
      this.compiled.set(key, validator);
      while (this.compiled.size > 256) this.compiled.delete(this.compiled.keys().next().value!);
    }
    return validator;
  }
  descriptors(): CustomCommandDescriptor[] {
    return this.records().map(({ type, provider }) => ({
      ...structuredClone(type),
      owner: structuredClone(provider.owner),
      typeRevision: digest({ type, owner: provider.owner }),
      available:
        provider.available &&
        (provider.owner.kind === 'host' || this.bindings.get(type.id) === provider.generation),
    }));
  }
  private state(item: CustomCommandDefinition) {
    const record = this.records().find(
      (r) => r.type.id === item.typeId && sameCustomOwner(r.provider.owner, item.owner),
    );
    let reason: string | null = null;
    if (!item.enabled) reason = hostText('settings.customCommandState.disabled');
    else if (!record) reason = hostText('settings.customCommandState.missingType');
    else if (
      !record.provider.available ||
      (item.owner.kind === 'applet' &&
        this.bindings.get(item.typeId) !== record.provider.generation)
    )
      reason = hostText('settings.customCommandState.stopped');
    else if (item.configVersion !== record.type.configVersion)
      reason = hostText('settings.customCommandState.configVersion');
    else {
      try {
        if (!this.validator(record.type)(item.config).valid)
          reason = hostText('settings.customCommandState.schemaMismatch');
      } catch {
        reason = hostText('settings.customCommandState.schemaUnavailable');
      }
      if (!reason) reason = record.provider.unavailableReason?.(item.config) ?? null;
    }
    return { record, reason, published: !!record?.type.automation && item.automation };
  }
  summaries() {
    return customItems(this.options.settings.value.customCommands).map(({ config, ...item }) => ({
      ...item,
      commandId: customCommandId(item.id),
      available: this.state({ ...item, config }).reason === null,
      unavailableReason: this.state({ ...item, config }).reason,
    }));
  }
  uiCommands(): UiCommand[] {
    return this.summaries().map((item) => ({
      id: item.commandId,
      customDefinitionId: item.id,
      title: item.title,
      description: item.description,
      extension: item.owner.kind === 'host' ? 'AppDock' : item.owner.id,
      extensionId: item.owner.kind === 'host' ? null : item.owner.id,
      available: item.available,
      disabledReason: item.unavailableReason ?? undefined,
    }));
  }
  publicCommands(context: InputInvocation = {}): AutomationCommand[] {
    return customItems(this.options.settings.value.customCommands).flatMap((item) => {
      const state = this.state(item);
      const reason =
        state.reason ??
        (state.record?.provider.authorized?.(context) === false
          ? hostText('services.customCommands.typePermission')
          : null);
      return state.published
        ? [
            {
              id: customCommandId(item.id),
              title: item.title,
              description: item.description,
              appletId: item.owner.kind === 'applet' ? item.owner.id : null,
              available: reason === null,
              unavailableReason: reason,
              completion: 'handlerReturned' as const,
            },
          ]
        : [];
    });
  }
  managementCommand(): AutomationCommand {
    return {
      id: customUpdateCommand,
      title: hostText('services.customCommands.editTitle'),
      appletId: null,
      available:
        !this.options.settings.value.customCommands ||
        this.options.settings.value.customCommands.version === customCommandVersion,
      unavailableReason: null,
      completion: 'settingsSaved',
      permission: 'customCommands.write',
      inputSchema: customUpdateSchema,
    };
  }
  private owned(owner: CustomCommandOwner, caller?: string) {
    return caller === undefined || (owner.kind === 'applet' && owner.id === caller);
  }
  read(method: string, params: JsonObject, caller?: string): JsonObject {
    const revision = this.options.settingsCommands.revision();
    const descriptors = this.descriptors().filter((d) => this.owned(d.owner, caller));
    if (method === 'customCommands.types.get') {
      const type = descriptors.find((d) => d.id === params.typeId);
      if (!type) return failure('NOT_FOUND', hostText('services.customCommands.typeMissing'));
      return { type };
    }
    if (method === 'customCommands.get') {
      const item = customItems(this.options.settings.value.customCommands).find(
        (i) => i.id === params.id && this.owned(i.owner, caller),
      );
      if (!item) return failure('NOT_FOUND', hostText('services.customCommands.missing'));
      return {
        item: structuredClone(item),
        typeRevision:
          descriptors.find((d) => d.id === item.typeId && sameCustomOwner(d.owner, item.owner))
            ?.typeRevision ?? null,
        revision,
      };
    }
    if (caller !== undefined && params.ownerId !== undefined && params.ownerId !== caller)
      return failure('PERMISSION_DENIED', hostText('services.customCommands.ownProviderOnly'));
    const values =
      method === 'customCommands.types.list'
        ? descriptors.map(({ configSchema, fields, ...d }) => d)
        : this.summaries().filter((d) => this.owned(d.owner, caller));
    const filtered = values.filter(
      (d) =>
        params.ownerId === undefined ||
        (d.owner.kind === 'host' ? params.ownerId === null : params.ownerId === d.owner.id),
    );
    const signature = digest({
      epoch: this.epoch,
      revision,
      caller: caller ?? null,
      method,
      ownerId: params.ownerId,
      values: filtered,
    });
    let offset = 0;
    if (params.cursor !== undefined) {
      const match =
        typeof params.cursor === 'string' ? /^(\d+):([a-f0-9]{64})$/.exec(params.cursor) : null;
      if (!match || match[2] !== signature || Number(match[1]) >= filtered.length)
        return failure('STALE_CURSOR', hostText('services.customCommands.restartList'));
      offset = Number(match[1]);
    }
    const limit = params.limit === undefined ? 20 : Number(params.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50)
      return failure('INVALID_ARGUMENT', hostText('services.customCommands.pageSize'));
    const items = filtered.slice(offset, offset + limit);
    return {
      items,
      revision,
      nextCursor: offset + limit < filtered.length ? `${offset + limit}:${signature}` : null,
      supportedVersion:
        !this.options.settings.value.customCommands ||
        this.options.settings.value.customCommands.version === customCommandVersion,
    };
  }
  update(raw: unknown, caller?: string, replacement = false): JsonObject {
    if (
      !jsonObject(raw) ||
      typeof raw.expectedRevision !== 'string' ||
      (raw.dryRun !== undefined && typeof raw.dryRun !== 'boolean') ||
      Object.keys(raw).some((k) => !['expectedRevision', 'dryRun', 'operations'].includes(k)) ||
      !Array.isArray(raw.operations) ||
      !raw.operations.length ||
      raw.operations.length > (replacement ? 513 : 32)
    )
      return failure('INVALID_ARGUMENT', hostText('services.customCommands.patchArguments'));
    this.options.settingsCommands.checkRevision(raw.expectedRevision);
    const store = this.options.settings;
    if (
      !replacement &&
      store.value.customCommands &&
      store.value.customCommands.version !== customCommandVersion
    )
      return failure('UNSUPPORTED_VERSION', hostText('services.customCommands.unsupportedVersion'));
    let items = structuredClone(customItems(store.value.customCommands));
    const descriptors = this.descriptors();
    const validate = (item: CustomCommandDefinition, expected: unknown) => {
      const type = descriptors.find(
        (d) => d.id === item.typeId && sameCustomOwner(d.owner, item.owner),
      );
      if (!type)
        return failure('TYPE_UNAVAILABLE', hostText('services.customCommands.installType'));
      if (type.typeRevision !== expected)
        return failure('TYPE_CHANGED', hostText('services.customCommands.refreshType'));
      if (type.configVersion !== item.configVersion)
        return failure(
          'UNSUPPORTED_CONFIG_VERSION',
          hostText('services.customCommands.configVersion'),
        );
      if (!jsonObject(item.config))
        return failure('INVALID_ARGUMENT', hostText('services.customCommands.configObject'));
      boundedJson(item.config, 16 * 1024);
      if (!this.validator(type)(item.config).valid)
        return failure('INVALID_ARGUMENT', hostText('services.customCommands.configSchema'));
      const provider = this.records().find((r) => r.type.id === item.typeId)?.provider;
      const invalid = provider?.validateConfig?.(item.config);
      if (invalid) return failure('INVALID_ARGUMENT', invalid);
      if (item.automation && !type.automation)
        return failure(
          'PERMISSION_DENIED',
          hostText('services.customCommands.automationForbidden'),
        );
    };
    try {
      for (const operation of raw.operations) {
        if (!jsonObject(operation))
          return failure('INVALID_ARGUMENT', hostText('services.customCommands.operationFormat'));
        const allowed = (
          {
            add: ['op', 'item', 'expectedTypeRevision'],
            update: ['op', 'id', 'changes', 'expectedTypeRevision'],
            remove: ['op', 'id'],
            reorder: ['op', 'ids'],
          } as Record<string, string[]>
        )[String(operation.op)];
        if (!allowed || Object.keys(operation).some((k) => !allowed.includes(k)))
          return failure(
            'INVALID_ARGUMENT',
            hostText('services.customCommands.unsupportedOperation'),
          );
        if (operation.op === 'add') {
          const input = operation.item;
          if (
            !jsonObject(input) ||
            Object.keys(input).some(
              (k) =>
                ![
                  'id',
                  'typeId',
                  'title',
                  'description',
                  'configVersion',
                  'config',
                  'enabled',
                  'automation',
                ].includes(k),
            )
          )
            return failure(
              'INVALID_ARGUMENT',
              hostText('services.customCommands.definitionFormat'),
            );
          const type = descriptors.find(
            (d) => d.id === input.typeId && this.owned(d.owner, caller),
          );
          if (!type)
            return failure(
              'TYPE_UNAVAILABLE',
              hostText('services.customCommands.managedTypeMissing'),
            );
          if (caller && input.automation !== undefined && input.automation !== false)
            return failure(
              'PERMISSION_DENIED',
              hostText('services.customCommands.appletAutomationForbidden'),
            );
          const item = {
            ...input,
            description: customDescription(
              input.description === undefined ? '' : input.description,
            ),
            owner: type.owner,
            enabled: input.enabled ?? true,
            automation: input.automation ?? false,
          } as unknown as CustomCommandDefinition;
          validate(item, operation.expectedTypeRevision);
          if (
            items.some((i) => i.id === item.id) ||
            this.options.reservedIds?.().includes(customCommandId(item.id))
          )
            return failure('INVALID_ARGUMENT', hostText('services.customCommands.duplicateId'));
          items.push(item);
        } else if (operation.op === 'reorder') {
          const owned = items.filter((i) => this.owned(i.owner, caller));
          if (
            !Array.isArray(operation.ids) ||
            operation.ids.length !== owned.length ||
            new Set(operation.ids).size !== owned.length ||
            operation.ids.some((id) => !owned.some((i) => i.id === id))
          )
            return failure('INVALID_ARGUMENT', hostText('services.customCommands.orderIds'));
          const ordered = operation.ids.map((id) => owned.find((i) => i.id === id)!);
          items = items.map((i) => (this.owned(i.owner, caller) ? ordered.shift()! : i));
        } else {
          const index = items.findIndex(
            (i) => i.id === operation.id && this.owned(i.owner, caller),
          );
          if (index < 0)
            return failure(
              'NOT_FOUND',
              hostText('services.customCommands.managedDefinitionMissing'),
            );
          if (operation.op === 'remove') items.splice(index, 1);
          else {
            const changes = operation.changes;
            if (
              !jsonObject(changes) ||
              !Object.keys(changes).length ||
              Object.keys(changes).some((k) => !customEditableKeys.includes(k))
            )
              return failure('INVALID_ARGUMENT', hostText('services.customCommands.patchFields'));
            if (caller && Object.hasOwn(changes, 'automation'))
              return failure(
                'PERMISSION_DENIED',
                hostText('services.customCommands.appletPermissionChangeForbidden'),
              );
            if (Object.hasOwn(changes, 'configVersion') && !Object.hasOwn(changes, 'config'))
              return failure(
                'INVALID_ARGUMENT',
                hostText('services.customCommands.fullConfigRequired'),
              );
            const before = items[index],
              item = { ...before, ...changes };
            if (
              Object.hasOwn(changes, 'config') ||
              Object.hasOwn(changes, 'configVersion') ||
              (!before.enabled && item.enabled) ||
              (!before.automation && item.automation)
            )
              validate(item, operation.expectedTypeRevision);
            items[index] = item;
          }
        }
      }
      const block = parseCustomCommands({ version: customCommandVersion, items });
      if (!raw.dryRun) {
        this.options.settingsCommands.checkRevision(raw.expectedRevision);
        try {
          this.options.save({ ...store.value, customCommands: block }, store.revision);
        } catch (error) {
          if (error instanceof SettingsCommandError) throw error;
          return failure('SAVE_FAILED', hostText('services.customCommands.saveFailed'));
        }
        this.reconcile();
      }
      return {
        dryRun: raw.dryRun === true,
        revision: this.options.settingsCommands.revision(),
        ids: items.filter((i) => this.owned(i.owner, caller)).map((i) => i.id),
      };
    } catch (error) {
      if (error instanceof SettingsCommandError) throw error;
      return failure('INVALID_ARGUMENT', hostText('services.customCommands.invalidStorage'));
    }
  }
  has(id: string) {
    return customItems(this.options.settings.value.customCommands).some(
      (i) => customCommandId(i.id) === id,
    );
  }
  validateReplacement(next: Settings) {
    const current = this.options.settings.value.customCommands;
    if (JSON.stringify(current) === JSON.stringify(next.customCommands)) return;
    if (!next.customCommands || next.customCommands.version !== customCommandVersion)
      return failure(
        'UNSUPPORTED_VERSION',
        hostText('services.customCommands.fixedStorageVersion'),
      );
    const before = customItems(current),
      after = customItems(parseCustomCommands(next.customCommands));
    const types = this.descriptors();
    const operations: JsonObject[] = [];
    for (const item of before)
      if (!after.some((i) => i.id === item.id)) operations.push({ op: 'remove', id: item.id });
    for (const item of after) {
      const old = before.find((i) => i.id === item.id);
      const type = types.find((t) => t.id === item.typeId && sameCustomOwner(t.owner, item.owner));
      if (!old) {
        if (!type)
          return failure(
            'TYPE_UNAVAILABLE',
            hostText('services.customCommands.newDefinitionProvider'),
          );
        const { owner, ...input } = item;
        operations.push({ op: 'add', item: input, expectedTypeRevision: type.typeRevision });
      } else {
        if (old.typeId !== item.typeId || !sameCustomOwner(old.owner, item.owner))
          return failure('INVALID_ARGUMENT', hostText('services.customCommands.fixedProvider'));
        const changes = Object.fromEntries(
          customEditableKeys
            .filter(
              (k) =>
                JSON.stringify(old[k as keyof typeof old]) !==
                JSON.stringify(item[k as keyof typeof item]),
            )
            .map((k) => [k, item[k as keyof typeof item]]),
        );
        if (Object.hasOwn(changes, 'configVersion')) changes.config = item.config;
        if (Object.keys(changes).length)
          operations.push({
            op: 'update',
            id: item.id,
            changes,
            expectedTypeRevision: type?.typeRevision,
          });
      }
    }
    operations.push({ op: 'reorder', ids: after.map((i) => i.id) });
    this.update(
      { expectedRevision: this.options.settingsCommands.revision(), dryRun: true, operations },
      undefined,
      true,
    );
  }
  reconcile() {
    const records = this.records();
    for (const [id, generation] of this.bindings)
      if (!records.some((r) => r.type.id === id && r.provider.generation === generation))
        this.bindings.delete(id);
    for (const [id, active] of this.active) {
      const item = customItems(this.options.settings.value.customCommands).find(
        (i) => customCommandId(i.id) === id,
      );
      const state = item ? this.state(item) : undefined;
      if (
        !item?.enabled ||
        !state?.record ||
        state.record.provider.generation !== active.generation ||
        !state.record.provider.available ||
        (active.context.origin && active.context.origin.kind !== 'local' && !state.published) ||
        this.options.authorized?.(active.context) === false ||
        state.record.provider.authorized?.(active.context) === false
      )
        active.controller.abort();
    }
    this.options.unavailable?.(
      customItems(this.options.settings.value.customCommands)
        .filter((item) => {
          if (!item.enabled) return false;
          const record = records.find(
            (r) => r.type.id === item.typeId && sameCustomOwner(r.provider.owner, item.owner),
          );
          if (!record || item.configVersion !== record.type.configVersion) return true;
          try {
            return (
              !this.validator(record.type)(item.config).valid ||
              !!record.provider.unavailableReason?.(item.config)
            );
          } catch {
            return true;
          }
        })
        .map((item) => customCommandId(item.id)),
    );
  }
  cancelAll() {
    for (const active of this.active.values()) active.controller.abort();
  }
  async execute(id: string, context: InputInvocation = {}): Promise<JsonObject> {
    const item = customItems(this.options.settings.value.customCommands).find(
      (i) => customCommandId(i.id) === id,
    );
    if (!item) return failure('NOT_FOUND', hostText('services.customCommands.missing'));
    const state = this.state(item),
      external = context.origin && context.origin.kind !== 'local';
    if (state.reason || !state.record)
      return failure(
        'TYPE_UNAVAILABLE',
        state.reason ?? hostText('services.customCommands.typeUnavailable'),
      );
    if (
      (external && !state.published) ||
      this.options.authorized?.(context) === false ||
      state.record.provider.authorized?.(context) === false
    )
      return failure('PERMISSION_DENIED', hostText('services.customCommands.executionForbidden'));
    if (context.signal?.aborted)
      return failure('CANCELLED', hostText('services.customCommands.cancelled'));
    if (this.active.has(id)) return failure('BUSY', hostText('services.customCommands.busy'));
    const controller = new AbortController(),
      definition = structuredClone(item),
      provider = state.record.provider;
    const cancel = () => controller.abort();
    context.signal?.addEventListener('abort', cancel, { once: true });
    this.active.set(id, { definition, generation: provider.generation, controller, context });
    let timeout = false;
    const timer = setTimeout(() => {
      timeout = true;
      controller.abort();
    }, this.options.timeoutMs ?? 30000);
    let aborted!: () => void;
    try {
      const result = await Promise.race([
        provider.invoke(definition, { ...context, signal: controller.signal }),
        new Promise<never>((_, reject) => {
          aborted = () =>
            reject(
              new CustomCommandError(
                timeout ? 'OUTCOME_UNKNOWN' : 'CANCELLED',
                timeout
                  ? hostText('services.customCommands.resultUnconfirmed')
                  : hostText('services.customCommands.waitCancelled'),
              ),
            );
          controller.signal.addEventListener('abort', aborted, { once: true });
          if (controller.signal.aborted) aborted();
        }),
      ]);
      this.reconcile();
      if (controller.signal.aborted)
        return failure('OUTCOME_UNKNOWN', hostText('services.customCommands.providerChanged'));
      if (result !== null && result !== undefined) {
        if (!jsonObject(result)) throw Error('result');
        boundedJson(result, 64 * 1024, 32, 8192);
      }
      return {
        id,
        completion: 'handlerReturned',
        effectVerified: false,
        ...(result === null || result === undefined ? {} : { result: structuredClone(result) }),
      };
    } catch (error) {
      if (error instanceof CustomCommandError) {
        if (error.code === 'OUTCOME_UNKNOWN')
          this.options.failed?.('CUSTOM_COMMAND_OUTCOME_UNKNOWN', id);
        throw error;
      }
      this.options.failed?.('CUSTOM_COMMAND_FAILED', id);
      return failure('OUTCOME_UNKNOWN', hostText('services.customCommands.executionUnconfirmed'));
    } finally {
      clearTimeout(timer);
      controller.signal.removeEventListener('abort', aborted);
      context.signal?.removeEventListener('abort', cancel);
      controller.abort();
      this.active.delete(id);
    }
  }
}

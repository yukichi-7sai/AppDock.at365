import { createHash, randomUUID } from 'node:crypto';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv-provider.js';
import {
  boundedJson,
  customCommandId,
  customCommandVersion,
  customDescription,
  customItems,
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
        throw Error('入力項目の既定値がSchemaに一致しません。');
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
    if (this.hosts.has(parsed.id)) throw Error('種類は登録済みです。');
    compileCustomType(parsed);
    if (this.records().length >= 256) throw Error('種類は256件以内です。');
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
      throw Error('自身の宣言済みの種類だけを登録できます。');
    if (this.bindings.get(record.type.id) === generation)
      throw Error('種類はこの実行世代で登録済みです。');
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
      return failure('TYPE_UNAVAILABLE', '種類宣言の重複または上限超過を解消してください。');
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
    if (!item.enabled) reason = 'コマンドが無効です。';
    else if (!record) reason = '種類が未導入、または提供元が一致しません。';
    else if (
      !record.provider.available ||
      (item.owner.kind === 'applet' &&
        this.bindings.get(item.typeId) !== record.provider.generation)
    )
      reason = '提供元が停止中、またはハンドラーが未登録です。';
    else if (item.configVersion !== record.type.configVersion)
      reason = '設定の版を明示的に更新してください。';
    else {
      try {
        if (!this.validator(record.type)(item.config).valid)
          reason = '設定が現在のSchemaに一致しません。';
      } catch {
        reason = '種類のSchemaを利用できません。';
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
      title: item.title,
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
          ? '呼び出し元にこの種類の実行が許可されていません。'
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
      title: 'カスタムコマンドを編集',
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
      if (!type) return failure('NOT_FOUND', '種類が見つかりません。');
      return { type };
    }
    if (method === 'customCommands.get') {
      const item = customItems(this.options.settings.value.customCommands).find(
        (i) => i.id === params.id && this.owned(i.owner, caller),
      );
      if (!item) return failure('NOT_FOUND', 'カスタムコマンドが見つかりません。');
      return {
        item: structuredClone(item),
        typeRevision:
          descriptors.find((d) => d.id === item.typeId && sameCustomOwner(d.owner, item.owner))
            ?.typeRevision ?? null,
        revision,
      };
    }
    if (caller !== undefined && params.ownerId !== undefined && params.ownerId !== caller)
      return failure('PERMISSION_DENIED', '自身の提供元だけを管理できます。');
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
        return failure('STALE_CURSOR', '一覧を先頭から再取得してください。');
      offset = Number(match[1]);
    }
    const limit = params.limit === undefined ? 20 : Number(params.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50)
      return failure('INVALID_ARGUMENT', '一覧は1～50件です。');
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
      return failure(
        'INVALID_ARGUMENT',
        'expectedRevisionと1～32件のoperationsを指定してください。',
      );
    this.options.settingsCommands.checkRevision(raw.expectedRevision);
    const store = this.options.settings;
    if (
      !replacement &&
      store.value.customCommands &&
      store.value.customCommands.version !== customCommandVersion
    )
      return failure('UNSUPPORTED_VERSION', '未対応の保存版は編集できません。');
    let items = structuredClone(customItems(store.value.customCommands));
    const descriptors = this.descriptors();
    const validate = (item: CustomCommandDefinition, expected: unknown) => {
      const type = descriptors.find(
        (d) => d.id === item.typeId && sameCustomOwner(d.owner, item.owner),
      );
      if (!type) return failure('TYPE_UNAVAILABLE', '種類を導入してから編集してください。');
      if (type.typeRevision !== expected)
        return failure('TYPE_CHANGED', '種類を再取得して入力を確認してください。');
      if (type.configVersion !== item.configVersion)
        return failure('UNSUPPORTED_CONFIG_VERSION', '現在の設定版と全configを指定してください。');
      if (!jsonObject(item.config))
        return failure('INVALID_ARGUMENT', 'configはオブジェクトです。');
      boundedJson(item.config, 16 * 1024);
      if (!this.validator(type)(item.config).valid)
        return failure('INVALID_ARGUMENT', 'configが種類のSchemaに一致しません。');
      const provider = this.records().find((r) => r.type.id === item.typeId)?.provider;
      const invalid = provider?.validateConfig?.(item.config);
      if (invalid) return failure('INVALID_ARGUMENT', invalid);
      if (item.automation && !type.automation)
        return failure('PERMISSION_DENIED', 'この種類は外部公開を許可していません。');
    };
    try {
      for (const operation of raw.operations) {
        if (!jsonObject(operation))
          return failure('INVALID_ARGUMENT', '操作の形式を確認してください。');
        const allowed = (
          {
            add: ['op', 'item', 'expectedTypeRevision'],
            update: ['op', 'id', 'changes', 'expectedTypeRevision'],
            remove: ['op', 'id'],
            reorder: ['op', 'ids'],
          } as Record<string, string[]>
        )[String(operation.op)];
        if (!allowed || Object.keys(operation).some((k) => !allowed.includes(k)))
          return failure('INVALID_ARGUMENT', '未対応の操作または項目です。');
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
            return failure('INVALID_ARGUMENT', '新規定義の形式を確認してください。');
          const type = descriptors.find(
            (d) => d.id === input.typeId && this.owned(d.owner, caller),
          );
          if (!type) return failure('TYPE_UNAVAILABLE', '管理できる種類が見つかりません。');
          if (caller && input.automation !== undefined && input.automation !== false)
            return failure('PERMISSION_DENIED', 'Appletは外部公開を設定できません。');
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
            return failure('INVALID_ARGUMENT', 'コマンドIDが重複しています。');
          items.push(item);
        } else if (operation.op === 'reorder') {
          const owned = items.filter((i) => this.owned(i.owner, caller));
          if (
            !Array.isArray(operation.ids) ||
            operation.ids.length !== owned.length ||
            new Set(operation.ids).size !== owned.length ||
            operation.ids.some((id) => !owned.some((i) => i.id === id))
          )
            return failure('INVALID_ARGUMENT', '管理対象の全IDを1回ずつ指定してください。');
          const ordered = operation.ids.map((id) => owned.find((i) => i.id === id)!);
          items = items.map((i) => (this.owned(i.owner, caller) ? ordered.shift()! : i));
        } else {
          const index = items.findIndex(
            (i) => i.id === operation.id && this.owned(i.owner, caller),
          );
          if (index < 0) return failure('NOT_FOUND', '管理できる定義が見つかりません。');
          if (operation.op === 'remove') items.splice(index, 1);
          else {
            const changes = operation.changes;
            if (
              !jsonObject(changes) ||
              !Object.keys(changes).length ||
              Object.keys(changes).some(
                (k) =>
                  ![
                    'title',
                    'description',
                    'enabled',
                    'automation',
                    'config',
                    'configVersion',
                  ].includes(k),
              )
            )
              return failure('INVALID_ARGUMENT', '変更する項目を確認してください。');
            if (caller && Object.hasOwn(changes, 'automation'))
              return failure('PERMISSION_DENIED', 'Appletは公開設定を変更できません。');
            if (Object.hasOwn(changes, 'configVersion') && !Object.hasOwn(changes, 'config'))
              return failure('INVALID_ARGUMENT', '設定版の変更には全configを指定してください。');
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
          return failure('SAVE_FAILED', '保存できませんでした。設定を再取得して確認してください。');
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
      return failure('INVALID_ARGUMENT', '保存内容の形式・上限・現在の設定を確認してください。');
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
      return failure('UNSUPPORTED_VERSION', '保存ブロックの版は変更できません。');
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
        if (!type) return failure('TYPE_UNAVAILABLE', '新規定義の提供元と種類を確認してください。');
        const { owner, ...input } = item;
        operations.push({ op: 'add', item: input, expectedTypeRevision: type.typeRevision });
      } else {
        if (old.typeId !== item.typeId || !sameCustomOwner(old.owner, item.owner))
          return failure('INVALID_ARGUMENT', '種類と提供元は変更できません。');
        const changes = Object.fromEntries(
          ['title', 'description', 'configVersion', 'config', 'enabled', 'automation']
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
    if (!item) return failure('NOT_FOUND', 'カスタムコマンドが見つかりません。');
    const state = this.state(item),
      external = context.origin && context.origin.kind !== 'local';
    if (state.reason || !state.record)
      return failure('TYPE_UNAVAILABLE', state.reason ?? '種類を利用できません。');
    if (
      (external && !state.published) ||
      this.options.authorized?.(context) === false ||
      state.record.provider.authorized?.(context) === false
    )
      return failure('PERMISSION_DENIED', 'このコマンドの実行は許可されていません。');
    if (context.signal?.aborted) return failure('CANCELLED', '実行は取り消されました。');
    if (this.active.has(id)) return failure('BUSY', 'このコマンドを実行中です。');
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
                  ? '処理結果を確認できません。操作先を確認してから再実行してください。'
                  : '実行待機を取り消しました。操作先での効果は戻りません。',
              ),
            );
          controller.signal.addEventListener('abort', aborted, { once: true });
          if (controller.signal.aborted) aborted();
        }),
      ]);
      this.reconcile();
      if (controller.signal.aborted)
        return failure(
          'OUTCOME_UNKNOWN',
          '実行中に提供元または許可が変わりました。操作先の状態を確認してください。',
        );
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
      return failure(
        'OUTCOME_UNKNOWN',
        '処理に失敗したか結果を確認できません。操作先を確認してから再実行してください。',
      );
    } finally {
      clearTimeout(timer);
      controller.signal.removeEventListener('abort', aborted);
      context.signal?.removeEventListener('abort', cancel);
      controller.abort();
      this.active.delete(id);
    }
  }
}

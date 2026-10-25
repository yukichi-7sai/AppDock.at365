import { createHash, createHmac, randomBytes } from 'node:crypto';
import type { SettingDefinition } from '../../shared/contracts';
import type { SettingsMethod } from '../../shared/settings-operations';
import { settingInputSchema } from '../../shared/settings-commands';
import { boundedJson, jsonObject } from '../../shared/custom-commands';
import { hostText } from '../../shared/i18n';
import {
  SettingsTargetError,
  type SettingsTarget,
  type SettingsListTarget,
} from './settings-target-types';
import {
  listOperationSchemas,
  listValues,
  listRemovable,
  planSettingsList,
} from './settings-lists';
export {
  SettingsTargetError,
  type SettingsFieldPlan,
  type SettingsFieldTarget,
} from './settings-target-types';
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : jsonObject(value)
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .filter((key) => value[key] !== undefined)
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
const digest = (value: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
const resultLimit = 256 * 1024;
const operationSchemas = {
  set: {
    type: 'object',
    properties: {
      kind: { const: 'set' },
      changes: { type: 'object', minProperties: 1, maxProperties: 128 },
    },
    required: ['kind', 'changes'],
    additionalProperties: false,
  },
  reset: {
    type: 'object',
    properties: {
      kind: { const: 'reset' },
      keys: {
        type: 'array',
        minItems: 1,
        maxItems: 128,
        uniqueItems: true,
        items: { type: 'string' },
      },
    },
    required: ['kind', 'keys'],
    additionalProperties: false,
  },
};

/** Fixed transport entry points discover live metadata from the same owners as legacy settings APIs. */
export class SettingsTargets {
  private cursorSecret = randomBytes(32);
  private requests = new Map<
    string,
    {
      fingerprint: string;
      value?: Record<string, unknown>;
      error?: { code: string; message: string };
      pending?: boolean;
    }
  >();
  private lastPrincipal = '';
  constructor(
    private options: {
      targets(): SettingsTarget[];
      revision(): string;
      principal(): string;
    },
  ) {}
  private fail(code: string, key: Parameters<typeof hostText>[0]): never {
    throw new SettingsTargetError(code, hostText(key));
  }
  private invalid(): never {
    return this.fail('INVALID_ARGUMENT', 'services.settingsTargets.invalid');
  }
  private bounded<T extends Record<string, unknown>>(value: T): T {
    if (Buffer.byteLength(JSON.stringify(value), 'utf8') > resultLimit)
      this.fail('RESULT_TOO_LARGE', 'services.settingsTargets.tooLarge');
    return value;
  }
  private field(field: SettingDefinition, target: SettingsTarget) {
    return {
      key: field.key,
      title: field.title,
      description: field.description ?? '',
      type: field.type,
      inputSchema:
        field.type === 'string-list'
          ? {
              type: 'array',
              maxItems: 64,
              items: { type: 'string', minLength: 1, maxLength: 32767 },
            }
          : settingInputSchema({ ...field, options: target.options?.(field) ?? field.options }),
      ...(field.default === undefined ? {} : { default: structuredClone(field.default) }),
      ...(field.step === undefined ? {} : { step: field.step }),
      writable: target.kind !== 'list' || field.key !== target.definition.list?.idKey,
      applies: target.applies(field.key),
    };
  }
  private schemaRevision(target: SettingsTarget) {
    return digest({
      targetId: target.targetId,
      ownerId: target.ownerId,
      category: target.category,
      fields: target.fields.map((field) => this.field(field, target)),
      kind: target.kind ?? 'fields',
      operationSchemas: target.kind === 'list' ? listOperationSchemas : operationSchemas,
    });
  }
  private revision(target: SettingsTarget) {
    return createHmac('sha256', this.cursorSecret)
      .update(
        'values:' +
          JSON.stringify(
            canonical([
              target.targetId,
              this.options.revision(),
              target.overrides(),
              target.kind === 'list' ? target.rows() : undefined,
            ]),
          ),
      )
      .digest('hex');
  }
  private metadata(target: SettingsTarget) {
    return {
      targetId: target.targetId,
      kind: target.kind ?? 'fields',
      ownerId: target.ownerId,
      title: target.title,
      category: target.category,
      available: target.available,
      operations: target.kind === 'list' ? Object.keys(listOperationSchemas) : ['set', 'reset'],
      schemaRevision: this.schemaRevision(target),
    };
  }
  private page(
    items: unknown[],
    params: Record<string, unknown>,
    scope: unknown,
    revision: string,
    envelope: Record<string, unknown>,
  ) {
    const principal = this.options.principal();
    const binding = digest([principal, scope]);
    let offset = 0;
    const limit = params.limit ?? 50;
    if (!Number.isInteger(limit) || Number(limit) < 1 || Number(limit) > 100) this.invalid();
    if (params.cursor !== undefined) {
      if (typeof params.cursor !== 'string' || params.cursor.length > 2048) this.invalid();
      const [payload, signature, ...extra] = params.cursor.split('.');
      if (extra.length || !payload || this.sign(payload) !== signature) this.invalid();
      let value: Record<string, unknown>;
      try {
        value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      } catch {
        return this.invalid();
      }
      if (
        !jsonObject(value) ||
        value.binding !== binding ||
        !Number.isInteger(value.offset) ||
        Number(value.offset) < 0
      )
        this.invalid();
      if (value.revision !== revision)
        this.fail('REVISION_CONFLICT', 'services.settingsTargets.cursorConflict');
      offset = Number(value.offset);
      if (offset >= items.length) this.invalid();
    }
    const cursor = (index: number) => {
      const payload = Buffer.from(JSON.stringify({ binding, revision, offset: index })).toString(
        'base64url',
      );
      return payload + '.' + this.sign(payload);
    };
    const result: unknown[] = [];
    const response = (end: number) => ({
      ...envelope,
      items: result,
      ...(end < items.length ? { nextCursor: cursor(end) } : {}),
    });
    let index = offset;
    while (index < items.length && result.length < Number(limit)) {
      result.push(items[index]);
      if (Buffer.byteLength(JSON.stringify(response(index + 1)), 'utf8') > resultLimit) {
        result.pop();
        if (!result.length) this.fail('RESULT_TOO_LARGE', 'services.settingsTargets.tooLarge');
        break;
      }
      index++;
    }
    return this.bounded(response(index));
  }
  private sign(payload: string) {
    return createHmac('sha256', this.cursorSecret).update(payload).digest('base64url');
  }
  private itemRefs(target: SettingsListTarget) {
    const revision = this.revision(target),
      schemaRevision = this.schemaRevision(target);
    return target
      .rows()
      .map(
        (row, index) =>
          'item:' +
          this.sign(
            JSON.stringify([
              this.options.principal(),
              target.targetId,
              revision,
              schemaRevision,
              index,
              target.definition.list?.idKey ? row[target.definition.list.idKey] : null,
            ]),
          ),
      );
  }
  private state(
    field: SettingDefinition,
    value: unknown,
    target: SettingsTarget,
    overrides?: Record<string, unknown>,
  ) {
    return {
      key: field.key,
      ...(value === undefined ? {} : { value: structuredClone(value) }),
      hasValue: value !== undefined,
      ...(field.default === undefined ? {} : { default: structuredClone(field.default) }),
      inherited: overrides === undefined ? null : !Object.hasOwn(overrides, field.key),
      writable: target.available,
      applies: target.applies(field.key),
    };
  }
  call(method: SettingsMethod, params: Record<string, unknown>) {
    try {
      boundedJson(params, 65536, 12, 4096);
    } catch {
      return this.invalid();
    }
    const targets = this.options.targets();
    const catalogRevision = digest(targets.map((target) => this.metadata(target)));
    const base = { schemaVersion: 1, catalogRevision };
    if (method === 'settings.targets.list') {
      if (params.ownerId !== undefined && typeof params.ownerId !== 'string') this.invalid();
      if (
        params.query !== undefined &&
        (typeof params.query !== 'string' || params.query.length > 200)
      )
        this.invalid();
      const query = String(params.query ?? '').toLocaleLowerCase();
      const selected = targets.filter(
        (target) =>
          (params.ownerId === undefined || target.ownerId === params.ownerId) &&
          (!query ||
            [
              target.title,
              target.ownerId,
              target.category,
              ...target.fields.flatMap((field) => [
                field.key,
                field.title,
                field.description ?? '',
              ]),
            ].some((value) => value.toLocaleLowerCase().includes(query))),
      );
      return this.page(
        selected.map((target) => this.metadata(target)),
        params,
        [method, params.ownerId, query],
        catalogRevision,
        base,
      );
    }
    const target = targets.find((target) => target.targetId === params.targetId);
    if (!target) return this.fail('NOT_FOUND', 'services.settingsTargets.notFound');
    const schemaRevision = this.schemaRevision(target);
    const envelope = {
      ...base,
      targetId: target.targetId,
      schemaRevision,
      available: target.available,
    };
    if (method === 'settings.schema.get')
      return this.page(
        target.fields.map((field) => this.field(field, target)),
        params,
        [method, target.targetId],
        schemaRevision,
        {
          ...envelope,
          kind: target.kind ?? 'fields',
          operationSchemas: target.kind === 'list' ? listOperationSchemas : operationSchemas,
          ...(target.kind === 'list' ? { maxItems: 64 } : {}),
        },
      );
    if (method === 'settings.items.list') {
      if (target.kind !== 'list')
        return this.fail('INVALID_ARGUMENT', 'services.settingsTargets.notList');
      const refs = this.itemRefs(target),
        revision = this.revision(target);
      return this.page(
        target.rows().map((row, index) => ({
          itemRef: refs[index],
          values: listValues(target, row),
          removable: listRemovable(target, row),
        })),
        params,
        [method, target.targetId],
        digest([revision, schemaRevision]),
        { ...envelope, revision },
      );
    }
    if (method === 'settings.options.list') {
      const field = target.fields.find((field) => field.key === params.key);
      if (!field) return this.fail('NOT_FOUND', 'services.settingsTargets.notFound');
      if (field.type !== 'select')
        return this.fail('INVALID_ARGUMENT', 'services.settingsTargets.notOptions');
      if (
        params.itemRef !== undefined &&
        (target.kind !== 'list' || !this.itemRefs(target).includes(String(params.itemRef)))
      )
        this.invalid();
      if (
        params.draftValues !== undefined &&
        (!jsonObject(params.draftValues) ||
          Object.keys(params.draftValues).some(
            (key) => !target.fields.some((field) => field.key === key),
          ))
      )
        this.invalid();
      return this.page(
        target.options?.(field) ?? field.options ?? [],
        params,
        [method, target.targetId, field.key, params.itemRef, params.draftValues],
        schemaRevision,
        { ...envelope, key: field.key },
      );
    }
    if (method === 'settings.values.get') {
      if (target.kind === 'list')
        return this.fail('INVALID_ARGUMENT', 'services.settingsTargets.notFields');
      let fields = target.fields;
      if (params.keys !== undefined) {
        if (
          !Array.isArray(params.keys) ||
          !params.keys.length ||
          params.keys.length > 128 ||
          new Set(params.keys).size !== params.keys.length
        )
          this.invalid();
        fields = params.keys.map((key) => {
          const field = target.fields.find((field) => field.key === key);
          if (!field) return this.fail('NOT_FOUND', 'services.settingsTargets.notFound');
          return field;
        });
      }
      const values = target.values();
      const overrides = target.overrides();
      return this.bounded({
        ...envelope,
        revision: this.revision(target),
        fields: fields.map((field) => this.state(field, values[field.key], target, overrides)),
      });
    }
    if (method !== 'settings.apply') return this.invalid();
    if (!target.available) return this.fail('UNAVAILABLE', 'services.settingsTargets.unavailable');
    if (params.expectedSchemaRevision !== schemaRevision)
      return this.fail('SCHEMA_CONFLICT', 'services.settingsTargets.schemaConflict');
    if (
      typeof params.expectedRevision !== 'string' ||
      typeof params.requestId !== 'string' ||
      !params.requestId ||
      params.requestId.length > 100 ||
      (params.dryRun !== undefined && typeof params.dryRun !== 'boolean')
    )
      this.invalid();
    const changes: Record<string, unknown> = {};
    const reset: string[] = [];
    const used = new Set<string>();
    if (
      !Array.isArray(params.operations) ||
      !params.operations.length ||
      params.operations.length > 32
    )
      this.invalid();
    for (const operation of target.kind === 'list' ? [] : params.operations) {
      if (!jsonObject(operation)) this.invalid();
      const permitted =
        operation.kind === 'set'
          ? ['kind', 'changes']
          : operation.kind === 'reset'
            ? ['kind', 'keys']
            : [];
      if (!permitted.length || Object.keys(operation).some((key) => !permitted.includes(key)))
        this.invalid();
      let keys: string[];
      if (operation.kind === 'set') {
        if (!jsonObject(operation.changes)) this.invalid();
        keys = Object.keys(operation.changes);
        if (!keys.length || keys.length > 128) this.invalid();
      } else {
        if (
          !Array.isArray(operation.keys) ||
          !operation.keys.length ||
          operation.keys.length > 128 ||
          operation.keys.some((key) => typeof key !== 'string')
        )
          this.invalid();
        keys = operation.keys as string[];
      }
      for (const key of keys) {
        if (used.has(key)) this.invalid();
        used.add(key);
        if (!target.fields.some((field) => field.key === key))
          return this.fail('NOT_FOUND', 'services.settingsTargets.notFound');
        if (operation.kind === 'set')
          changes[key] = (operation.changes as Record<string, unknown>)[key];
        else reset.push(key);
      }
    }
    const principal = this.options.principal();
    if (principal !== this.lastPrincipal) {
      this.requests.clear();
      this.lastPrincipal = principal;
    }
    const fingerprint = digest(params);
    const known = this.requests.get(params.requestId);
    if (known) {
      if (known.fingerprint !== fingerprint)
        return this.fail('INVALID_ARGUMENT', 'services.settingsTargets.requestConflict');
      if (known.pending) return this.fail('BUSY', 'services.settingsTargets.busy');
      if (known.error) throw new SettingsTargetError(known.error.code, known.error.message);
      return structuredClone(known.value!);
    }
    this.requests.set(params.requestId, { fingerprint, pending: true });
    try {
      if (params.expectedRevision !== this.revision(target))
        return this.fail('REVISION_CONFLICT', 'services.settingsCommands.refreshChanges');
      let plan: {
        changed: boolean;
        changes: unknown[];
        applies: Record<string, string>;
        commit(): void;
      };
      if (target.kind === 'list')
        plan = planSettingsList(
          target,
          params.operations,
          this.itemRefs(target),
          this.options.revision(),
        );
      else {
        const fieldsPlan = target.plan(changes, reset, this.options.revision());
        plan = {
          changed: !!fieldsPlan.changed.length,
          applies: fieldsPlan.applies,
          commit: fieldsPlan.commit,
          changes: fieldsPlan.changed.map((key) => {
            const field = target.fields.find((field) => field.key === key)!;
            return {
              ...this.state(field, fieldsPlan.values[key], target, fieldsPlan.overrides),
              ...(fieldsPlan.before[key] === undefined
                ? {}
                : { before: structuredClone(fieldsPlan.before[key]) }),
            };
          }),
        };
      }
      const value = {
        ...envelope,
        requestId: params.requestId,
        dryRun: params.dryRun === true,
        completion: params.dryRun ? 'validated' : 'settingsSaved',
        changed: plan.changed,
        changes: plan.changes,
        applies: plan.applies,
        effectVerified: false,
        revision: this.revision(target),
      };
      // Reject oversized results before the owner is allowed to persist anything.
      this.bounded({ ...value, revision: 'x'.repeat(256) });
      const current = this.options
        .targets()
        .find((current) => current.targetId === target.targetId);
      if (!current) return this.fail('NOT_FOUND', 'services.settingsTargets.notFound');
      if (!current.available)
        return this.fail('UNAVAILABLE', 'services.settingsTargets.unavailable');
      if (this.schemaRevision(current) !== schemaRevision)
        return this.fail('SCHEMA_CONFLICT', 'services.settingsTargets.schemaConflict');
      if (params.dryRun !== true) {
        if (params.expectedRevision !== this.revision(target))
          return this.fail('REVISION_CONFLICT', 'services.settingsCommands.refreshChanges');
        plan.commit();
      }
      value.revision = this.revision(target);
      this.requests.set(params.requestId, { fingerprint, value: structuredClone(value) });
      return value;
    } catch (error) {
      const safe =
        error instanceof SettingsTargetError
          ? error
          : new SettingsTargetError('INTERNAL_ERROR', hostText('services.settingsTargets.failed'));
      this.requests.set(params.requestId, {
        fingerprint,
        error: { code: safe.code, message: safe.message },
      });
      throw safe;
    } finally {
      while (this.requests.size > 512) {
        const completed = [...this.requests].find(([, request]) => !request.pending);
        if (!completed) break;
        this.requests.delete(completed[0]);
      }
    }
  }
}

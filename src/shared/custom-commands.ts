/** Persisted command definitions are data; only current declarations grant authority. */
export type JsonObject = Record<string, unknown>;
export type CustomCommandOwner = { kind: 'host' } | { kind: 'applet'; id: string };
export interface CustomCommandField {
  key: string;
  title: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'json';
  default?: unknown;
  options?: { value: string; label: string }[];
}
export interface CustomCommandType {
  id: string;
  title: string;
  description?: string;
  configVersion: number;
  configSchema: JsonObject;
  automation?: boolean;
  fields?: CustomCommandField[];
}
export interface CustomCommandDefinition {
  id: string;
  title: string;
  typeId: string;
  owner: CustomCommandOwner;
  configVersion: number;
  config: JsonObject;
  enabled: boolean;
  automation: boolean;
}
export interface CustomCommandBlock extends JsonObject {
  version: number;
}
export interface CustomCommandDescriptor extends CustomCommandType {
  owner: CustomCommandOwner;
  typeRevision: string;
  available: boolean;
}
export interface CustomCommandSummary extends Omit<CustomCommandDefinition, 'config'> {
  commandId: string;
  available: boolean;
  unavailableReason: string | null;
}
export const customCommandId = (id: string) => `appdock.custom.${id}`;
export const customUpdateCommand = 'appdock.customCommands.update';
export const jsonObject = (v: unknown): v is JsonObject =>
  !!v && typeof v === 'object' && !Array.isArray(v);
export const customUuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(v);
export const sameCustomOwner = (a: CustomCommandOwner, b: CustomCommandOwner) =>
  a.kind === b.kind && (a.kind === 'host' || (b.kind === 'applet' && a.id === b.id));
const identifier = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/.test(v);
const version = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) > 0;
const text = (v: unknown, max: number): v is string =>
  typeof v === 'string' && !!v.trim() && v.length <= max && !/[\x00-\x1f\x7f]/.test(v);
export function boundedJson(value: unknown, bytes: number, depth = 16, count = 2048) {
  const seen = new Set<object>();
  const visit = (v: unknown, level: number) => {
    if (--count < 0 || level > depth) throw Error('JSONの深さ・件数の上限を超えています。');
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return;
    if (typeof v === 'number' && Number.isFinite(v)) return;
    if (!v || typeof v !== 'object' || seen.has(v)) throw Error('JSONの値が不正です。');
    if (!Array.isArray(v) && ![Object.prototype, null].includes(Object.getPrototypeOf(v)))
      throw Error('JSONオブジェクトを指定してください。');
    seen.add(v);
    for (const [key, child] of Object.entries(v)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key))
        throw Error('JSONキーが不正です。');
      visit(child, level + 1);
    }
    seen.delete(v);
  };
  visit(value, 0);
  if (new TextEncoder().encode(JSON.stringify(value)).length > bytes)
    throw Error('JSONのサイズ上限を超えています。');
}
export function customItems(block: CustomCommandBlock | undefined): CustomCommandDefinition[] {
  return block?.version === 1 ? (block.items as CustomCommandDefinition[]) : [];
}
export function parseCustomCommands(value: unknown): CustomCommandBlock {
  if (!jsonObject(value) || !version(value.version))
    throw Error('カスタムコマンドの保存形式が不正です。');
  boundedJson(value, 1024 * 1024, 40, 100000);
  if (value.version !== 1) return structuredClone(value) as CustomCommandBlock;
  if (
    Object.keys(value).some((k) => !['version', 'items'].includes(k)) ||
    !Array.isArray(value.items) ||
    value.items.length > 256
  )
    throw Error('カスタムコマンドは256件以内です。');
  const ids = new Set<string>(),
    counts = new Map<string, number>();
  const items = value.items.map((item: unknown) => {
    if (
      !jsonObject(item) ||
      Object.keys(item).some(
        (k) =>
          ![
            'id',
            'title',
            'typeId',
            'owner',
            'configVersion',
            'config',
            'enabled',
            'automation',
          ].includes(k),
      ) ||
      !customUuid(item.id) ||
      ids.has(item.id) ||
      !text(item.title, 100) ||
      !identifier(item.typeId) ||
      !version(item.configVersion) ||
      !jsonObject(item.config) ||
      typeof item.enabled !== 'boolean' ||
      typeof item.automation !== 'boolean' ||
      !jsonObject(item.owner) ||
      !['host', 'applet'].includes(String(item.owner.kind)) ||
      (item.owner.kind === 'host'
        ? Object.keys(item.owner).length !== 1
        : Object.keys(item.owner).length !== 2 || !identifier(item.owner.id))
    )
      throw Error('カスタムコマンドのID・名前・種類・保存値を確認してください。');
    boundedJson(item.config, 16 * 1024);
    ids.add(item.id);
    const owner = item.owner.kind === 'host' ? 'host' : `applet:${item.owner.id}`;
    counts.set(owner, (counts.get(owner) ?? 0) + 1);
    if (counts.get(owner)! > 100) throw Error('同じ提供元のコマンドは100件以内です。');
    return { ...item, title: item.title.trim() };
  });
  return structuredClone({ version: 1, items });
}

// Deliberate common subset of JSON Schema 2020-12 and draft-07. No remote/recursive
// references, regex, formats or asynchronous validators are accepted.
export function checkCustomSchema(schema: unknown) {
  if (!jsonObject(schema) || schema.type !== 'object')
    throw Error('設定Schemaのルートはobjectです。');
  boundedJson(schema, 32 * 1024, 32, 8192);
  const scalar = new Set([
    'type',
    'title',
    'description',
    'default',
    'enum',
    'const',
    'minimum',
    'maximum',
    'exclusiveMinimum',
    'exclusiveMaximum',
    'multipleOf',
    'minLength',
    'maxLength',
    'minItems',
    'maxItems',
    'uniqueItems',
    'required',
    'minProperties',
    'maxProperties',
  ]);
  let visits = 0;
  const walk = (node: unknown, stack: Set<unknown>) => {
    if (++visits > 10000 || stack.size > 64) throw Error('Schema参照の上限を超えています。');
    if (typeof node === 'boolean') return;
    if (!jsonObject(node) || stack.has(node)) throw Error('循環するSchema参照は使えません。');
    const next = new Set(stack).add(node);
    for (const [key, value] of Object.entries(node)) {
      if (key === '$schema') {
        if (
          value !== 'https://json-schema.org/draft/2020-12/schema' &&
          value !== 'http://json-schema.org/draft-07/schema#'
        )
          throw Error('未対応のSchemaです。');
      } else if (key === '$ref') {
        if (typeof value !== 'string' || !value.startsWith('#/$defs/'))
          throw Error('ローカル$defs参照だけを使用できます。');
        let target: unknown = schema;
        for (const part of value.slice(2).split('/'))
          target = jsonObject(target)
            ? target[part.replace(/~1/g, '/').replace(/~0/g, '~')]
            : undefined;
        walk(target, next);
      } else if (['properties', '$defs'].includes(key)) {
        if (!jsonObject(value)) throw Error('Schemaの宣言を確認してください。');
        for (const child of Object.values(value)) walk(child, next);
      } else if (['items', 'additionalProperties', 'not', 'if', 'then', 'else'].includes(key))
        walk(value, next);
      else if (['allOf', 'anyOf', 'oneOf'].includes(key)) {
        if (!Array.isArray(value) || !value.length || value.length > 16)
          throw Error('Schemaの分岐が不正です。');
        for (const child of value) walk(child, next);
      } else if (!scalar.has(key)) throw Error(`未対応のSchemaキーワード: ${key}`);
    }
  };
  walk(schema, new Set());
}
export function parseCustomTypes(ownerId: string | null, raw: unknown): CustomCommandType[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > 16) throw Error('カスタムコマンドの種類は16件以内です。');
  const ids = new Set<string>();
  return raw.map((value) => {
    boundedJson(value, 64 * 1024, 36, 10000);
    if (
      !jsonObject(value) ||
      Object.keys(value).some(
        (k) =>
          ![
            'id',
            'title',
            'description',
            'configVersion',
            'configSchema',
            'automation',
            'fields',
          ].includes(k),
      ) ||
      !identifier(value.id) ||
      !value.id.startsWith((ownerId ?? 'appdock') + '.') ||
      ids.has(value.id) ||
      !text(value.title, 100) ||
      (value.description !== undefined && !text(value.description, 2000)) ||
      !version(value.configVersion) ||
      (value.automation !== undefined && typeof value.automation !== 'boolean')
    )
      throw Error('カスタムコマンドの種類宣言が不正です。');
    checkCustomSchema(value.configSchema);
    if (value.fields !== undefined) {
      if (!Array.isArray(value.fields) || value.fields.length > 64)
        throw Error('入力項目は64件以内です。');
      const keys = new Set<string>();
      for (const field of value.fields) {
        if (
          !jsonObject(field) ||
          !identifier(field.key) ||
          keys.has(field.key) ||
          !text(field.title, 100) ||
          !['string', 'number', 'boolean', 'select', 'json'].includes(String(field.type)) ||
          Object.keys(field).some(
            (k) => !['key', 'title', 'type', 'default', 'options'].includes(k),
          )
        )
          throw Error('入力項目の宣言が不正です。');
        keys.add(field.key);
        const property = (value.configSchema as any).properties?.[field.key];
        if (
          !jsonObject(property) ||
          (field.type !== 'json' &&
            property.type !== (field.type === 'select' ? 'string' : field.type) &&
            !(field.type === 'number' && property.type === 'integer'))
        )
          throw Error('入力項目とSchemaの型を揃えてください。');
        if (
          field.type === 'select' &&
          (!Array.isArray(field.options) ||
            !field.options.length ||
            field.options.length > 100 ||
            field.options.some(
              (o) =>
                !jsonObject(o) ||
                typeof o.value !== 'string' ||
                !text(o.label, 100) ||
                !Array.isArray(property.enum) ||
                !property.enum.includes(o.value),
            ))
        )
          throw Error('選択肢はSchemaのenumと揃えてください。');
      }
    }
    ids.add(value.id);
    return structuredClone(value) as unknown as CustomCommandType;
  });
}

const listInput = {
  type: 'object',
  properties: {
    ownerId: { type: ['string', 'null'], maxLength: 200 },
    cursor: { type: 'string', maxLength: 256 },
    limit: { type: 'integer', minimum: 1, maximum: 50 },
  },
  additionalProperties: false,
};
const read = {
  callers: ['mcp', 'applet'],
  permissions: ['read', 'manageCustomCommands'],
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
} as const;
export const customCommandOperations = {
  'customCommands.types.list': {
    ...read,
    name: 'appdock_list_custom_command_types',
    description: 'カスタムコマンドの種類を一覧します。Schemaはtypes.getで取得します。',
    inputSchema: listInput,
  },
  'customCommands.types.get': {
    ...read,
    name: 'appdock_get_custom_command_type',
    description: '種類の設定Schema・公開上限・typeRevisionを取得します。',
    inputSchema: {
      type: 'object',
      properties: { typeId: { type: 'string', maxLength: 200 } },
      required: ['typeId'],
      additionalProperties: false,
    },
  },
  'customCommands.list': {
    ...read,
    name: 'appdock_list_custom_commands',
    description: '保存したカスタムコマンドの概要と設定revisionを取得します。',
    inputSchema: listInput,
  },
  'customCommands.get': {
    ...read,
    name: 'appdock_get_custom_command',
    description: 'カスタムコマンドの固定設定と種類・設定revisionを取得します。',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', maxLength: 36 } },
      required: ['id'],
      additionalProperties: false,
    },
  },
} as const;
export const customUpdateSchema = {
  type: 'object',
  properties: {
    expectedRevision: { type: 'string' },
    dryRun: { type: 'boolean' },
    operations: {
      type: 'array',
      minItems: 1,
      maxItems: 32,
      items: {
        type: 'object',
        properties: {
          op: { enum: ['add', 'update', 'remove', 'reorder'] },
          id: { type: 'string' },
          expectedTypeRevision: { type: 'string' },
          item: { type: 'object' },
          changes: { type: 'object' },
          ids: { type: 'array', items: { type: 'string' }, maxItems: 256 },
        },
        required: ['op'],
        additionalProperties: false,
      },
    },
  },
  required: ['expectedRevision', 'operations'],
  additionalProperties: false,
};

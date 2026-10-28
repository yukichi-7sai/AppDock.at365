import { randomUUID } from 'node:crypto';
import type { SettingDefinition } from '../../shared/contracts';
import { jsonObject } from '../../shared/custom-commands';
import { objectFieldValue, setObjectField } from '../../shared/object-list';
import { sameSetting } from '../../shared/settings-defaults';
import {
  validateMcpSetting,
  settingFieldsOverlap,
  mcpSettingValue,
} from '../../shared/mcp-setting-fields';
import { SettingsTargetError, type SettingsListTarget } from './settings-target-types';
import { hostText } from '../../shared/i18n';

const fail = (code = 'INVALID_ARGUMENT'): never => {
  throw new SettingsTargetError(
    code,
    hostText(
      code === 'LOCAL_ACTION_REQUIRED'
        ? 'services.settingsTargets.localAction'
        : 'services.settingsTargets.invalid',
    ),
  );
};
export const listOperationSchemas = {
  add: {
    type: 'object',
    properties: {
      kind: { const: 'add' },
      values: { type: 'object', maxProperties: 128 },
      beforeItemRef: { type: 'string' },
    },
    required: ['kind', 'values'],
    additionalProperties: false,
  },
  update: {
    type: 'object',
    properties: {
      kind: { const: 'update' },
      itemRef: { type: 'string' },
      changes: { type: 'object', minProperties: 1, maxProperties: 128 },
    },
    required: ['kind', 'itemRef', 'changes'],
    additionalProperties: false,
  },
  remove: {
    type: 'object',
    properties: { kind: { const: 'remove' }, itemRef: { type: 'string' } },
    required: ['kind', 'itemRef'],
    additionalProperties: false,
  },
  reorder: {
    type: 'object',
    properties: {
      kind: { const: 'reorder' },
      itemRefs: { type: 'array', uniqueItems: true, items: { type: 'string' } },
    },
    required: ['kind', 'itemRefs'],
    additionalProperties: false,
  },
};
export const settingsListOperationSchemas = (target: SettingsListTarget) => {
  const schemas = {
    ...listOperationSchemas,
    reorder: {
      ...listOperationSchemas.reorder,
      properties: {
        ...listOperationSchemas.reorder.properties,
        itemRefs: {
          ...listOperationSchemas.reorder.properties.itemRefs,
          ...(target.maxItems === undefined ? {} : { maxItems: target.maxItems }),
        },
      },
    },
  };
  return Object.fromEntries(
    Object.entries(schemas).filter(
      ([kind]) => !target.operations || target.operations.some((operation) => operation === kind),
    ),
  );
};
export function listValues(target: SettingsListTarget, row: Record<string, unknown>) {
  return Object.fromEntries(
    target.fields.flatMap((field) => {
      const value = mcpSettingValue(field, objectFieldValue(row, field));
      return value === undefined ? [] : [[field.key, structuredClone(value)]];
    }),
  );
}
export function listRemovable(target: SettingsListTarget, row: Record<string, unknown>) {
  return (
    (!target.operations || target.operations.includes('remove')) &&
    target.removable?.(row) !== false &&
    !(target.definition.fields ?? []).some(
      (field) =>
        (field.type === 'registered-image' ||
          !target.fields.some((publicField) => publicField.key === field.key)) &&
        objectFieldValue(row, field) != null,
    )
  );
}
export function planSettingsList(
  target: SettingsListTarget,
  rawOperations: unknown,
  refs: string[],
  revision: string,
) {
  const operations = Array.isArray(rawOperations) ? rawOperations : fail();
  if (!operations.length || operations.length > 32) fail();
  const before = target.rows(),
    rows = structuredClone(before),
    changes: Record<string, unknown>[] = [];
  const used: { index: number; field: SettingDefinition }[] = [];
  const refIndexes = new Map(refs.map((ref, index) => [ref, index]));
  const resolve = (ref: unknown) => {
    if (typeof ref !== 'string') return fail();
    const index = refIndexes.get(ref);
    if (index === undefined) return fail('REVISION_CONFLICT');
    return index;
  };
  const fields = target.fields;
  const fieldsByKey = new Map(fields.map((field) => [field.key, field]));
  const update = (row: Record<string, unknown>, raw: unknown) => {
    if (!jsonObject(raw) || Object.keys(raw).length > 128) return fail();
    const result: Record<string, unknown> = {};
    const previousRow = structuredClone(row);
    for (const [key, value] of Object.entries(raw)) {
      const field = fieldsByKey.get(key) ?? fail('NOT_FOUND');
      if (key === target.definition.list?.idKey) fail();
      try {
        if (target.validateField) target.validateField(field, value);
        else validateMcpSetting(field, value, target.options?.(field) ?? field.options);
      } catch {
        fail();
      }
      const previous = objectFieldValue(row, field);
      if (sameSetting(previous, value)) continue;
      if (target.itemWritable?.(row, field) === false) fail('LOCAL_ACTION_REQUIRED');
      setObjectField(row, field, structuredClone(value));
      for (const alias of field.aliases ?? []) delete row[alias];
    }
    target.prepareRow?.(row, Object.keys(raw));
    for (const key of Object.keys(raw)) {
      const field = fieldsByKey.get(key)!;
      const previous = mcpSettingValue(field, objectFieldValue(previousRow, field)),
        value = mcpSettingValue(field, objectFieldValue(row, field));
      if (!sameSetting(previous, value))
        result[key] = {
          ...(previous === undefined ? {} : { before: structuredClone(previous) }),
          ...(value === undefined ? {} : { value: structuredClone(value) }),
        };
    }
    return result;
  };
  for (const raw of operations) {
    if (!jsonObject(raw)) fail();
    const operation = raw as Record<string, unknown>;
    const kind = operation.kind as keyof typeof listOperationSchemas;
    const schema = settingsListOperationSchemas(target)[kind];
    if (
      !Object.hasOwn(listOperationSchemas, kind) ||
      !schema ||
      Object.keys(operation).some((key) => !Object.hasOwn(schema.properties, key)) ||
      schema.required.some((key) => !Object.hasOwn(operation, key))
    )
      fail();
    if (kind !== 'update' && operations.length !== 1) fail();
    if (kind === 'add') {
      if (
        (target.maxItems !== undefined && rows.length >= target.maxItems) ||
        !jsonObject(operation.values)
      )
        fail();
      const row: Record<string, unknown> =
        target.createRow?.(operation.values as Record<string, unknown>) ?? {};
      if (!target.createRow) {
        for (const field of target.definition.fields ?? [])
          if (field.default !== undefined)
            setObjectField(row, field, structuredClone(field.default));
        const id = target.definition.list?.idKey;
        if (id) row[id] = randomUUID();
      }
      update(row, operation.values);
      const position =
        operation.beforeItemRef === undefined ? rows.length : resolve(operation.beforeItemRef);
      rows.splice(position, 0, row);
      changes.push({ kind, values: listValues(target, row) });
    } else if (kind === 'update') {
      if (!jsonObject(operation.changes) || !Object.keys(operation.changes).length) fail();
      const index = resolve(operation.itemRef);
      for (const key of Object.keys(operation.changes as object)) {
        const field = fieldsByKey.get(key) ?? fail('NOT_FOUND');
        if (
          used.some(
            (previous) => previous.index === index && settingFieldsOverlap(previous.field, field),
          )
        )
          fail();
        used.push({ index, field });
      }
      const changed = update(rows[index], operation.changes);
      if (Object.keys(changed).length)
        changes.push({ kind, itemRef: operation.itemRef, changes: changed });
    } else if (kind === 'remove') {
      const index = resolve(operation.itemRef);
      if (!listRemovable(target, rows[index])) fail('LOCAL_ACTION_REQUIRED');
      changes.push({ kind, itemRef: operation.itemRef, before: listValues(target, rows[index]) });
      rows.splice(index, 1);
    } else {
      if (
        !Array.isArray(operation.itemRefs) ||
        (target.maxItems !== undefined && operation.itemRefs.length > target.maxItems) ||
        operation.itemRefs.length !== rows.length ||
        new Set(operation.itemRefs).size !== rows.length
      )
        fail();
      const reordered = (operation.itemRefs as unknown[]).map((ref) => rows[resolve(ref)]);
      rows.length = 0;
      for (const row of reordered) rows.push(row);
      if (!sameSetting(before, rows)) changes.push({ kind });
    }
  }
  // A legacy JSON-string list must not be rewritten solely to normalize its representation.
  if (sameSetting(before, rows))
    return { changed: false, changes: [], applies: {}, commit: () => {} };
  const plan = target.plan(rows, revision);
  return {
    changed: !!plan.changed.length,
    changes: plan.changed.length ? changes : [],
    applies: plan.changed.length
      ? { [target.definition.key]: target.applies(target.definition.key) }
      : {},
    commit: plan.commit,
  };
}

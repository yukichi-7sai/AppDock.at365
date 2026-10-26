import type { SettingsPageDefinition } from '../../shared/settings-catalog';
import { settingsItemId } from '../../shared/settings-catalog';
import { mcpSettingPublished } from '../../shared/mcp-setting-fields';
import type {
  SettingsMcpAccess,
  SettingsMcpFieldAccess,
  SettingsMcpItemAccess,
  SettingsMcpLockReason,
} from '../../shared/settings-mcp-access';
import type { SettingsTarget } from './settings-target-types';

/** Project the same owners as MCP without returning values or running an operation. */
export function settingsMcpAccess(
  page: SettingsPageDefinition,
  targets: SettingsTarget[],
  reason: SettingsMcpLockReason | null = null,
): SettingsMcpAccess {
  const items: SettingsMcpAccess['items'] = Object.create(null);
  const merge = (id: string, access: SettingsMcpItemAccess) => {
    const previous = items[id];
    items[id] = previous
      ? { ...previous, ...access, reason: previous.reason === null ? null : access.reason }
      : access;
  };
  for (const target of targets) {
    const roots = target.ui?.().filter((ref) => ref.pageId === page.id) ?? [];
    const fields = target.fields.flatMap((field) =>
      (target.ui?.(field) ?? [])
        .filter((ref) => ref.pageId === page.id)
        .map((ref) => ({ field, ref })),
    );
    if (!roots.length && !fields.length) continue;
    const fieldAccess = (field: (typeof target.fields)[number]): SettingsMcpFieldAccess => ({
      reason: !target.available
        ? 'unavailable'
        : !(
              target.writable?.(field) ??
              (target.kind !== 'list' || field.key !== target.definition.list?.idKey)
            )
          ? 'readOnly'
          : null,
    });
    const columns = Object.fromEntries(
      target.fields.map((field) => [field.key, fieldAccess(field)]),
    );
    const operations =
      target.kind === 'list' ? (target.operations ?? ['add', 'update', 'remove', 'reorder']) : [];
    const mutable =
      target.kind === 'list'
        ? operations.some(
            (operation) =>
              operation !== 'update' || target.fields.some((field) => !fieldAccess(field).reason),
          )
        : target.fields.some((field) => !fieldAccess(field).reason);
    const rootAccess: SettingsMcpItemAccess = {
      reason: !target.available ? 'unavailable' : mutable ? null : 'readOnly',
      fields: columns,
    };
    if (
      roots.length &&
      target.kind === 'list' &&
      target.itemWritable &&
      target.definition.list?.idKey
    ) {
      const idKey = target.definition.list.idKey;
      // Only public, declared row identities leave the owner; values and hidden columns never do.
      if (target.fields.some((field) => field.key === idKey))
        rootAccess.rows = Object.fromEntries(
          target.rows().flatMap((row) => {
            const id = row[idKey];
            return typeof id !== 'string'
              ? []
              : [
                  [
                    id,
                    Object.fromEntries(
                      target.fields.map((field) => [
                        field.key,
                        {
                          reason:
                            fieldAccess(field).reason ??
                            (!operations.includes('update') || !target.itemWritable!(row, field)
                              ? 'readOnly'
                              : null),
                        },
                      ]),
                    ),
                  ],
                ];
          }),
        );
    }
    for (const ref of roots) merge(settingsItemId(ref.pageId, ref.key), rootAccess);
    for (const { field, ref } of fields) {
      const id = settingsItemId(ref.pageId, ref.key);
      if (ref.fieldKey) {
        const current = items[id] ?? { reason: rootAccess.reason };
        current.fields = { ...current.fields, [ref.fieldKey]: fieldAccess(field) };
        merge(id, current);
      } else merge(id, fieldAccess(field));
    }
  }
  for (const item of page.items) {
    if (item.definition && !mcpSettingPublished(item.definition))
      items[item.id] = { reason: 'private' };
  }
  return { reason, items };
}

/** Legacy input APIs retain their existing configure schema as the source of supported keys. */
export function addConfigurationAccess(
  access: SettingsMcpAccess,
  pageId: string,
  schema?: Record<string, unknown>,
) {
  const object = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const operations = object(object(object(schema).properties).operations);
  const alternatives = object(operations.items).oneOf;
  if (!Array.isArray(alternatives)) return;
  const configure = alternatives.find(
    (entry) => object(object(object(entry).properties).kind).const === 'configure',
  );
  const properties = object(object(object(object(configure).properties).changes).properties);
  for (const key of Object.keys(properties)) {
    const id = settingsItemId(pageId, key);
    // A supported dedicated API is another valid MCP path for the same setting.
    access.items[id] = { reason: null };
    if (key === 'connections' && pageId === 'touchpad-gestures') {
      for (const gesture of Object.keys(object(object(properties[key]).properties)))
        access.items[settingsItemId(pageId, 'connection.' + gesture)] = { reason: null };
    }
  }
}

export function addBindingAccess(
  access: SettingsMcpAccess,
  pageId: string,
  schema?: Record<string, unknown>,
) {
  const object = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const alternatives = object(object(object(object(schema).properties).operations).items).oneOf;
  if (!Array.isArray(alternatives)) return;
  const update = alternatives.find(
    (entry) => object(object(object(entry).properties).kind).const === 'update',
  );
  const properties = object(object(object(object(update).properties).changes).properties);
  if (!Object.keys(properties).length) return;
  const id = settingsItemId(pageId, 'bindings');
  access.items[id] = {
    reason: null,
    fields: {
      ...access.items[id]?.fields,
      ...Object.fromEntries(Object.keys(properties).map((key) => [key, { reason: null }])),
    },
  };
}

/** Dedicated editors bind property identities to their owner's existing operation schemas. */
export function addOperationAccess(
  access: SettingsMcpAccess,
  pageId: string,
  key: string,
  schema?: Record<string, unknown>,
) {
  const fields: NonNullable<SettingsMcpItemAccess['fields']> = {};
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const record = node as Record<string, unknown>;
    if (record.properties && typeof record.properties === 'object')
      for (const name of Object.keys(record.properties))
        fields[name] = { reason: name === 'id' ? 'readOnly' : null };
    Object.values(record).forEach(visit);
  };
  visit(schema);
  if (Object.keys(fields).length)
    access.items[settingsItemId(pageId, key)] = { reason: null, fields };
}

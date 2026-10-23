import { hostText } from './i18n';
import type { ExtensionManifest, Settings, SettingDefinition, SettingOption } from './contracts';
import { readObjectList, objectFieldValue } from './object-list';
import { imageReference } from './registered-images';
const object = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
export function parseSettingOptions(value: unknown): SettingOption[] {
  if (
    !Array.isArray(value) ||
    value.length > 128 ||
    value.some(
      (o) =>
        !object(o) ||
        typeof o.label !== 'string' ||
        !o.label ||
        o.label.length > 160 ||
        typeof o.value !== 'string' ||
        !o.value ||
        o.value.length > 256,
    ) ||
    new Set(value.map((o) => o.value)).size !== value.length
  )
    throw new Error(hostText('settings.setting-definitions.options'));
  return value.map((o) => ({ label: o.label, value: o.value }));
}
export function validateSettingValue(definition: SettingDefinition, value: unknown) {
  const fail = () => {
    throw new Error(hostText('settings.setting-definitions.value', { title: definition.title }));
  };
  if (definition.type === 'boolean' && typeof value !== 'boolean') fail();
  if (
    definition.type === 'number' &&
    (typeof value !== 'number' ||
      !Number.isFinite(value) ||
      (definition.minimum !== undefined && value < definition.minimum) ||
      (definition.maximum !== undefined && value > definition.maximum))
  )
    fail();
  if (
    definition.type === 'string' &&
    (typeof value !== 'string' ||
      value.length > (definition.maxLength ?? 10000) ||
      value.trim().length < (definition.minLength ?? 0))
  )
    fail();
  if (definition.type === 'registered-image' && value !== null && !imageReference(value)) fail();
  if (
    definition.type === 'string-list' &&
    (!Array.isArray(value) ||
      value.length > 64 ||
      value.some((item) => typeof item !== 'string' || !item.trim() || item.length > 32767))
  )
    fail();
  if (definition.type === 'object-list') {
    let items: Record<string, unknown>[];
    try {
      items = readObjectList(value);
    } catch {
      fail();
      return;
    }
    if (definition.list?.idKey) {
      const ids = items.map((item) => item[definition.list!.idKey!]);
      if (
        ids.some((id) => typeof id !== 'string' || !id.trim() || id.length > 100) ||
        new Set(ids).size !== ids.length
      )
        fail();
    }
    for (const item of items)
      for (const field of definition.fields ?? []) {
        let fieldValue: unknown;
        try {
          fieldValue = objectFieldValue(item, field);
        } catch {
          fail();
          return;
        }
        if (fieldValue !== undefined) validateSettingValue(field, fieldValue);
      }
  }
  if (definition.type === 'json') {
    if (typeof value !== 'string' || value.length > 10000) {
      fail();
      return;
    }
    try {
      JSON.parse(value);
    } catch {
      fail();
    }
  }
  if (definition.type === 'shortcut-list') {
    if (!Array.isArray(value) || value.length > 32) {
      fail();
      return;
    }
    const ids = new Set<string>();
    for (const entry of value) {
      if (
        !object(entry) ||
        typeof entry.id !== 'string' ||
        !/^[a-z0-9][a-z0-9-]{0,39}$/.test(entry.id) ||
        ids.has(entry.id) ||
        typeof entry.title !== 'string' ||
        !entry.title.trim() ||
        entry.title.length > 100 ||
        typeof entry.keys !== 'string' ||
        !validSendKeys(entry.keys)
      ) {
        fail();
        return;
      }
      ids.add(entry.id);
    }
  }
  if (
    definition.type === 'select' &&
    (typeof value !== 'string' ||
      !value ||
      value.length > 256 ||
      (!definition.dynamic &&
        !definition.optionSource &&
        !definition.options?.some((o) => o.value === value)))
  )
    fail();
}
export function parseSettingDefinitions(
  value: unknown,
  depth = 0,
): SettingDefinition[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 128)
    throw new Error(hostText('settings.setting-definitions.definitions'));
  const keys = new Set<string>();
  return value.map((s) => {
    if (
      !object(s) ||
      typeof s.key !== 'string' ||
      !/^[a-zA-Z0-9._-]{1,100}$/.test(s.key) ||
      ['constructor', 'prototype', '__proto__'].includes(s.key) ||
      keys.has(s.key) ||
      typeof s.title !== 'string' ||
      !s.title ||
      s.title.length > 160 ||
      ![
        'boolean',
        'number',
        'string',
        'registered-image',
        'json',
        'select',
        'shortcut-list',
        'string-list',
        'object-list',
      ].includes(s.type) ||
      (s.description !== undefined &&
        (typeof s.description !== 'string' || s.description.length > 500))
    )
      throw new Error(hostText('settings.setting-definitions.definition'));
    keys.add(s.key);
    for (const key of ['minLength', 'maxLength'])
      if (
        s[key] !== undefined &&
        (s.type !== 'string' || !Number.isInteger(s[key]) || s[key] < 0 || s[key] > 10000)
      )
        throw Error(hostText('settings.setting-definitions.textLength'));
    if (s.minLength !== undefined && s.maxLength !== undefined && s.minLength > s.maxLength)
      throw Error(hostText('settings.setting-definitions.textLength'));
    if (
      (s.automation !== undefined && typeof s.automation !== 'boolean') ||
      ((s.automation === true || s.generateCommands !== undefined) &&
        (depth !== 0 ||
          !['boolean', 'number', 'string', 'select'].includes(s.type) ||
          s.dynamic === true)) ||
      (s.generateCommands !== undefined &&
        (s.type !== 'boolean' ||
          typeof s.default !== 'boolean' ||
          !Array.isArray(s.generateCommands) ||
          !s.generateCommands.length ||
          s.generateCommands.some(
            (v: unknown) => typeof v !== 'string' || !['on', 'off', 'toggle'].includes(v),
          ) ||
          new Set(s.generateCommands).size !== s.generateCommands.length))
    )
      throw new Error(hostText('settings.setting-definitions.external'));
    if (
      (s.type === 'object-list' && (depth > 0 || !Array.isArray(s.fields) || !s.fields.length)) ||
      (depth === 0 && s.type === 'string-list') ||
      (depth > 0 && ['object-list', 'shortcut-list', 'json'].includes(s.type)) ||
      (s.itemTitle !== undefined &&
        (typeof s.itemTitle !== 'string' || s.itemTitle.length > 100)) ||
      (s.format !== undefined && !['directory', 'url'].includes(s.format)) ||
      (s.format === 'url' && s.type !== 'string') ||
      (s.numericOptions !== undefined && typeof s.numericOptions !== 'boolean') ||
      (s.aliases !== undefined &&
        (!Array.isArray(s.aliases) ||
          s.aliases.length > 8 ||
          s.aliases.some(
            (alias: unknown) =>
              typeof alias !== 'string' ||
              !/^[A-Za-z0-9._-]{1,100}$/.test(alias) ||
              ['__proto__', 'prototype', 'constructor'].includes(alias),
          )))
    )
      throw new Error(hostText('settings.setting-definitions.objectFields'));
    for (const key of ['minimum', 'maximum', 'step'])
      if (s[key] !== undefined && (typeof s[key] !== 'number' || !Number.isFinite(s[key])))
        throw new Error(hostText('settings.setting-definitions.range', { title: s.title }));
    if (
      (s.minimum !== undefined && s.maximum !== undefined && s.minimum > s.maximum) ||
      (s.step !== undefined && s.step <= 0) ||
      (s.dynamic !== undefined && typeof s.dynamic !== 'boolean')
    )
      throw new Error(hostText('settings.setting-definitions.range', { title: s.title }));
    const definition = {
      ...s,
      ...(s.type === 'select' ? { options: parseSettingOptions(s.options) } : {}),
      ...(s.type === 'object-list' ? { fields: parseSettingDefinitions(s.fields, depth + 1) } : {}),
    } as SettingDefinition;
    const safeKey = (key: unknown) =>
      typeof key === 'string' &&
      /^[a-zA-Z0-9_-]{1,100}$/.test(key) &&
      !['__proto__', 'prototype', 'constructor'].includes(key);
    if (
      s.propertyPath !== undefined &&
      (depth !== 1 ||
        !Array.isArray(s.propertyPath) ||
        !s.propertyPath.length ||
        s.propertyPath.length > 3 ||
        !s.propertyPath.every(safeKey))
    )
      throw Error(hostText('settings.setting-definitions.fieldPath'));
    if (
      s.optionSource !== undefined &&
      (depth !== 1 || s.type !== 'select' || s.optionSource !== 'web-profiles')
    )
      throw Error(hostText('settings.setting-definitions.optionSource'));
    if (s.list !== undefined) {
      const list = s.list,
        fields = definition.fields ?? [];
      const has = (key: unknown, type?: string) =>
        fields.some((field) => field.key === key && (!type || field.type === type));
      if (
        s.type !== 'object-list' ||
        !object(list) ||
        !Array.isArray(list.columns) ||
        !list.columns.length ||
        list.columns.length > 4 ||
        !list.columns.every((key: unknown) => has(key)) ||
        new Set(list.columns).size !== list.columns.length ||
        !has(list.titleKey) ||
        !list.columns.includes(list.titleKey) ||
        (list.descriptionKey !== undefined && !has(list.descriptionKey)) ||
        (list.enabledKey !== undefined && !has(list.enabledKey, 'boolean')) ||
        (list.idKey !== undefined && !has(list.idKey, 'string')) ||
        (list.iconKey !== undefined && !safeKey(list.iconKey)) ||
        (list.imageKey !== undefined && !has(list.imageKey, 'registered-image')) ||
        (list.confirmDelete !== undefined && typeof list.confirmDelete !== 'boolean') ||
        (list.showIndex !== undefined && typeof list.showIndex !== 'boolean')
      )
        throw Error(hostText('settings.setting-definitions.listView'));
    }
    if (definition.default !== undefined) validateSettingValue(definition, definition.default);
    return definition;
  });
}

export function validSendKeys(value: string): boolean {
  const parts = value.split('+').map((part) => part.trim().toUpperCase());
  const key = parts.pop() ?? '';
  const modifiers = parts.map(
    (part) => ({ CONTROL: 'CTRL', WINDOWS: 'WIN', META: 'WIN' })[part] ?? part,
  );
  return (
    value.length <= 100 &&
    modifiers.every((part) => ['CTRL', 'ALT', 'SHIFT', 'WIN'].includes(part)) &&
    new Set(modifiers).size === modifiers.length &&
    /^(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4])|ENTER|TAB|ESC|ESCAPE|SPACE|BACKSPACE|DELETE|INSERT|HOME|END|PAGEUP|PAGEDOWN|LEFT|RIGHT|UP|DOWN)$/.test(
      key,
    )
  );
}
export function validateAppletSettings(value: Settings, applets: ExtensionManifest[]) {
  for (const applet of applets)
    for (const definition of applet.settings ?? []) {
      const saved = value.extensions[applet.id]?.settings[definition.key];
      if (saved !== undefined) validateSettingValue(definition, saved);
    }
}

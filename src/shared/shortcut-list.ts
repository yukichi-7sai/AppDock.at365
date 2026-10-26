import type { SettingDefinition } from './contracts';
import { hostText } from './i18n';

export const shortcutListLimit = 32;
export const shortcutListIdPattern = '^[a-z0-9][a-z0-9-]{0,39}$';
export interface ShortcutListEntry {
  id: string;
  title: string;
  keys: string;
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
export function validShortcutList(value: unknown): value is ShortcutListEntry[] {
  if (!Array.isArray(value) || value.length > shortcutListLimit) return false;
  const ids = new Set<string>();
  for (const entry of value) {
    if (
      !entry ||
      typeof entry !== 'object' ||
      Array.isArray(entry) ||
      typeof entry.id !== 'string' ||
      !new RegExp(shortcutListIdPattern).test(entry.id) ||
      ids.has(entry.id) ||
      typeof entry.title !== 'string' ||
      !entry.title.trim() ||
      entry.title.length > 100 ||
      typeof entry.keys !== 'string' ||
      !validSendKeys(entry.keys)
    )
      return false;
    ids.add(entry.id);
  }
  return true;
}
export function newShortcutListEntry(
  entries: readonly { id?: unknown }[],
  title = hostText('settings.shortcutListSetting.new'),
): ShortcutListEntry {
  let n = 1;
  while (entries.some((entry) => entry.id === `shortcut-${n}`)) n++;
  return { id: `shortcut-${n}`, title, keys: 'Ctrl+T' };
}
/** Projection only: the saved setting remains a shortcut-list with its existing validator. */
export function shortcutListDefinition(definition: SettingDefinition): SettingDefinition {
  return {
    ...definition,
    type: 'object-list',
    fields: [
      {
        key: 'id',
        title: hostText('settings.shortcutListSetting.identifier'),
        type: 'string',
        minLength: 1,
        maxLength: 40,
      },
      {
        key: 'title',
        title: hostText('settings.shortcutListSetting.name'),
        type: 'string',
        minLength: 1,
        maxLength: 100,
      },
      {
        key: 'keys',
        title: hostText('settings.shortcutListSetting.keys'),
        type: 'string',
        minLength: 1,
        maxLength: 100,
      },
    ],
    // IDs are intentionally editable, as in the native editor. itemRef binds the read revision.
    list: { columns: ['title', 'keys'], titleKey: 'title' },
  };
}

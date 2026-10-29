import { hostText } from './i18n';
import type { SettingAction, SettingDefinition, SettingSection } from './contracts';

/** Validate references once at the manifest boundary; sections never own settings data. */
export function parseSettingSections(
  value: unknown,
  settings: SettingDefinition[],
  actions: SettingAction[],
): SettingSection[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 32)
    throw Error(hostText('settings.setting-sections.limit'));
  const ids = new Set<string>(),
    usedSettings = new Set<string>(),
    usedActions = new Set<string>();
  const references = (raw: unknown, available: string[], used: Set<string>) => {
    if (raw === undefined) return undefined;
    if (!Array.isArray(raw) || raw.length > available.length)
      throw Error(hostText('settings.setting-sections.reference'));
    return raw.map((key: unknown) => {
      if (typeof key !== 'string' || !available.includes(key) || used.has(key))
        throw Error(hostText('settings.setting-sections.duplicate'));
      used.add(key);
      return key;
    });
  };
  return value.map((section) => {
    if (
      !section ||
      typeof section !== 'object' ||
      Array.isArray(section) ||
      typeof section.id !== 'string' ||
      !/^[a-z][a-z0-9-]{0,63}$/.test(section.id) ||
      ids.has(section.id) ||
      typeof section.title !== 'string' ||
      !section.title.trim() ||
      section.title.length > 160 ||
      (section.description !== undefined &&
        (typeof section.description !== 'string' || section.description.length > 500)) ||
      (section.collapsible !== undefined && typeof section.collapsible !== 'boolean')
    )
      throw Error(hostText('settings.setting-sections.heading'));
    ids.add(section.id);
    const fields = references(
      section.settings,
      settings.map((s) => s.key),
      usedSettings,
    );
    const buttons = references(
      section.actions,
      actions.filter((a) => a.settingKey === undefined).map((a) => a.command),
      usedActions,
    );
    if (!fields?.length && !buttons?.length)
      throw Error(hostText('settings.setting-sections.empty'));
    return {
      id: section.id,
      title: section.title,
      description: section.description,
      settings: fields,
      actions: buttons,
      collapsible: section.collapsible,
    };
  });
}

/** Unassigned fields remain visible, including when an Applet later adds a setting. */
export function resolveSettingSections(
  definitions: SettingDefinition[],
  actions: SettingAction[],
  sections: SettingSection[] = [],
) {
  const standalone = actions.filter((a) => a.settingKey === undefined);
  const usedSettings = new Set(sections.flatMap((s) => s.settings ?? []));
  const usedActions = new Set(sections.flatMap((s) => s.actions ?? []));
  const result = sections.map((section) => ({
    ...section,
    settings: (section.settings ?? []).flatMap((key) => definitions.filter((s) => s.key === key)),
    actions: (section.actions ?? []).flatMap((key) => standalone.filter((a) => a.command === key)),
  }));
  const rest = definitions.filter((s) => !usedSettings.has(s.key));
  const remainingActions = standalone.filter((a) => !usedActions.has(a.command));
  if (rest.length)
    result.push({
      id: '$settings',
      title: sections.length
        ? hostText('settings.setting-sections.other')
        : hostText('settings.setting-sections.settings'),
      settings: rest,
      actions: [],
    });
  if (remainingActions.length)
    result.push({
      id: '$actions',
      title: hostText('settings.setting-sections.actions'),
      settings: [],
      actions: remainingActions,
    });
  return result;
}

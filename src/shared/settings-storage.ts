import type { ExtensionManifest, ExtensionSettings, Settings } from './contracts';
import { createDefaultSettings } from './settings-schema';
import { defaultKeybindings } from './keybindings';
import { fillSettingDefaults, omitSettingDefaults, settingsObject } from './settings-defaults';
import { customCommandVersion } from './custom-commands';

export function appletConfigurationDefaults(applet?: ExtensionManifest) {
  return {
    settings: Object.fromEntries(
      (applet?.settings ?? [])
        .filter((field) => field.default !== undefined)
        .map((field) => [field.key, field.default]),
    ),
    startupDelaySeconds: applet?.startupDelaySeconds ?? 0,
    pages: Object.fromEntries(
      (applet?.pages ?? []).map((page) => [page.id, { display: page.defaultDisplay ?? 'page' }]),
    ),
  };
}

export function compactAppletConfiguration<
  T extends Pick<ExtensionSettings, 'settings' | 'pages' | 'startupDelaySeconds'>,
>(value: T, applet?: ExtensionManifest): T {
  if (!applet) return structuredClone(value);
  const result = omitSettingDefaults(value, appletConfigurationDefaults(applet)) ?? {};
  // A configuration's presence isolates it from the shared file, even when all fields use defaults.
  result.settings ??= {};
  for (const collection of applet.pageCollections ?? []) {
    const rows = result.settings[collection.key];
    if (Array.isArray(rows)) {
      const defaults = collectionFieldDefaults(applet, collection);
      result.settings[collection.key] = rows.map((row) =>
        settingsObject(row) ? (omitSettingDefaults(row, defaults) ?? {}) : row,
      );
    }
  }
  return result;
}

function collectionFieldDefaults(
  applet: ExtensionManifest,
  collection: NonNullable<ExtensionManifest['pageCollections']>[number],
) {
  const fields = applet.settings?.find((field) => field.key === collection.key)?.fields ?? [];
  const defaults = Object.fromEntries(
    fields
      .filter((field) => field.default !== undefined && !field.propertyPath)
      .map((field) => [field.key, field.default]),
  );
  for (const field of collection.fields)
    if (field.default !== undefined && !field.propertyPath) defaults[field.key] = field.default;
  // Registration identity is never defaulted away, even for a malformed declaration.
  delete defaults.id;
  return defaults;
}

export function restoreAppletConfiguration<
  T extends Pick<ExtensionSettings, 'settings' | 'pages' | 'startupDelaySeconds'>,
>(value: T, applet?: ExtensionManifest): T {
  const result = structuredClone(value);
  if (!applet) return result;
  for (const collection of applet.pageCollections ?? []) {
    const rows =
      result.settings[collection.key] === undefined
        ? applet.settings?.find((field) => field.key === collection.key)?.default
        : result.settings[collection.key];
    if (Array.isArray(rows))
      result.settings[collection.key] = rows.map((row) =>
        settingsObject(row)
          ? fillSettingDefaults(row, collectionFieldDefaults(applet, collection))
          : row,
      );
  }
  return result;
}

export function restoreSettingsCollections(value: Settings, applets: ExtensionManifest[]) {
  const result = structuredClone(value);
  for (const [id, entry] of Object.entries(result.extensions))
    result.extensions[id] = restoreAppletConfiguration(
      entry,
      applets.find((applet) => applet.id === id),
    );
  return result;
}

export function settingsStorageDefaults(): Settings {
  return {
    ...createDefaultSettings(),
    keybindings: defaultKeybindings(),
    notificationPreferences: { overrides: [] },
    mcpServers: { version: 1, items: [] },
    customCommands: { version: customCommandVersion, items: [] },
    imageLibrary: { groups: [] },
  };
}

export function settingsStorageValue(
  value: Settings,
  applets: ExtensionManifest[] = [],
): Record<string, unknown> {
  const defaults = settingsStorageDefaults();
  const result = omitSettingDefaults(value, defaults) ?? {};
  for (const key of ['customCommands', 'mcpServers'] as const)
    if (result[key]) result[key].version = value[key]!.version;
  result.schemaVersion = 1;
  // Keep compatibility metadata and the identity of known/unknown Applets.
  result.extensions = structuredClone(value.extensions);
  for (const [id, entry] of Object.entries(value.extensions)) {
    const applet = applets.find((a) => a.id === id);
    result.extensions[id] = compactAppletConfiguration(entry, applet);
    if (applet?.updateRepository && entry.updateSource === `github:${applet.updateRepository}`)
      delete result.extensions[id].updateSource;
  }
  return result;
}

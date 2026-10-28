import { hostText } from './i18n';
import type {
  ExtensionManifest,
  ExtensionSnapshot,
  Settings,
  SettingDefinition,
} from './contracts';
import { validPageId } from './applet-pages';
import { imageReference, type RegisteredImageRef } from './registered-images';
import { parseSettingDefinitions } from './setting-definitions';
import { webUrl, profileId } from './web-content';

export interface PageCollectionDefinition {
  key: string;
  source: 'local' | 'remote';
  ui?: string;
  fields: SettingDefinition[];
  managementCommand?: string;
  shortcutDefaultsKey?: string;
  automation?: ('open' | 'back' | 'forward' | 'reload' | 'home')[];
}
export interface CollectionBinding {
  owner: string;
  key: string;
  itemId: string;
}
export interface CollectionRecord {
  id: string;
  name: string;
  enabled: boolean;
  display: 'page' | 'window';
  url?: string;
  accountId?: string;
  navigation?: 'none' | 'same-origin' | 'any';
  allowedOrigins?: string[];
  icon?: string;
  image?: RegisteredImageRef | null;
  [key: string]: unknown;
}
export interface CollectionPage {
  id: string;
  binding: CollectionBinding;
  definition: PageCollectionDefinition;
  item: CollectionRecord;
  parent: ExtensionSnapshot;
}

export function parsePageCollections(manifest: ExtensionManifest): PageCollectionDefinition[] {
  const value = manifest.pageCollections;
  if (value === undefined) return [];
  if (
    !manifest.capabilities?.includes('pages') ||
    !manifest.capabilities.includes('dynamic-pages') ||
    !Array.isArray(value) ||
    value.length > 4
  )
    throw Error(hostText('services.sharedPageCollections.invalidDeclaration'));
  const keys = new Set<string>();
  return value.map((raw) => {
    if (
      !raw ||
      !validPageId(raw.key) ||
      keys.has(raw.key) ||
      !['local', 'remote'].includes(raw.source) ||
      !manifest.settings?.some(
        (setting) => setting.key === raw.key && setting.type === 'object-list',
      ) ||
      (raw.source === 'remote' && !manifest.capabilities?.includes('web-profiles')) ||
      (raw.source === 'local' && (typeof raw.ui !== 'string' || !/\.html$/i.test(raw.ui))) ||
      (raw.shortcutDefaultsKey !== undefined &&
        !manifest.settings?.some(
          (setting) => setting.key === raw.shortcutDefaultsKey && setting.type === 'object-list',
        )) ||
      (raw.automation !== undefined &&
        (!Array.isArray(raw.automation) ||
          new Set(raw.automation).size !== raw.automation.length ||
          raw.automation.some(
            (action) =>
              !(
                raw.source === 'remote' ? ['open', 'back', 'forward', 'reload', 'home'] : ['open']
              ).includes(action),
          ))) ||
      (raw.managementCommand !== undefined &&
        !manifest.commands?.some((command) => command.id === raw.managementCommand))
    )
      throw Error(hostText('services.sharedPageCollections.settingRequired'));
    keys.add(raw.key);
    return { ...raw, fields: parseSettingDefinitions(raw.fields) ?? [] };
  });
}

export function collectionRecord(settings: Settings, binding: CollectionBinding): CollectionRecord {
  const rows = settings.extensions[binding.owner]?.settings[binding.key];
  const item = Array.isArray(rows) && rows.find((row) => row?.id === binding.itemId);
  if (!item) throw Error(hostText('services.sharedPageCollections.settingMissing'));
  return item;
}
export function collectionIdentity(settings: Settings, owner: string, key: string, id: string) {
  const legacy = settings.migrations?.webApplet;
  return legacy?.owner === owner && key === 'items' && legacy.ids.includes(id)
    ? id
    : `${owner}.${key}.${id}`;
}
export function validateCollectionRecords(
  definition: PageCollectionDefinition,
  value: unknown,
): CollectionRecord[] {
  if (!Array.isArray(value)) throw Error(hostText('services.sharedPageCollections.countLimit'));
  const ids = new Set<string>();
  return value.map((item) => {
    if (
      !item ||
      typeof item !== 'object' ||
      !validPageId(item.id) ||
      ids.has(item.id) ||
      typeof item.name !== 'string' ||
      !item.name.trim() ||
      item.name.length > 80 ||
      /[\x00-\x1f\x7f]/.test(item.name) ||
      typeof item.enabled !== 'boolean' ||
      !['page', 'window'].includes(item.display)
    )
      throw Error(hostText('services.sharedPageCollections.invalidPage'));
    if (definition.source === 'remote') {
      webUrl(item.url);
      if (
        !profileId(item.accountId) ||
        !['none', 'same-origin', 'any'].includes(item.navigation) ||
        !Array.isArray(item.allowedOrigins)
      )
        throw Error(hostText('services.sharedPageCollections.invalidNavigation'));
      for (const origin of item.allowedOrigins)
        if (typeof origin !== 'string' || new URL(webUrl(origin)).origin !== origin)
          throw Error(hostText('services.sharedPageCollections.invalidOrigin'));
    }
    if (
      item.icon !== undefined &&
      item.icon !== '' &&
      (typeof item.icon !== 'string' ||
        !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(item.icon) ||
        item.icon.length > 24576)
    )
      throw Error(hostText('services.sharedPageCollections.invalidIcon'));
    if (item.image != null && !imageReference(item.image))
      throw Error(hostText('services.sharedPageCollections.invalidImage'));
    ids.add(item.id);
    return structuredClone(item);
  });
}

export function collectionPages(
  settings: Settings,
  parents: ExtensionSnapshot[],
): CollectionPage[] {
  const ids = new Set(parents.map((parent) => parent.id));
  return parents.flatMap((parent) => {
    return (parent.pageCollections ?? []).flatMap((definition) => {
      const rows = settings.extensions[parent.id]?.settings[definition.key] ?? [];
      return validateCollectionRecords(definition, rows).map((item) => {
        const id = collectionIdentity(settings, parent.id, definition.key, item.id);
        if (id.length > 100 || ids.has(id))
          throw Error(hostText('services.sharedPageCollections.invalidIds'));
        ids.add(id);
        return {
          id,
          binding: { owner: parent.id, key: definition.key, itemId: item.id },
          definition,
          item,
          parent,
        };
      });
    });
  });
}

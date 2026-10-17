import fs from 'node:fs';
import path from 'node:path';
import type { ExtensionManifest, ExtensionSettings, Settings } from '../../shared/contracts';
import { createDefaultSettings, parseSettings } from '../../shared/settings-schema';
import {
  parsePageCollections,
  validateCollectionRecords,
  type PageCollectionDefinition,
} from '../../shared/page-collections';

export const deviceHostKeys = [
  'theme',
  'shellProviders',
  'soundEnabled',
  'closeToTray',
  'startMinimized',
  'startAtLogon',
  'runAsAdministrator',
  'hardwareAcceleration',
] as const;
export type DeviceConfiguration = Pick<
  ExtensionSettings,
  'settings' | 'startupDelaySeconds' | 'pages'
>;
export interface DeviceSettings {
  schemaVersion: 1;
  machineName: string;
  host: Pick<Settings['host'], (typeof deviceHostKeys)[number]>;
  extensions: Record<
    string,
    { enabled: boolean; useLocalSettings: boolean; configuration?: DeviceConfiguration }
  >;
  collectionEnabled: Record<string, Record<string, Record<string, boolean>>>;
}
export interface DeviceCollection {
  owner: string;
  definition: PageCollectionDefinition;
}
const object = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const id = (value: string) =>
  /^[a-z0-9][a-z0-9.-]{0,100}$/.test(value) &&
  !['__proto__', 'constructor', 'prototype'].includes(value);
export function deviceName(name: string) {
  if (
    !name ||
    name.length > 255 ||
    /[<>:"/\\|?*\x00-\x1f\x7f]/.test(name) ||
    /[ .]$/.test(name) ||
    name === '.' ||
    name === '..'
  )
    throw Error('端末名を設定ファイル名に使用できません。');
  return name;
}
function safeJson(value: unknown, depth = 0, budget = { count: 0 }) {
  if (++budget.count > 100000 || depth > 40) throw Error('設定の深さ・件数の上限を超えています。');
  if (value && typeof value === 'object')
    for (const [key, child] of Object.entries(value)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key))
        throw Error('設定キーが不正です。');
      safeJson(child, depth + 1, budget);
    }
}
export function configuration(settings: Settings, owner: string): DeviceConfiguration {
  const entry = settings.extensions[owner];
  return structuredClone({
    settings: entry?.settings ?? {},
    ...(entry?.startupDelaySeconds !== undefined
      ? { startupDelaySeconds: entry.startupDelaySeconds }
      : {}),
    ...(entry?.pages !== undefined ? { pages: entry.pages } : {}),
  });
}
export function initialDeviceSettings(
  name: string,
  shared = createDefaultSettings(),
  collections: DeviceCollection[] = [],
): DeviceSettings {
  const value: DeviceSettings = {
    schemaVersion: 1,
    machineName: deviceName(name),
    host: Object.fromEntries(
      deviceHostKeys.map((key) => [key, structuredClone(shared.host[key] ?? {})]),
    ) as DeviceSettings['host'],
    extensions: {},
    collectionEnabled: {},
  };
  for (const [owner, entry] of Object.entries(shared.extensions))
    value.extensions[owner] = { enabled: entry.enabled, useLocalSettings: false };
  for (const { owner, definition } of collections) {
    let rows;
    try {
      rows = validateCollectionRecords(
        definition,
        shared.extensions[owner]?.settings[definition.key] ?? [],
      );
    } catch {
      continue;
    } // Discovery reports invalid lists; migration never activates their children.
    const states = ((value.collectionEnabled[owner] ??= {})[definition.key] ??= {});
    for (const row of rows) states[row.id] = row.enabled;
  }
  return value;
}
export function parseDeviceSettings(raw: unknown, name: string): DeviceSettings {
  if (
    !object(raw) ||
    raw.schemaVersion !== 1 ||
    typeof raw.machineName !== 'string' ||
    raw.machineName.toLowerCase() !== deviceName(name).toLowerCase() ||
    !object(raw.host) ||
    !object(raw.extensions) ||
    !object(raw.collectionEnabled) ||
    Object.keys(raw).some(
      (key) =>
        !['schemaVersion', 'machineName', 'host', 'extensions', 'collectionEnabled'].includes(key),
    )
  )
    throw Error('このPCの設定JSONの形式を確認してください。');
  safeJson(raw);
  if (
    Object.keys(raw.host).some((key) => !(deviceHostKeys as readonly string[]).includes(key)) ||
    deviceHostKeys.some((key) => raw.host[key] === undefined)
  )
    throw Error('このPCの表示・一般設定を確認してください。');
  const probe = createDefaultSettings();
  probe.host = { ...probe.host, ...raw.host };
  for (const [owner, entry] of Object.entries(raw.extensions)) {
    if (
      !id(owner) ||
      !object(entry) ||
      typeof entry.enabled !== 'boolean' ||
      typeof entry.useLocalSettings !== 'boolean' ||
      Object.keys(entry).some(
        (key) => !['enabled', 'useLocalSettings', 'configuration'].includes(key),
      ) ||
      (entry.useLocalSettings && !object(entry.configuration))
    )
      throw Error('Appletの端末設定を確認してください。');
    if (entry.configuration !== undefined) {
      if (
        !object(entry.configuration) ||
        Object.keys(entry.configuration).some(
          (key) => !['settings', 'startupDelaySeconds', 'pages'].includes(key),
        )
      )
        throw Error('Applet設定の保存範囲が不正です。');
      probe.extensions[owner] = {
        ...entry.configuration,
        enabled: entry.enabled,
      } as ExtensionSettings;
    }
  }
  parseSettings(probe);
  for (const [owner, groups] of Object.entries(raw.collectionEnabled)) {
    if (!id(owner) || !object(groups)) throw Error('ページの端末設定が不正です。');
    for (const [key, rows] of Object.entries(groups)) {
      if (!id(key) || !object(rows)) throw Error('ページ一覧の端末設定が不正です。');
      for (const [item, enabled] of Object.entries(rows))
        if (!id(item) || typeof enabled !== 'boolean') throw Error('ページの有効状態が不正です。');
    }
  }
  return structuredClone(raw) as DeviceSettings;
}
export function readDeviceCollections(roots: string[]): DeviceCollection[] {
  const result: DeviceCollection[] = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const directory of fs.readdirSync(root, { withFileTypes: true })) {
      if (!directory.isDirectory()) continue;
      try {
        const file = path.join(root, directory.name, 'extension.json');
        if (fs.statSync(file).size > 1024 * 1024) continue;
        const manifest = JSON.parse(fs.readFileSync(file, 'utf8')) as ExtensionManifest;
        if (!id(manifest.id)) continue;
        for (const definition of parsePageCollections(manifest))
          if (
            !result.some(
              (item) => item.owner === manifest.id && item.definition.key === definition.key,
            )
          )
            result.push({ owner: manifest.id, definition });
      } catch {
        /* Invalid or unavailable manifests are diagnosed by discovery, never executed here. */
      }
    }
  }
  return result;
}
export function combineSettings(
  shared: Settings,
  device: DeviceSettings,
  collections: DeviceCollection[],
): Settings {
  const result = structuredClone(shared);
  Object.assign(result.host, structuredClone(device.host));
  for (const owner of new Set([
    ...Object.keys(shared.extensions),
    ...Object.keys(device.extensions),
  ])) {
    const local = device.extensions[owner];
    if (!result.extensions[owner] && !local?.useLocalSettings) continue;
    const entry = (result.extensions[owner] ??= { enabled: false, settings: {} });
    entry.enabled = local?.enabled ?? false;
    if (owner === 'appdock.default-shell') entry.enabled = true;
    if (local?.useLocalSettings) {
      delete entry.startupDelaySeconds;
      delete entry.pages;
      Object.assign(entry, structuredClone(local.configuration));
    }
  }
  for (const { owner, definition } of collections) {
    const rows = result.extensions[owner]?.settings[definition.key];
    if (!Array.isArray(rows)) continue;
    for (const row of rows)
      if (object(row) && typeof row.id === 'string')
        row.enabled = device.collectionEnabled[owner]?.[definition.key]?.[row.id] ?? false;
  }
  return parseSettings(result);
}
/** Route only edited fields, retaining the original shared values hidden by local overrides. */
export function splitSettings(
  next: Settings,
  before: Settings,
  originalShared: Settings,
  originalDevice: DeviceSettings,
  collections: DeviceCollection[],
) {
  const shared = structuredClone(originalShared),
    device = structuredClone(originalDevice);
  const copyChanges = (
    target: Record<string, any>,
    previous: Record<string, any>,
    after: Record<string, any>,
    skip: string[],
  ) => {
    for (const key of new Set([...Object.keys(previous), ...Object.keys(after)]))
      if (!skip.includes(key) && !equal(previous[key], after[key])) {
        if (after[key] === undefined) delete target[key];
        else target[key] = structuredClone(after[key]);
      }
  };
  copyChanges(shared, before, next, ['host', 'extensions']);
  copyChanges(shared.host, before.host, next.host, [...deviceHostKeys]);
  for (const key of deviceHostKeys)
    if (!equal(before.host[key], next.host[key]))
      (device.host as any)[key] = structuredClone(next.host[key]);
  for (const owner of new Set([
    ...Object.keys(before.extensions),
    ...Object.keys(next.extensions),
  ])) {
    const after = next.extensions[owner],
      previous = before.extensions[owner];
    if (equal(after, previous)) continue;
    if (!after) {
      delete shared.extensions[owner];
      continue;
    }
    const local = (device.extensions[owner] ??= { enabled: false, useLocalSettings: false });
    if (after.enabled !== previous?.enabled) local.enabled = after.enabled;
    const stored = (shared.extensions[owner] ??= { enabled: false, settings: {} });
    copyChanges(stored, previous ?? {}, after, [
      'enabled',
      'settings',
      'pages',
      'startupDelaySeconds',
    ]);
    const changedConfiguration = !equal(configuration(next, owner), configuration(before, owner));
    if (!changedConfiguration) continue;
    const candidate = configuration(next, owner);
    const raw = local.useLocalSettings ? local.configuration : configuration(originalShared, owner);
    for (const { owner: collectionOwner, definition } of collections) {
      if (owner !== collectionOwner) continue;
      const rows = candidate.settings[definition.key];
      if (!Array.isArray(rows)) continue;
      const oldRows = raw?.settings[definition.key];
      const beforeRows = previous?.settings[definition.key];
      const states = ((device.collectionEnabled[owner] ??= {})[definition.key] ??= {});
      for (const row of rows) {
        if (!object(row) || typeof row.id !== 'string') continue;
        const old = Array.isArray(oldRows)
          ? oldRows.find((item) => item?.id === row.id)
          : undefined;
        const effective = Array.isArray(beforeRows)
          ? beforeRows.find((item) => item?.id === row.id)
          : undefined;
        if (!effective || row.enabled !== effective.enabled) states[row.id] = row.enabled;
        row.enabled = old?.enabled ?? false;
      }
    }
    if (local.useLocalSettings) local.configuration = candidate;
    else {
      stored.settings = candidate.settings;
      for (const key of ['pages', 'startupDelaySeconds'] as const) {
        delete stored[key];
        if (candidate[key] !== undefined) (stored as any)[key] = candidate[key];
      }
    }
  }
  return {
    shared: parseSettings(shared),
    device: parseDeviceSettings(device, originalDevice.machineName),
  };
}

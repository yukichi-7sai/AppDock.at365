import fs from 'node:fs';
import path from 'node:path';
import type { ExtensionManifest } from '../../shared/contracts';
import { effectiveHostLanguage } from '../../shared/host-language';
import { hostText } from '../../shared/i18n';
import { compareVersions } from '../../shared/versions';
import { translationDirectory, hostResources } from './host-translation-source';
import {
  appletTranslationKey,
  translationPlaceholders,
  type AppletLocalizationSnapshot,
} from '../../shared/applet-localization';

type Dictionary = Record<string, string>;
const states = new WeakMap<ExtensionManifest, AppletTranslations>();
const localizedFields = new WeakMap<object, Set<string>>();
const object = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const failure = () => Error(hostText('services.appletLocalization.invalid'));
export function canonicalAppletLanguage(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(value)) return false;
  try {
    return Intl.getCanonicalLocales(value)[0] === value;
  } catch {
    return false;
  }
}
function safeFile(root: string, relative: string) {
  let file = root;
  for (const part of ['', ...relative.split('/')]) {
    file = path.join(file, part);
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) throw failure();
  }
  if (!fs.lstatSync(file).isFile()) throw failure();
  return file;
}
function read(root: string, relative: string): Record<string, unknown> {
  const value: unknown = JSON.parse(
    fs.readFileSync(safeFile(root, relative), 'utf8').replace(/^\uFEFF/, ''),
  );
  if (!object(value)) throw failure();
  return value;
}
function optional(root: string, relative: string, base: Dictionary): Dictionary {
  try {
    return Object.fromEntries(
      Object.entries(read(root, relative)).filter(
        ([key, value]) =>
          Object.hasOwn(base, key) &&
          typeof value === 'string' &&
          value.trim() &&
          translationPlaceholders(value) === translationPlaceholders(base[key]),
      ),
    ) as Dictionary;
  } catch {
    return {};
  }
}

export class AppletTranslations {
  readonly base: Dictionary;
  private readonly externalBase: Dictionary;
  private readonly bundled = new Map<string, Dictionary>();
  private readonly external = new Map<string, Dictionary>();
  private readonly snapshots = new Map<string, AppletLocalizationSnapshot>();
  constructor(
    readonly folder: string,
    readonly id: string,
    readonly defaultLanguage: string,
    externalRoot = translationDirectory,
  ) {
    if (!/^[a-z0-9][a-z0-9.-]{0,100}$/.test(id) || !canonicalAppletLanguage(defaultLanguage))
      throw failure();
    try {
      const base = read(folder, 'resources/translations/applet.json');
      if (
        Object.entries(base).some(
          ([key, value]) =>
            !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(key) || typeof value !== 'string' || !value.trim(),
        )
      )
        throw failure();
      this.base = base as Dictionary;
    } catch {
      throw failure();
    }
    this.externalBase = optional(externalRoot, `applets/${id}/applet.json`, this.base);
    // Read only host-supported languages. Applet packs never create host language choices.
    for (const code of Object.keys(hostResources)) {
      if (code === defaultLanguage) continue;
      this.bundled.set(
        code,
        optional(folder, `resources/translations/applet_${code}.json`, this.base),
      );
      this.external.set(
        code,
        optional(externalRoot, `applets/${id}/applet_${code}.json`, this.base),
      );
    }
  }
  resolve(key: string, language: string, accept: (value: string) => boolean = () => true): string {
    for (const dictionary of [
      this.external.get(language),
      this.bundled.get(language),
      this.externalBase,
      this.base,
    ]) {
      if (dictionary && Object.hasOwn(dictionary, key) && accept(dictionary[key]))
        return dictionary[key];
    }
    return key;
  }
  snapshot(language = effectiveHostLanguage()): AppletLocalizationSnapshot {
    let snapshot = this.snapshots.get(language);
    if (!snapshot) {
      snapshot = {
        language,
        defaultLanguage: this.defaultLanguage,
        messages: Object.fromEntries(
          Object.keys(this.base).map((key) => [key, this.resolve(key, language)]),
        ),
      };
      this.snapshots.set(language, snapshot);
    }
    return structuredClone(snapshot);
  }
  bind(manifest: ExtensionManifest) {
    const text = (node: any, fields: Record<string, number>, singleLine = false) => {
      if (!object(node)) return;
      for (const [field, limit] of Object.entries(fields)) {
        const key = appletTranslationKey(node[field]);
        if (!key) continue;
        const accept = (value: string) =>
          value.length <= limit &&
          !(
            singleLine || !['description', 'successMessage'].includes(field)
              ? /[\x00-\x1f\x7f]/
              : /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/
          ).test(value);
        if (!Object.hasOwn(this.base, key) || !accept(this.base[key])) throw failure();
        const fields = localizedFields.get(node) ?? new Set<string>();
        fields.add(field);
        localizedFields.set(node, fields);
        Object.defineProperty(node, field, {
          enumerable: true,
          configurable: true,
          get: () => this.resolve(key, effectiveHostLanguage(), accept),
        });
      }
    };
    const settings = (nodes: any) => {
      if (!Array.isArray(nodes)) return;
      for (const node of nodes) {
        text(node, { title: 160, description: 500, itemTitle: 100 });
        for (const option of node.options ?? []) text(option, { label: 160 });
        text(node.list?.draftAction, { title: 160 });
        settings(node.fields);
      }
    };
    text(manifest, { displayName: 100, description: Infinity, tagline: Infinity });
    settings(manifest.settings);
    for (const node of manifest.settingSections ?? []) text(node, { title: 160, description: 500 });
    for (const node of manifest.settingActions ?? [])
      text(node, { title: 160, description: 1000, successMessage: 500 });
    for (const node of manifest.commands ?? [])
      text(node, { title: 200, description: 1000, category: 100 });
    for (const node of manifest.pages ?? []) text(node, { title: 80 });
    for (const node of manifest.ribbonItems ?? []) text(node, { title: 80 });
    for (const node of manifest.notificationTypes ?? [])
      text(node, { title: 100, description: 1000 });
    for (const node of manifest.customCommandTypes ?? []) {
      text(node, { title: 100, description: 2000 }, true);
      for (const field of node.fields ?? []) {
        text(field, { title: 100 });
        for (const option of field.options ?? []) text(option, { label: 100 });
      }
    }
    for (const node of manifest.pageCollections ?? []) settings(node.fields);
    states.set(manifest, this);
    return manifest;
  }
}
export function loadAppletTranslations(
  manifest: ExtensionManifest,
  folder: string,
  externalRoot?: string,
) {
  if (manifest.localization === undefined) return undefined;
  if (
    !object(manifest.localization) ||
    Object.keys(manifest.localization).some((key) => key !== 'defaultLanguage') ||
    !canonicalAppletLanguage(manifest.localization.defaultLanguage) ||
    !manifest.minimumHostVersion ||
    compareVersions(manifest.minimumHostVersion, '0.159.0') < 0
  )
    throw failure();
  return new AppletTranslations(
    folder,
    manifest.id,
    manifest.localization.defaultLanguage,
    externalRoot,
  );
}
export const appletTranslations = (manifest: ExtensionManifest) => states.get(manifest);
export const isLocalizedField = (node: object, field: string) =>
  localizedFields.get(node)?.has(field) ?? false;

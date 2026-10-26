import { hostText } from '../../shared/i18n';
import { isSettingAccessible, type SettingsCaller } from '../../shared/setting-access';
import { randomUUID } from 'node:crypto';
import { appletEnabled, defaultAppletEnabled } from '../../shared/applet-state';
import { readObjectList } from '../../shared/object-list';
import type {
  ExtensionSnapshot,
  Settings,
  SettingsSnapshot,
  SettingDefinition,
  SettingOption,
} from '../../shared/contracts';
import {
  generatedSettingCommands,
  hostSettingDefinitions,
  settingInputSchema,
} from '../../shared/settings-commands';
import { validateSettingValue } from '../../shared/setting-definitions';
import type { SettingsStore } from './settings';
import type { AutomationCommand } from './automation-commands';
import { collectionRecord } from '../../shared/page-collections';
import { isAccentHex } from '../../shared/appearance';
import { sameSetting } from '../../shared/settings-defaults';
import type {
  SettingsFieldTarget,
  SettingsFieldPlan,
  SettingsListTarget,
} from './settings-target-types';
import { SettingsTargetError } from './settings-target-types';
import {
  mcpSettingPublished,
  mcpSettingSupported,
  mcpSettingValue,
  publicListFields,
  validateMcpSetting,
} from '../../shared/mcp-setting-fields';
import type { HostSettingDefinition } from '../../shared/host-settings';
import { parseSettings } from '../../shared/settings-schema';
import { settingsUiFields, settingsUiGroup } from '../../shared/settings-mcp-access';
import { appletSettingsPageId } from '../../shared/settings-navigation';

export class SettingsCommandError extends SettingsTargetError {}
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
interface Owner {
  collection?: import('../../shared/page-collections').CollectionBinding;
  id: string;
  title: string;
  fields: SettingDefinition[];
  available: boolean;
  options?: Record<string, SettingOption[]>;
}
export interface SettingsResetOwner {
  ownerId: string;
  keys: string[];
  collection?: Owner['collection'];
}

export class SettingsCommands {
  private epoch = randomUUID();
  constructor(
    private options: {
      settings: SettingsStore;
      applets(): ExtensionSnapshot[];
      save(value: Settings, revision: number, reset?: SettingsResetOwner): SettingsSnapshot;
      validate?(value: Settings): Settings;
      settingOptions?(owner: string, field: SettingDefinition): SettingOption[];
    },
  ) {}
  private owners(): Owner[] {
    return [
      { id: 'appdock', title: 'AppDock', fields: hostSettingDefinitions, available: true },
      ...this.options.applets().map((a) => ({
        collection: a.collection,
        id: a.id,
        title: a.displayName,
        fields: a.settings ?? [],
        options: a.settingOptions,
        available: a.enabled && a.state === 'running',
      })),
    ];
  }
  // Compatibility path: self-owned settings include private/undeclared keys and work during activation.
  // The caller identity and settings capability are checked by the Applet RPC adapter.
  setOwnSetting(
    owner: { id: string; settings?: SettingDefinition[] },
    key: string,
    value: unknown,
  ) {
    const changes = { [key]: value };
    this.validateChanges(owner.settings ?? [], changes, false);
    const store = this.options.settings;
    const next = structuredClone(store.value);
    this.applyAppletChanges(next, owner.id, changes);
    this.options.save(next, store.revision);
  }
  replaceOwnList(
    owner: { id: string; settings?: SettingDefinition[] },
    key: unknown,
    value: unknown,
    before: unknown,
  ) {
    const field = owner.settings?.find(
      (field) => field.key === key && field.type === 'object-list' && field.list,
    );
    if (!field) throw Error(hostText('services.settingsCommands.listDeclaration'));
    const current =
      this.options.settings.value.extensions[owner.id]?.settings[field.key] ?? field.default ?? [];
    if (JSON.stringify(readObjectList(current)) !== JSON.stringify(readObjectList(before)))
      throw Error(hostText('services.settingsCommands.listChanged'));
    this.setOwnSetting(owner, field.key, value);
  }
  private validateChanges(
    fields: SettingDefinition[],
    changes: Record<string, unknown>,
    declared: boolean,
  ) {
    for (const [key, value] of Object.entries(changes)) {
      const field = fields.find((f) => f.key === key);
      if (!field && declared)
        throw new SettingsCommandError(
          'INVALID_ARGUMENT',
          hostText('services.settingsCommands.invalidSetting'),
        );
      if (field) validateSettingValue(field, value);
    }
  }
  private applyAppletChanges(next: Settings, id: string, changes: Record<string, unknown>) {
    const current = next.extensions[id] ?? { enabled: defaultAppletEnabled, settings: {} };
    next.extensions[id] = { ...current, settings: { ...current.settings, ...changes } };
  }
  revision() {
    return `${this.epoch}:${this.options.settings.revision}`;
  }
  fieldTargets(): SettingsFieldTarget[] {
    return this.owners().flatMap((owner) => {
      const fields = owner.fields.filter(
        (field) => mcpSettingPublished(field) && mcpSettingSupported(field),
      );
      const categories =
        owner.id === 'appdock'
          ? [...new Set(fields.map((field) => (field as HostSettingDefinition).pageId))]
          : ['settings'];
      return categories.flatMap((category) => {
        const selected =
          owner.id === 'appdock'
            ? fields.filter((field) => (field as HostSettingDefinition).pageId === category)
            : fields;
        if (!selected.length) return [];
        return [
          {
            targetId:
              owner.id === 'appdock'
                ? `host.${category}`
                : `applet.${Buffer.from(owner.id).toString('base64url')}`,
            ownerId: owner.id,
            ui: settingsUiFields(
              owner.id === 'appdock' ? category : appletSettingsPageId(owner.id),
              (field) =>
                owner.id === 'appdock'
                  ? ((field as HostSettingDefinition).catalogKey ?? field.key)
                  : `setting:${field.key}`,
            ),
            title: owner.title,
            category,
            available: owner.available,
            fields: selected,
            options: (field: SettingDefinition) => this.fieldOptions(owner, field),
            schemaContext: () => this.imageContext(owner, selected),
            applies: (key: string) => this.applies(owner.id, key),
            values: () => this.values(owner, this.options.settings.value, selected),
            overrides: () => this.overrides(owner),
            plan: (changes: Record<string, unknown>, reset: string[], revision: string) => {
              const actual = { ...changes },
                resets = [...reset];
              for (const field of selected) {
                const value = Object.hasOwn(changes, field.key)
                  ? changes[field.key]
                  : reset.includes(field.key)
                    ? field.default
                    : undefined;
                if (value !== undefined)
                  try {
                    validateMcpSetting(field, value, this.fieldOptions(owner, field));
                  } catch {
                    throw new SettingsCommandError(
                      'INVALID_ARGUMENT',
                      hostText('services.settingsCommands.valueFormat'),
                    );
                  }
              }
              for (const field of selected)
                if (
                  Object.hasOwn(actual, field.key) &&
                  sameSetting(actual[field.key], field.default)
                ) {
                  delete actual[field.key];
                  resets.push(field.key);
                }
              return this.plan(owner, selected, actual, revision, resets);
            },
          },
        ];
      });
    });
  }
  private fieldOptions(owner: Owner, field: SettingDefinition): SettingOption[] {
    if (field.type === 'registered-image' || field.optionSource) {
      try {
        return this.options.settingOptions?.(owner.collection?.owner ?? owner.id, field) ?? [];
      } catch {
        return [];
      }
    }
    return (field.dynamic ? owner.options?.[field.key] : undefined) ?? field.options ?? [];
  }
  private imageContext(owner: Owner, fields: SettingDefinition[]) {
    const images = fields.filter((field) => field.type === 'registered-image');
    return images.length
      ? images.map((field) => [field.key, this.fieldOptions(owner, field)])
      : undefined;
  }
  listTargets(): SettingsListTarget[] {
    return this.owners().flatMap((owner) =>
      owner.fields.flatMap((definition) => {
        if (definition.type !== 'object-list' || !mcpSettingPublished(definition)) return [];
        const fields = publicListFields(definition);
        if (!fields.length) return [];
        return [
          {
            kind: 'list' as const,
            targetId:
              'list.' +
              Buffer.from(JSON.stringify([owner.id, definition.key])).toString('base64url'),
            ownerId: owner.id,
            title: owner.title + ' / ' + definition.title,
            category: 'settings',
            ui: settingsUiGroup(appletSettingsPageId(owner.id), `setting:${definition.key}`),
            available: owner.available,
            fields,
            definition,
            options: (field: SettingDefinition) => this.fieldOptions(owner, field),
            schemaContext: () => this.imageContext(owner, fields),
            applies: (key: string) => this.applies(owner.id, key),
            overrides: () => this.overrides(owner),
            rows: () =>
              readObjectList(
                this.values(owner, this.options.settings.value, [definition])[definition.key] ?? [],
              ),
            plan: (rows: Record<string, unknown>[], revision: string) =>
              this.plan(owner, [definition], { [definition.key]: rows }, revision),
          },
        ];
      }),
    );
  }
  private owner(appletId?: string, caller: SettingsCaller = 'mcp') {
    const owner = this.owners().find((o) => o.id === (appletId ?? 'appdock'));
    if (!owner || !owner.fields.some((f) => isSettingAccessible(f, caller)))
      throw new SettingsCommandError(
        'NOT_FOUND',
        hostText('services.settingsCommands.settingMissing'),
      );
    return owner;
  }
  private values(
    owner: Owner,
    settings = this.options.settings.value,
    fields = owner.fields.filter((f) => isSettingAccessible(f, 'mcp')),
  ) {
    const saved: Record<string, unknown> =
      owner.id === 'appdock'
        ? { ...settings.host }
        : owner.collection
          ? { ...collectionRecord(settings, owner.collection) }
          : (settings.extensions[owner.id]?.settings ?? {});
    return Object.fromEntries(
      fields.map((f) => {
        const value = Object.hasOwn(saved, f.key) ? saved[f.key] : f.default;
        return [f.key, mcpSettingValue(f, value)];
      }),
    );
  }
  private overrides(owner: Owner) {
    try {
      return this.options.settings.storedSettingOverrides(owner.id, owner.collection);
    } catch {
      return undefined;
    }
  }
  schema(appletId?: string, caller: SettingsCaller = 'mcp') {
    const owner = this.owner(appletId, caller);
    return {
      scope: owner.id === 'appdock' ? 'host' : 'applet',
      appletId: appletId ?? null,
      fields: Object.fromEntries(
        owner.fields
          .filter((f) => isSettingAccessible(f, caller))
          .map((f) => [
            f.key,
            {
              ...settingInputSchema(f),
              applies: this.applies(owner.id, f.key),
              generateCommands: f.generateCommands ?? [],
            },
          ]),
      ),
    };
  }
  get(appletId?: string, caller: SettingsCaller = 'mcp') {
    const owner = this.owner(appletId, caller);
    return {
      values: this.values(
        owner,
        this.options.settings.value,
        owner.fields.filter((f) => isSettingAccessible(f, caller)),
      ),
      revision: this.revision(),
      warning: this.options.settings.syncError ?? null,
    };
  }
  commands(caller: SettingsCaller = 'mcp'): AutomationCommand[] {
    return this.owners().flatMap((owner) => {
      const fields = owner.fields.filter((f) => isSettingAccessible(f, caller));
      if (!fields.length) return [];
      const base = {
        appletId: owner.id === 'appdock' ? null : owner.id,
        available: owner.available,
        unavailableReason: owner.available
          ? null
          : hostText('services.settingsCommands.appletRunningRequired'),
        completion: 'settingsSaved' as const,
        permission: 'settings.write' as const,
      };
      return [
        {
          ...base,
          id: `${owner.id}.settings.update`,
          title: hostText('services.settingsCommands.updateTitle', { name: String(owner.title) }),
          inputSchema: {
            type: 'object',
            properties: {
              changes: {
                type: 'object',
                properties: Object.fromEntries(fields.map((f) => [f.key, settingInputSchema(f)])),
                additionalProperties: false,
                minProperties: 1,
              },
              expectedRevision: { type: 'string' },
              dryRun: { type: 'boolean' },
            },
            required: ['changes', 'expectedRevision'],
            additionalProperties: false,
          },
        },
        ...generatedSettingCommands(owner.id, fields, owner.available).map((c) => ({
          ...base,
          id: c.id,
          title: c.title,
          inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        })),
      ];
    });
  }
  hasGenerated(id: string) {
    return this.owners().some((o) =>
      generatedSettingCommands(o.id, o.fields, o.available).some((c) => c.id === id),
    );
  }
  execute(id: string, args: unknown = {}, external = true, caller: SettingsCaller = 'mcp') {
    if (!object(args))
      throw new SettingsCommandError(
        'INVALID_ARGUMENT',
        hostText('services.settingsCommands.argumentObject'),
      );
    for (const owner of this.owners()) {
      const fields = external
        ? owner.fields.filter((f) => isSettingAccessible(f, caller))
        : owner.fields;
      if (id === `${owner.id}.settings.update` && fields.length && external) {
        if (
          Object.keys(args).some((k) => !['changes', 'expectedRevision', 'dryRun'].includes(k)) ||
          !object(args.changes) ||
          !Object.keys(args.changes).length ||
          typeof args.expectedRevision !== 'string' ||
          (args.dryRun !== undefined && typeof args.dryRun !== 'boolean')
        )
          throw new SettingsCommandError(
            'INVALID_ARGUMENT',
            hostText('services.settingsCommands.patchArguments'),
          );
        return this.update(
          owner,
          fields,
          args.changes,
          args.expectedRevision,
          args.dryRun === true,
        );
      }
      for (const field of fields)
        for (const action of field.generateCommands ?? []) {
          if (id !== `${owner.id}.settings.${field.key}.${action}`) continue;
          if (Object.keys(args).length)
            throw new SettingsCommandError(
              'INVALID_ARGUMENT',
              hostText('services.settingsCommands.noArguments'),
            );
          // Check disk before deriving a toggle; never retry a conflicting toggle.
          const revision = this.revision();
          this.checkRevision(revision);
          const current = this.values(owner, this.options.settings.value, [field])[field.key];
          if (typeof current !== 'boolean')
            throw new SettingsCommandError(
              'INVALID_ARGUMENT',
              hostText('services.settingsCommands.notBoolean'),
            );
          return this.update(
            owner,
            fields,
            { [field.key]: action === 'toggle' ? !current : action === 'on' },
            revision,
            false,
          );
        }
    }
    throw new SettingsCommandError(
      'NOT_FOUND',
      hostText('services.settingsCommands.commandMissing'),
    );
  }
  checkRevision(revision: string) {
    if (revision !== this.revision())
      throw new SettingsCommandError(
        'REVISION_CONFLICT',
        hostText('services.settingsCommands.refreshChanges'),
      );
    try {
      this.options.settings.assertRevision(this.options.settings.revision);
    } catch {
      throw new SettingsCommandError(
        'REVISION_CONFLICT',
        hostText('services.settingsCommands.fileChanged'),
      );
    }
    if (revision !== this.revision())
      throw new SettingsCommandError(
        'REVISION_CONFLICT',
        hostText('services.settingsCommands.refresh'),
      );
  }
  private applies(owner: string, key: string) {
    if (this.options.applets().some((a) => a.id === owner && a.collection)) return 'immediate';
    return owner === 'appdock'
      ? (hostSettingDefinitions.find((field) => field.key === key)?.applies ?? 'immediate')
      : 'settingsChanged';
  }
  private update(
    owner: Owner,
    fields: SettingDefinition[],
    changes: Record<string, unknown>,
    revision: string,
    dryRun: boolean,
  ) {
    const plan = this.plan(owner, fields, changes, revision);
    if (!dryRun) plan.commit();
    return {
      dryRun,
      changed: plan.changed,
      values: dryRun ? plan.values : this.values(owner, this.options.settings.value, fields),
      revision: this.revision(),
      applies: plan.applies,
      warning: this.options.settings.syncError ?? null,
    };
  }
  private plan(
    owner: Owner,
    fields: SettingDefinition[],
    changes: Record<string, unknown>,
    revision: string,
    reset: string[] = [],
  ): SettingsFieldPlan {
    if (!owner.available)
      throw new SettingsCommandError(
        'UNAVAILABLE',
        hostText('services.settingsCommands.appletRunningRequired'),
      );
    try {
      this.validateChanges(fields, changes, true);
      if (reset.some((key) => !fields.some((field) => field.key === key)))
        throw new SettingsCommandError(
          'INVALID_ARGUMENT',
          hostText('services.settingsCommands.invalidSetting'),
        );
    } catch (error) {
      if (error instanceof SettingsCommandError) throw error;
      throw new SettingsCommandError(
        'INVALID_ARGUMENT',
        hostText('services.settingsCommands.valueFormat'),
      );
    }
    this.checkRevision(revision);
    const store = this.options.settings;
    let next = structuredClone(store.value);
    const before = this.values(owner, store.value, fields);
    const originalOverrides = this.overrides(owner);
    const overrides = originalOverrides === undefined ? undefined : { ...originalOverrides };
    if (overrides) {
      Object.assign(overrides, changes);
      for (const key of reset) delete overrides[key];
    }
    if (owner.id === 'appdock') {
      for (const key of ['customAccentDark', 'customAccentLight'])
        if (Object.hasOwn(changes, key) && !isAccentHex(changes[key]))
          throw new SettingsCommandError(
            'INVALID_ARGUMENT',
            hostText('services.settingsCommands.colorFormat'),
          );
      Object.assign(next.host, changes);
      for (const key of reset) delete (next.host as unknown as Record<string, unknown>)[key];
    } else if (owner.collection) {
      const item = collectionRecord(next, owner.collection);
      if (!item?.enabled)
        throw new SettingsCommandError(
          'UNAVAILABLE',
          hostText('services.settingsCommands.pageEnabledRequired'),
        );
      try {
        Object.assign(item, changes);
        for (const key of reset) {
          const field = fields.find((field) => field.key === key)!;
          if (field.default === undefined) delete item[key];
          else item[key] = structuredClone(field.default);
        }
        if (typeof item.name === 'string') item.name = item.name.trim();
        if (!item.name || item.name.length > 80 || /[\x00-\x1f\x7f]/.test(item.name))
          throw Error(hostText('services.settingsCommands.pageName'));
      } catch {
        throw new SettingsCommandError(
          'INVALID_ARGUMENT',
          hostText('services.settingsCommands.pageValue'),
        );
      }
    } else {
      if (!appletEnabled(next, owner.id))
        throw new SettingsCommandError(
          'UNAVAILABLE',
          hostText('services.settingsCommands.appletEnabledRequired'),
        );
      this.applyAppletChanges(next, owner.id, changes);
      for (const key of reset) delete next.extensions[owner.id].settings[key];
    }
    try {
      next = this.options.validate?.(next) ?? parseSettings(next);
    } catch {
      throw new SettingsCommandError(
        'INVALID_ARGUMENT',
        hostText('services.settingsCommands.valueFormat'),
      );
    }
    const after = this.values(owner, next, fields);
    const changed = [...Object.keys(changes), ...reset].filter(
      (key) =>
        !sameSetting(before[key], after[key]) ||
        (reset.includes(key) &&
          originalOverrides !== undefined &&
          Object.hasOwn(originalOverrides, key)),
    );
    const removedOverrides = reset.filter(
      (key) => originalOverrides !== undefined && Object.hasOwn(originalOverrides, key),
    );
    const commit = () => {
      this.checkRevision(revision);
      if (!changed.length) return;
      try {
        this.options.save(
          next,
          store.revision,
          removedOverrides.length
            ? { ownerId: owner.id, collection: owner.collection, keys: removedOverrides }
            : undefined,
        );
      } catch {
        throw new SettingsCommandError(
          'SAVE_FAILED',
          hostText('services.settingsCommands.saveFailed'),
        );
      }
    };
    return {
      changed,
      overrides,
      before,
      values: after,
      commit,
      applies: Object.fromEntries(changed.map((k) => [k, this.applies(owner.id, k)])),
    };
  }
}

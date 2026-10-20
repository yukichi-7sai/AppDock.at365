import { randomUUID } from 'node:crypto';
import { appletEnabled, defaultAppletEnabled } from '../../shared/applet-state';
import { readObjectList } from '../../shared/object-list';
import type {
  ExtensionSnapshot,
  Settings,
  SettingsSnapshot,
  SettingDefinition,
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

export class SettingsCommandError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
interface Owner {
  collection?: import('../../shared/page-collections').CollectionBinding;
  id: string;
  title: string;
  fields: SettingDefinition[];
  available: boolean;
}

export class SettingsCommands {
  private epoch = randomUUID();
  constructor(
    private options: {
      settings: SettingsStore;
      applets(): ExtensionSnapshot[];
      save(value: Settings, revision: number): SettingsSnapshot;
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
    if (!field) throw Error('一覧設定の宣言がありません。');
    const current =
      this.options.settings.value.extensions[owner.id]?.settings[field.key] ?? field.default ?? [];
    if (JSON.stringify(readObjectList(current)) !== JSON.stringify(readObjectList(before)))
      throw Error('一覧が別の場所で変更されました。閉じて開き直してください。');
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
          '公開された設定項目と値を確認してください。',
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
  private owner(appletId?: string) {
    const owner = this.owners().find((o) => o.id === (appletId ?? 'appdock'));
    if (!owner || !owner.fields.some((f) => f.automation))
      throw new SettingsCommandError('NOT_FOUND', '公開された設定が見つかりません。');
    return owner;
  }
  private values(
    owner: Owner,
    settings = this.options.settings.value,
    fields = owner.fields.filter((f) => f.automation),
  ) {
    const saved: Record<string, unknown> =
      owner.id === 'appdock'
        ? { ...settings.host }
        : owner.collection
          ? { ...collectionRecord(settings, owner.collection) }
          : (settings.extensions[owner.id]?.settings ?? {});
    return Object.fromEntries(
      fields.map((f) => [f.key, Object.hasOwn(saved, f.key) ? saved[f.key] : f.default]),
    );
  }
  schema(appletId?: string) {
    const owner = this.owner(appletId);
    return {
      scope: owner.id === 'appdock' ? 'host' : 'applet',
      appletId: appletId ?? null,
      fields: Object.fromEntries(
        owner.fields
          .filter((f) => f.automation)
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
  get(appletId?: string) {
    return {
      values: this.values(this.owner(appletId)),
      revision: this.revision(),
      warning: this.options.settings.syncError ?? null,
    };
  }
  commands(): AutomationCommand[] {
    return this.owners().flatMap((owner) => {
      const fields = owner.fields.filter((f) => f.automation);
      if (!fields.length) return [];
      const base = {
        appletId: owner.id === 'appdock' ? null : owner.id,
        available: owner.available,
        unavailableReason: owner.available ? null : 'Appletが有効・稼働中である必要があります。',
        completion: 'settingsSaved' as const,
        permission: 'settings.write' as const,
      };
      return [
        {
          ...base,
          id: `${owner.id}.settings.update`,
          title: `${owner.title}の設定を更新`,
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
  execute(id: string, args: unknown = {}, external = true) {
    if (!object(args))
      throw new SettingsCommandError('INVALID_ARGUMENT', 'argsはオブジェクトです。');
    for (const owner of this.owners()) {
      const fields = external ? owner.fields.filter((f) => f.automation) : owner.fields;
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
            'changesとexpectedRevisionを指定してください。',
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
              'このコマンドに引数は指定できません。',
            );
          // Check disk before deriving a toggle; never retry a conflicting toggle.
          const revision = this.revision();
          this.checkRevision(revision);
          const current = this.values(owner, this.options.settings.value, [field])[field.key];
          if (typeof current !== 'boolean')
            throw new SettingsCommandError(
              'INVALID_ARGUMENT',
              '現在の設定値がbooleanではありません。',
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
    throw new SettingsCommandError('NOT_FOUND', '設定コマンドが見つかりません。');
  }
  checkRevision(revision: string) {
    if (revision !== this.revision())
      throw new SettingsCommandError(
        'REVISION_CONFLICT',
        '設定を再取得して変更内容を確認してください。',
      );
    try {
      this.options.settings.assertRevision(this.options.settings.revision);
    } catch {
      throw new SettingsCommandError(
        'REVISION_CONFLICT',
        '設定ファイルが変更されたか読み取れません。再取得してください。',
      );
    }
    if (revision !== this.revision())
      throw new SettingsCommandError('REVISION_CONFLICT', '設定を再取得してください。');
  }
  private applies(owner: string, key: string) {
    if (this.options.applets().some((a) => a.id === owner && a.collection)) return 'immediate';
    return owner === 'appdock'
      ? ({ closeToTray: 'nextClose', startMinimized: 'nextStart' }[key] ?? 'immediate')
      : 'settingsChanged';
  }
  private update(
    owner: Owner,
    fields: SettingDefinition[],
    changes: Record<string, unknown>,
    revision: string,
    dryRun: boolean,
  ) {
    if (!owner.available)
      throw new SettingsCommandError('UNAVAILABLE', 'Appletが有効・稼働中である必要があります。');
    try {
      this.validateChanges(fields, changes, true);
    } catch (error) {
      if (error instanceof SettingsCommandError) throw error;
      throw new SettingsCommandError(
        'INVALID_ARGUMENT',
        '設定値の型・範囲・選択肢を確認してください。',
      );
    }
    this.checkRevision(revision);
    const store = this.options.settings,
      next = structuredClone(store.value);
    const before = this.values(owner, store.value, fields);
    if (owner.id === 'appdock') Object.assign(next.host, changes);
    else if (owner.collection) {
      const item = collectionRecord(next, owner.collection);
      if (!item?.enabled)
        throw new SettingsCommandError('UNAVAILABLE', 'ページが有効である必要があります。');
      try {
        Object.assign(item, changes);
        if (typeof item.name === 'string') item.name = item.name.trim();
        if (!item.name || item.name.length > 80 || /[\x00-\x1f\x7f]/.test(item.name))
          throw Error('ページ名が不正です。');
      } catch {
        throw new SettingsCommandError(
          'INVALID_ARGUMENT',
          '公開されたページ設定の値を確認してください。',
        );
      }
    } else {
      if (!appletEnabled(next, owner.id))
        throw new SettingsCommandError('UNAVAILABLE', 'Appletが有効である必要があります。');
      this.applyAppletChanges(next, owner.id, changes);
    }
    const after = this.values(owner, next, fields);
    const changed = Object.keys(changes).filter((k) => before[k] !== after[k]);
    if (!dryRun && changed.length) {
      try {
        this.options.save(next, store.revision);
      } catch {
        throw new SettingsCommandError(
          'SAVE_FAILED',
          '設定を保存できませんでした。AppDockのログを確認してください。',
        );
      }
    }
    return {
      dryRun,
      changed,
      values: this.values(owner, dryRun ? next : store.value, fields),
      revision: this.revision(),
      applies: Object.fromEntries(changed.map((k) => [k, this.applies(owner.id, k)])),
      warning: store.syncError ?? null,
    };
  }
}

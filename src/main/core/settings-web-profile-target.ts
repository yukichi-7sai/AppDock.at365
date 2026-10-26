import { randomUUID } from 'node:crypto';
import type { SettingDefinition } from '../../shared/contracts';
import { hostText } from '../../shared/i18n';
import { settingsUiGroup } from '../../shared/settings-mcp-access';
import { webProfileName } from '../../shared/web-content';
import { WebProfileSettingsError, type WebProfileStore } from './web-profiles';
import { SettingsTargetError, type SettingsListTarget } from './settings-target-types';

const safeError = (error: unknown): never => {
  const code = error instanceof WebProfileSettingsError ? error.code : 'UNAVAILABLE';
  throw new SettingsTargetError(
    code,
    hostText(
      code === 'REVISION_CONFLICT'
        ? 'services.settingsCommands.refreshChanges'
        : code === 'INVALID_ARGUMENT'
          ? 'services.settingsTargets.invalid'
          : 'services.settingsTargets.unavailable',
    ),
  );
};

/** One declared provider owns each roster; sessions and destructive operations stay local. */
export function webProfileSettingsTarget(options: {
  ownerId: string;
  title: string;
  store?: WebProfileStore;
  checkRevision(revision: string): void;
  changed(): void;
}): SettingsListTarget {
  const { store } = options;
  let snapshot: ReturnType<WebProfileStore['publicConfiguration']> | undefined;
  try {
    snapshot = store?.publicConfiguration();
  } catch {
    // Invalid, missing-after-sync or unreadable data must never be recreated by discovery.
  }
  const available = !!snapshot;
  const fields: SettingDefinition[] = [
    { key: 'id', title: hostText('settings.webAccountSettings.id'), type: 'string' },
    {
      key: 'name',
      title: hostText('settings.webAccountSettings.name'),
      type: 'string',
      minLength: 1,
      maxLength: 80,
    },
  ];
  const definition: SettingDefinition = {
    key: 'accounts',
    title: hostText('settings.webAccountSettings.title'),
    type: 'object-list',
    fields,
    list: { idKey: 'id', titleKey: 'name', columns: ['name'] },
  };
  return {
    kind: 'list',
    targetId: `service.web-profiles.${Buffer.from(options.ownerId).toString('base64url')}`,
    ownerId: options.ownerId,
    title: `${definition.title} (${options.title})`,
    category: 'web-accounts',
    available,
    ui: settingsUiGroup('web-accounts', 'accounts'),
    fields,
    definition,
    maxItems: 32,
    operations: ['add', 'update'],
    rows: () => store?.snapshot().map(({ id, name }) => ({ id, name })) ?? [],
    overrides: () => {
      try {
        return store ? { $guard: store.publicConfiguration().revision } : undefined;
      } catch {
        return undefined;
      }
    },
    applies: () => 'webProfilesChanged',
    writable: (field) => available && field.key === 'name',
    removable: () => false,
    validateField: (field, value) => {
      if (field.key !== 'name') throw Error();
      webProfileName(value);
    },
    createRow: () => ({
      id: `account.${randomUUID()}`,
      name: hostText('settings.webAccountSettings.defaultName', { value: 1 }),
    }),
    prepareRow: (row) => {
      row.name = webProfileName(row.name);
    },
    plan: (rows, revision) => {
      options.checkRevision(revision);
      if (!store || !snapshot) return safeError(new WebProfileSettingsError('UNAVAILABLE'));
      let plan: ReturnType<WebProfileStore['planPublicConfiguration']>;
      try {
        plan = store.planPublicConfiguration(rows, snapshot.revision);
      } catch (error) {
        return safeError(error);
      }
      return {
        changed: plan.changed ? ['accounts'] : [],
        before: {},
        values: {},
        applies: { accounts: 'webProfilesChanged' },
        commit: (preflight) => {
          options.checkRevision(revision);
          preflight?.();
          try {
            plan.commit();
          } catch (error) {
            safeError(error);
          }
          options.changed();
        },
      };
    },
  };
}

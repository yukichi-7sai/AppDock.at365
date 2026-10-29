import { randomUUID } from 'node:crypto';
import type { ExtensionSnapshot, SettingDefinition } from '../../shared/contracts';
import { hostText } from '../../shared/i18n';
import { webAccountName } from '../../shared/web-accounts';
import { WebAccountRosterError, type WebAccountRoster } from './web-account-roster';
import { webAccountSettingsRoster } from './web-accounts';
import { SettingsTargetError, type SettingsListTarget } from './settings-target-types';

const safeError = (error: unknown): never => {
  const code = error instanceof WebAccountRosterError ? error.code : 'UNAVAILABLE';
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

/** Service accounts stay separate from web-profiles and publish only identities. */
export function webAccountSettingsTargets(options: {
  applets: ExtensionSnapshot[];
  localRoot: string;
  sharedRoot: string;
  checkRevision(revision: string): void;
  changed(): void;
}): SettingsListTarget[] {
  return options.applets
    .filter((owner) => owner.capabilities?.includes('web-accounts') && owner.webAccounts)
    .map((owner) => {
      let store: WebAccountRoster | undefined;
      let snapshot: ReturnType<WebAccountRoster['publicConfiguration']> | undefined;
      try {
        store = webAccountSettingsRoster(
          owner.id,
          owner.webAccounts!,
          options.localRoot,
          options.sharedRoot,
        );
        snapshot = store.publicConfiguration();
      } catch {
        /* Discovery never repairs roster data. */
      }
      const fields: SettingDefinition[] = [
        { key: 'id', title: hostText('settings.webAccountSettings.id'), type: 'string' },
        {
          key: 'name',
          title: hostText('settings.webAccountSettings.name'),
          type: 'string',
          minLength: 1,
          maxLength: 60,
        },
      ];
      const definition: SettingDefinition = {
        key: 'accounts',
        title:
          owner.webAccounts!.accountGroup?.title ?? hostText('settings.webAccountSettings.title'),
        type: 'object-list',
        fields,
        list: { idKey: 'id', titleKey: 'name', columns: ['name'] },
      };
      return {
        kind: 'list',
        targetId: `service.web-accounts.${Buffer.from(owner.id).toString('base64url')}`,
        ownerId: owner.id,
        title: `${definition.title} (${owner.displayName})`,
        category: 'web-accounts',
        schemaContext: () => ({ group: owner.webAccounts!.accountGroup?.id ?? null }),
        available: !!snapshot,
        fields,
        definition,
        operations: ['add', 'update'],
        rows: () => {
          try {
            return store?.publicConfiguration().accounts.map((row) => ({ ...row })) ?? [];
          } catch {
            return [];
          }
        },
        overrides: () => {
          try {
            return store ? { $guard: store.publicConfiguration().revision } : undefined;
          } catch {
            return undefined;
          }
        },
        applies: () => 'webAccountsChanged',
        writable: (field) => field.key === 'name',
        removable: () => false,
        createRow: () => ({
          id: randomUUID(),
          name: hostText('settings.webAccountSettings.defaultName', { value: 1 }),
        }),
        validateField: (field, value) => {
          if (field.key !== 'name') throw Error();
          webAccountName(value);
        },
        prepareRow: (row) => {
          row.name = webAccountName(row.name);
        },
        plan: (rows, revision) => {
          options.checkRevision(revision);
          if (!store || !snapshot) return safeError(new WebAccountRosterError('UNAVAILABLE'));
          let plan: ReturnType<WebAccountRoster['planPublicConfiguration']>;
          try {
            plan = store.planPublicConfiguration(rows, snapshot.revision);
          } catch (error) {
            return safeError(error);
          }
          return {
            changed: plan.changed ? ['accounts'] : [],
            before: {},
            values: {},
            applies: { accounts: 'webAccountsChanged' },
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
    });
}

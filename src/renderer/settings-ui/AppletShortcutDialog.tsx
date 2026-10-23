import { useHostTranslation } from '../HostTranslation';
import { useState } from 'react';
import { SettingsField } from './SettingsSections';
import { normalizeShortcut } from '../../shared/commands';
import {
  protectedShortcut,
  externalShortcutScope,
  externalShortcutScopes,
} from '../../shared/keybindings';
import type { Keybinding } from '../../shared/keybindings';
import { ShortcutConditionField } from './ShortcutFields';
import { Toggle } from './Toggle';
import { BindingEditDialog } from './BindingEditDialog';
import { ShortcutCaptureField } from './ShortcutCaptureField';
import { CommandConditionDetails, useConditionProcesses } from './CommandConditionDetails';

export function AppletShortcutDialog({
  initial,
  title,
  ownerTitle,
  applets,
  adding,
  onApply,
  onClose,
}: {
  initial: Keybinding;
  title: string;
  ownerTitle?: string;
  applets: { id: string; title: string }[];
  adding: boolean;
  onApply(row: Keybinding): void;
  onClose(): void;
}) {
  const { t: translate } = useHostTranslation();
  const [value, setValue] = useState(() => structuredClone(initial));
  const draft = useConditionProcesses(value.when);
  const protectedKey =
    !!value.key && externalShortcutScope(value.when.scope) && protectedShortcut(value.key);
  const valid =
    !!value.key &&
    !protectedKey &&
    (value.when.scope !== 'applets' || !!value.when.appletIds.length) &&
    (value.when.scope !== 'exe' || (!draft.processError && !!draft.processes.length));
  return (
    <BindingEditDialog
      title={title}
      adding={adding}
      valid={valid}
      error={protectedKey ? translate('settings.appletShortcutDialog.protectedKey') : undefined}
      errorTarget={translate('settings.appletShortcutDialog.key')}
      onApply={() =>
        onApply({
          ...value,
          key: normalizeShortcut(value.key),
          when: {
            ...value.when,
            ...(value.when.scope === 'exe' ? { processes: draft.processes } : {}),
          },
        })
      }
      onClose={onClose}
    >
      {(ready, setError) => (
        <>
          <ShortcutCaptureField
            value={value.key}
            onChange={(key) => setValue({ ...value, key })}
            recordingReady={ready}
            setError={setError}
          />
          <SettingsField
            title={translate('settings.appletShortcutDialog.scope')}
            hint={
              value.when.scope === 'browser'
                ? translate('settings.appletShortcutDialog.browserHint')
                : undefined
            }
          >
            <ShortcutConditionField
              value={{
                scope: externalShortcutScope(value.when.scope) ? 'global' : value.when.scope,
                appletIds: value.when.appletIds,
              }}
              selectedScope={value.when.scope}
              extraScopes={externalShortcutScopes.slice()}
              onExtraScope={(scope) =>
                setValue({
                  ...value,
                  when: {
                    scope: scope as Keybinding['when']['scope'],
                    appletIds: [],
                    processes: [],
                    ...(scope === 'exe' && value.when.excludeDesktop !== undefined
                      ? { excludeDesktop: value.when.excludeDesktop }
                      : {}),
                  },
                })
              }
              label={translate('settings.appletShortcutDialog.scopeLabel')}
              ownerTitle={ownerTitle}
              applets={applets}
              onChange={(when) => {
                if (when.scope !== 'default')
                  setValue({
                    ...value,
                    when: {
                      scope: when.scope,
                      appletIds: when.appletIds,
                      ...(when.scope === 'global' && value.when.excludeDesktop !== undefined
                        ? { excludeDesktop: value.when.excludeDesktop }
                        : {}),
                    },
                  });
              }}
            />
          </SettingsField>
          <CommandConditionDetails
            when={value.when}
            onChange={(when) => setValue({ ...value, when })}
            {...draft}
          />
          <SettingsField
            title={translate('settings.appletShortcutDialog.blockOriginal')}
            hint={
              externalShortcutScope(value.when.scope)
                ? translate('settings.appletShortcutDialog.blockHint')
                : translate('settings.appletShortcutDialog.blockScopes')
            }
          >
            <Toggle
              checked={value.blockOriginalInput !== false}
              disabled={!externalShortcutScope(value.when.scope)}
              label={translate('settings.appletShortcutDialog.blockOriginal')}
              onChange={(blockOriginalInput) => setValue({ ...value, blockOriginalInput })}
            />
          </SettingsField>
          <SettingsField title={translate('settings.appletShortcutDialog.enabled')}>
            <Toggle
              checked={value.enabled}
              label={translate('settings.appletShortcutDialog.enabled')}
              onChange={(enabled) => setValue({ ...value, enabled })}
            />
          </SettingsField>
        </>
      )}
    </BindingEditDialog>
  );
}

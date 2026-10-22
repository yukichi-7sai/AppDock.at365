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
      error={protectedKey ? 'Windowsが保護するキーのため割り当てられません。' : undefined}
      errorTarget="ショートカットキー"
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
            title="いつ・どこで"
            hint={
              value.when.scope === 'browser'
                ? '画面上部の「動作設定」で指定したブラウザに適用します。'
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
              label="割り当てのいつ・どこで"
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
            title="元のキー入力をブロックする"
            hint={
              externalShortcutScope(value.when.scope)
                ? '条件が一致した場合に使います。OFFにすると、入力をWindowsやほかのアプリにも渡します。'
                : 'グローバル・デスクトップ・Webブラウザ・指定したexeの割り当てで使用します。'
            }
          >
            <Toggle
              checked={value.blockOriginalInput !== false}
              disabled={!externalShortcutScope(value.when.scope)}
              label="元のキー入力をブロックする"
              onChange={(blockOriginalInput) => setValue({ ...value, blockOriginalInput })}
            />
          </SettingsField>
          <SettingsField title="この割り当てを有効にする">
            <Toggle
              checked={value.enabled}
              label="この割り当てを有効にする"
              onChange={(enabled) => setValue({ ...value, enabled })}
            />
          </SettingsField>
        </>
      )}
    </BindingEditDialog>
  );
}

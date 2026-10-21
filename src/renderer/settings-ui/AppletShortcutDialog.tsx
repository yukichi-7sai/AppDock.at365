import { useState } from 'react';
import { SettingsHint } from './SettingsHint';
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
          <div className="shortcut-dialog-condition">
            <span>いつ・どこで</span>
            <div>
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
              <CommandConditionDetails
                when={value.when}
                onChange={(when) => setValue({ ...value, when })}
                {...draft}
              />
            </div>
          </div>
          <div className="shortcut-dialog-enabled">
            <span>元のキー入力をブロックする</span>
            <Toggle
              checked={value.blockOriginalInput !== false}
              disabled={!externalShortcutScope(value.when.scope)}
              label="元のキー入力をブロックする"
              onChange={(blockOriginalInput) => setValue({ ...value, blockOriginalInput })}
            />
          </div>
          <SettingsHint as="small">
            {externalShortcutScope(value.when.scope)
              ? '条件が一致した場合に使います。OFFにすると、入力をWindowsやほかのアプリにも渡します。'
              : 'グローバル・デスクトップ・Webブラウザ・指定したexeの割り当てで使用します。'}
          </SettingsHint>
          {protectedKey && <p role="alert">Windowsが保護するキーのため割り当てられません。</p>}
          <div className="shortcut-dialog-enabled">
            <span>この割り当てを有効にする</span>
            <Toggle
              checked={value.enabled}
              label="この割り当てを有効にする"
              onChange={(enabled) => setValue({ ...value, enabled })}
            />
          </div>
        </>
      )}
    </BindingEditDialog>
  );
}

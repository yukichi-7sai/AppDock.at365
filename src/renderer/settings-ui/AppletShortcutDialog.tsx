import { useHostTranslation } from '../HostTranslation';
import { useState } from 'react';
import { SettingsField } from './SettingsSections';
import { normalizeShortcut } from '../../shared/commands';
import { protectedShortcut, externalShortcutScope } from '../../shared/keybindings';
import type { Keybinding } from '../../shared/keybindings';
import { Toggle } from './Toggle';
import { BindingEditDialog } from './BindingEditDialog';
import { ShortcutCaptureField } from './ShortcutCaptureField';
import { useConditionProcesses, conditionExclusions } from './CommandConditionDetails';
import { CommandConditionEditor } from './CommandConditionEditor';
import { BindingEditorLayout, BindingEnabledControl } from './BindingEditorLayout';

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
    !draft.excludedProcessError &&
    (value.when.scope !== 'applets' || !!value.when.appletIds.length) &&
    (value.when.scope !== 'exe' || (!draft.processError && !!draft.processes.length));
  return (
    <BindingEditDialog
      className="binding-editor-dialog"
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
            ...conditionExclusions(value.when, draft),
            ...(value.when.scope === 'exe' ? { processes: draft.processes } : {}),
          },
        })
      }
      onClose={onClose}
      footerStart={
        <BindingEnabledControl
          enabled={value.enabled}
          onChange={(enabled) => setValue({ ...value, enabled })}
        />
      }
    >
      {(ready, setError) => (
        <BindingEditorLayout
          inputKey="key"
          input={
            <>
              <ShortcutCaptureField
                value={value.key}
                onChange={(key) => setValue({ ...value, key })}
                recordingReady={ready}
                setError={setError}
              />
              <SettingsField
                className="binding-inline-toggle"
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
            </>
          }
          conditions={
            <CommandConditionEditor
              when={value.when}
              onChange={(when) => setValue({ ...value, when })}
              draft={draft}
              ownerTitle={ownerTitle}
              applets={applets}
            />
          }
        />
      )}
    </BindingEditDialog>
  );
}

import { useState } from 'react';
import { SettingsHint } from './SettingsHint';
import { normalizeShortcut } from '../../shared/commands';
import { protectedShortcut } from '../../shared/keybindings';
import type { Keybinding } from '../../shared/keybindings';
import { ShortcutConditionField } from './ShortcutFields';
import { Toggle } from './Toggle';
import { BindingEditDialog } from './BindingEditDialog';
import { ShortcutCaptureField } from './ShortcutCaptureField';

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
  const protectedKey = !!value.key && value.when.scope === 'global' && protectedShortcut(value.key);
  const valid =
    !!value.key &&
    !protectedKey &&
    (value.when.scope !== 'applets' || !!value.when.appletIds.length);
  return (
    <BindingEditDialog
      title={title}
      adding={adding}
      valid={valid}
      onApply={() => onApply({ ...value, key: normalizeShortcut(value.key) })}
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
            <ShortcutConditionField
              value={value.when}
              label="割り当てのいつ・どこで"
              ownerTitle={ownerTitle}
              applets={applets}
              onChange={(when) => {
                if (when.scope !== 'default')
                  setValue({ ...value, when: { scope: when.scope, appletIds: when.appletIds } });
              }}
            />
          </div>
          <div className="shortcut-dialog-enabled">
            <span>元のキー入力をブロックする</span>
            <Toggle
              checked={value.blockOriginalInput !== false}
              disabled={value.when.scope !== 'global'}
              label="元のキー入力をブロックする"
              onChange={(blockOriginalInput) => setValue({ ...value, blockOriginalInput })}
            />
          </div>
          <SettingsHint as="small">
            {value.when.scope === 'global'
              ? 'OFFにすると、入力をWindowsやほかのアプリにも渡します。'
              : 'グローバルの割り当てで使用します。Windows標準キーの置き換えはグローバルを選んでください。'}
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

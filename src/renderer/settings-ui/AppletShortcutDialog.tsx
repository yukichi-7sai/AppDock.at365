import { useState } from 'react';
import { normalizeShortcut } from '../../shared/commands';
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
  const valid = !!value.key && (value.when.scope !== 'applets' || !!value.when.appletIds.length);
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

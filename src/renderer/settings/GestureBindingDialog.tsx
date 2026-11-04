import { touchpadId } from '../../shared/touchpad-gestures';
import { useConditionProcesses, conditionExclusions } from '../settings-ui/CommandConditionDetails';
import { useState } from 'react';
import { normalizeGesture, type GestureBinding } from '../../shared/gestures';
import { BindingEditDialog } from '../settings-ui/BindingEditDialog';
import { GestureInputPicker } from '../settings-ui/GestureInputPicker';
import { CommandConditionEditor } from '../settings-ui/CommandConditionEditor';
import { BindingEditorLayout, BindingEnabledControl } from '../settings-ui/BindingEditorLayout';

export function GestureBindingDialog({
  touchpad = false,
  initial,
  title,
  ownerTitle,
  applets,
  adding,
  onApply,
  onApplyAndEdit,
  onClose,
}: {
  touchpad?: boolean;
  initial: GestureBinding;
  title: string;
  ownerTitle?: string;
  applets: { id: string; title: string }[];
  adding: boolean;
  onApply(row: GestureBinding): void | Promise<unknown>;
  onApplyAndEdit?(row: GestureBinding): void | Promise<unknown>;
  onClose(): void;
}) {
  const [value, setValue] = useState(() => structuredClone(initial));
  const draft = useConditionProcesses(value.when);
  const { processes, processError } = draft;
  const valid =
    !!value.gesture &&
    value.gesture !== 'key:' &&
    !draft.excludedProcessError &&
    (value.when.scope !== 'applets' || !!value.when.appletIds.length) &&
    (value.when.scope !== 'exe' || (!processError && !!processes.length));
  const apply = (action: typeof onApply) =>
    action({
      ...value,
      gesture: touchpad ? touchpadId(value.gesture) : normalizeGesture(value.gesture),
      when: { ...conditionExclusions(value.when, draft), processes },
    });
  return (
    <BindingEditDialog
      className="binding-editor-dialog gesture-binding-dialog"
      title={title}
      adding={adding}
      valid={valid}
      onClose={onClose}
      footerStart={
        <BindingEnabledControl
          enabled={value.enabled}
          onChange={(enabled) => setValue({ ...value, enabled })}
        />
      }
      onApply={() => apply(onApply)}
      onApplyAndEdit={onApplyAndEdit ? () => apply(onApplyAndEdit) : undefined}
    >
      {(ready, setError) => (
        <BindingEditorLayout
          inputKey="gesture"
          input={
            <GestureInputPicker
              touchpad={touchpad}
              value={value.gesture}
              onChange={(gesture) => setValue({ ...value, gesture })}
              recordingReady={ready}
              setError={setError}
            />
          }
          conditions={
            <CommandConditionEditor
              when={value.when}
              onChange={(when) =>
                setValue({ ...value, when: { ...when, processes: when.processes ?? [] } })
              }
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

import { hostText } from '../../shared/i18n';
import { useHostTranslation } from '../HostTranslation';
import { touchpadGestureTypes, touchpadId } from '../../shared/touchpad-gestures';
import { SettingsField } from '../settings-ui/SettingsSections';
import { useConditionProcesses, conditionExclusions } from '../settings-ui/CommandConditionDetails';
import { useState } from 'react';
import {
  gestureTypes,
  moveDirections,
  normalizeGesture,
  type GestureBinding,
  gestureTitle,
} from '../../shared/gestures';
import { BindingEditDialog } from '../settings-ui/BindingEditDialog';
import { ShortcutCaptureField } from '../settings-ui/ShortcutCaptureField';
import { CommandConditionEditor } from '../settings-ui/CommandConditionEditor';
import { BindingEditorLayout, BindingEnabledControl } from '../settings-ui/BindingEditorLayout';

const families = [
  { id: 'move', title: hostText('settings.gestureBindingDialog.move'), icon: '↗' },
  { id: 'click', title: hostText('settings.gestureBindingDialog.click'), icon: '◉' },
  { id: 'wheel', title: hostText('settings.gestureBindingDialog.wheel'), icon: '↕' },
  { id: 'key', title: hostText('settings.gestureBindingDialog.keyboard'), icon: '⌨' },
];
const directionIcons = { up: '↑', down: '↓', left: '←', right: '→' } as const;
function MoveDirectionPicker({
  label,
  value,
  disabled,
  step,
  onChoose,
}: {
  label: string;
  value: string;
  disabled?: string;
  step: number;
  onChoose(direction: string): void;
}) {
  return (
    <div className="gesture-choice-grid gesture-choice-move" role="group" aria-label={label}>
      {moveDirections.map(([id, title]) => (
        <button
          key={id}
          data-testid={`gesture-direction:${step}:${id}`}
          aria-pressed={value === id}
          disabled={disabled === id}
          onClick={() => onChoose(id)}
        >
          <span aria-hidden="true">{directionIcons[id]}</span>
          {title}
        </button>
      ))}
    </div>
  );
}
export function GestureBindingDialog({
  touchpad = false,
  initial,
  title,
  ownerTitle,
  applets,
  adding,
  onApply,
  onClose,
}: {
  touchpad?: boolean;
  initial: GestureBinding;
  title: string;
  ownerTitle?: string;
  applets: { id: string; title: string }[];
  adding: boolean;
  onApply(row: GestureBinding): void;
  onClose(): void;
}) {
  const { t: translate } = useHostTranslation();
  const [value, setValue] = useState(() => structuredClone(initial));
  const [family, setFamily] = useState(
    initial.gesture.startsWith('key:') ? 'key' : initial.gesture.split('-')[0],
  );
  const [choices, setChoices] = useState<Record<string, string>>({
    move: 'move-up',
    click: 'click-left',
    wheel: 'wheel-up',
    key: 'key:',
    [family]: initial.gesture,
  });
  const initialMove = initial.gesture.startsWith('move-') ? initial.gesture : 'move-up';
  const [moveChoices, setMoveChoices] = useState<Record<number, string>>({
    1: 'move-up',
    2: 'move-up-down',
    [initialMove.split('-').length - 1]: initialMove,
  });
  const movement = choices.move.split('-').slice(1);
  const draft = useConditionProcesses(value.when);
  const { processes, processError } = draft;
  const choose = (gesture: string) => {
    setValue({ ...value, gesture });
    setChoices({ ...choices, [family]: gesture });
    if (gesture.startsWith('move-'))
      setMoveChoices({ ...moveChoices, [gesture.split('-').length - 1]: gesture });
  };
  const valid =
    !!value.gesture &&
    value.gesture !== 'key:' &&
    !draft.excludedProcessError &&
    (value.when.scope !== 'applets' || !!value.when.appletIds.length) &&
    (value.when.scope !== 'exe' || (!processError && !!processes.length));
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
      onApply={() =>
        onApply({
          ...value,
          gesture: touchpad ? touchpadId(value.gesture) : normalizeGesture(value.gesture),
          when: { ...conditionExclusions(value.when, draft), processes },
        })
      }
    >
      {(ready, setError) => (
        <BindingEditorLayout
          inputKey="gesture"
          input={
            <>
              {touchpad ? (
                <div className="touchpad-action-picker">
                  {(['three', 'four'] as const).map((fingers) => (
                    <SettingsField
                      key={fingers}
                      title={translate(`settings.bindingEditor.${fingers}`)}
                    >
                      <div
                        className="gesture-choice-grid touchpad-choice-grid"
                        role="group"
                        aria-label={translate(`settings.bindingEditor.${fingers}`)}
                      >
                        {touchpadGestureTypes
                          .filter(([id]) => id.startsWith(fingers + '.'))
                          .map(([id, title]) => {
                            const direction = id.split('.')[1] as
                              keyof typeof directionIcons | 'tap';
                            return (
                              <button
                                key={id}
                                data-testid={`touchpad-action:${id}`}
                                data-initial-focus={value.gesture === id ? '' : undefined}
                                aria-label={title}
                                aria-pressed={value.gesture === id}
                                onClick={() => choose(id)}
                              >
                                <span aria-hidden="true">
                                  {direction === 'tap' ? '●' : directionIcons[direction]}
                                </span>
                                {direction === 'tap'
                                  ? translate('settings.bindingEditor.tap')
                                  : moveDirections.find(([key]) => key === direction)?.[1]}
                              </button>
                            );
                          })}
                      </div>
                    </SettingsField>
                  ))}
                </div>
              ) : (
                <>
                  <SettingsField
                    title={translate('settings.gestureBindingDialog.kind')}
                    hint={translate('settings.gestureBindingDialog.hint')}
                  >
                    <div
                      className="gesture-family-picker"
                      role="group"
                      aria-label={translate('settings.gestureBindingDialog.kind')}
                    >
                      {families.map((item) => (
                        <button
                          key={item.id}
                          data-testid={`gesture-family:${item.id}`}
                          data-initial-focus={item.id === family ? '' : undefined}
                          aria-pressed={family === item.id}
                          onClick={() => {
                            setFamily(item.id);
                            setValue({ ...value, gesture: choices[item.id] });
                            setError('');
                          }}
                        >
                          <span aria-hidden="true">{item.icon}</span>
                          {item.title}
                        </button>
                      ))}
                    </div>
                  </SettingsField>
                  {family === 'key' ? (
                    <ShortcutCaptureField
                      allowWin={false}
                      label={translate('settings.gestureBindingDialog.key')}
                      value={value.gesture.slice(4)}
                      recordingReady={ready}
                      setError={setError}
                      onChange={(key) => choose('key:' + key)}
                    />
                  ) : family === 'move' ? (
                    <>
                      <SettingsField
                        title={translate('settings.gestureBindingDialog.stages')}
                        hint={translate('settings.gestureBindingDialog.stagesHint')}
                      >
                        <div
                          className="gesture-choice-grid gesture-step-picker"
                          role="group"
                          aria-label={translate('settings.gestureBindingDialog.stages')}
                        >
                          {[1, 2].map((steps) => (
                            <button
                              key={steps}
                              data-testid={`gesture-steps:${steps}`}
                              aria-pressed={movement.length === steps}
                              onClick={() => choose(moveChoices[steps])}
                            >
                              {translate('settings.gestureBindingDialog.stagesLabel', {
                                count: steps,
                              })}
                            </button>
                          ))}
                        </div>
                      </SettingsField>
                      {movement.length === 1 ? (
                        <SettingsField title={translate('settings.gestureBindingDialog.action')}>
                          <MoveDirectionPicker
                            step={1}
                            label={translate('settings.gestureBindingDialog.action')}
                            value={movement[0]}
                            onChoose={(direction) => choose('move-' + direction)}
                          />
                        </SettingsField>
                      ) : (
                        <div className="gesture-direction-sequence">
                          <SettingsField
                            title={translate('settings.gestureBindingDialog.firstDirection')}
                          >
                            <MoveDirectionPicker
                              step={1}
                              label={translate('settings.gestureBindingDialog.firstDirection')}
                              value={movement[0]}
                              onChoose={(direction) =>
                                choose(
                                  `move-${direction}-${direction === movement[1] ? movement[0] : movement[1]}`,
                                )
                              }
                            />
                          </SettingsField>
                          <SettingsField
                            title={translate('settings.gestureBindingDialog.nextDirection')}
                          >
                            <MoveDirectionPicker
                              step={2}
                              label={translate('settings.gestureBindingDialog.nextDirection')}
                              value={movement[1]}
                              disabled={movement[0]}
                              onChoose={(direction) => choose(`move-${movement[0]}-${direction}`)}
                            />
                          </SettingsField>
                        </div>
                      )}
                    </>
                  ) : (
                    <SettingsField
                      title={translate('settings.gestureBindingDialog.action')}
                      hint={translate('settings.gestureBindingDialog.actionHint')}
                    >
                      <div
                        className={`gesture-choice-grid gesture-choice-${family}`}
                        role="group"
                        aria-label={translate('settings.gestureBindingDialog.action')}
                      >
                        {gestureTypes
                          .filter(([id]) => id.startsWith(family + '-'))
                          .map(([id, label]) => (
                            <button
                              key={id}
                              data-testid={`gesture-action:${id}`}
                              aria-pressed={value.gesture === id}
                              onClick={() => choose(id)}
                            >
                              <span aria-hidden="true">
                                {id === 'wheel-up'
                                  ? '↑'
                                  : id === 'wheel-down'
                                    ? '↓'
                                    : id === 'click-left'
                                      ? '◧'
                                      : '▣'}
                              </span>
                              {label.replace(/^[↑↓←→] /, '')}
                            </button>
                          ))}
                      </div>
                    </SettingsField>
                  )}
                </>
              )}
              <div
                className="binding-input-summary"
                data-testid="binding-input-summary"
                aria-live="polite"
              >
                <small>{translate('settings.bindingEditor.selected')}</small>
                <strong>
                  {touchpad
                    ? touchpadGestureTypes.find(([id]) => id === value.gesture)?.[1]
                    : gestureTitle(value.gesture)}
                </strong>
              </div>
            </>
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

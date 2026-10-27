import { useState } from 'react';
import { hostText } from '../../shared/i18n';
import { gestureTypes, moveDirections, gestureTitle } from '../../shared/gestures';
import { touchpadGestureTypes } from '../../shared/touchpad-gestures';
import { useHostTranslation } from '../HostTranslation';
import { SettingsField } from './SettingsSections';
import { ShortcutCaptureField } from './ShortcutCaptureField';
import './binding-editor.css';
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
/** Shared gesture selection for individual assignments and trigger-owned command stacks. */
export function GestureInputPicker({
  touchpad = false,
  value,
  onChange,
  recordingReady: ready,
  setError,
}: {
  touchpad?: boolean;
  value: string;
  onChange(value: string): void;
  recordingReady: boolean;
  setError(error: string): void;
}) {
  const { t: translate } = useHostTranslation();
  const [family, setFamily] = useState(value.startsWith('key:') ? 'key' : value.split('-')[0]);
  const [choices, setChoices] = useState<Record<string, string>>({
    move: 'move-up',
    click: 'click-left',
    wheel: 'wheel-up',
    key: 'key:',
    [family]: value,
  });
  const initialMove = value.startsWith('move-') ? value : 'move-up';
  const [moveChoices, setMoveChoices] = useState<Record<number, string>>({
    1: 'move-up',
    2: 'move-up-down',
    [initialMove.split('-').length - 1]: initialMove,
  });
  const movement = choices.move.split('-').slice(1);
  const choose = (gesture: string) => {
    onChange(gesture);
    setChoices({ ...choices, [family]: gesture });
    if (gesture.startsWith('move-'))
      setMoveChoices({ ...moveChoices, [gesture.split('-').length - 1]: gesture });
  };
  return (
    <div className="gesture-input-picker" data-testid="gesture-input-picker">
      <>
        {touchpad ? (
          <div className="touchpad-action-picker">
            {(['three', 'four'] as const).map((fingers) => (
              <SettingsField key={fingers} title={translate(`settings.bindingEditor.${fingers}`)}>
                <div
                  className="gesture-choice-grid touchpad-choice-grid"
                  role="group"
                  aria-label={translate(`settings.bindingEditor.${fingers}`)}
                >
                  {touchpadGestureTypes
                    .filter(([id]) => id.startsWith(fingers + '.'))
                    .map(([id, title]) => {
                      const direction = id.split('.')[1] as keyof typeof directionIcons | 'tap';
                      return (
                        <button
                          key={id}
                          data-testid={`touchpad-action:${id}`}
                          data-initial-focus={value === id ? '' : undefined}
                          aria-label={title}
                          aria-pressed={value === id}
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
                      onChange(choices[item.id]);
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
                value={value.slice(4)}
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
                    <SettingsField title={translate('settings.gestureBindingDialog.nextDirection')}>
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
                        aria-pressed={value === id}
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
              ? touchpadGestureTypes.find(([id]) => id === value)?.[1]
              : gestureTitle(value)}
          </strong>
        </div>
      </>
    </div>
  );
}

import { hostText } from '../../shared/i18n';
import { useHostTranslation } from '../HostTranslation';
import { touchpadGestureTypes, touchpadId } from '../../shared/touchpad-gestures';
import { SettingsField } from '../settings-ui/SettingsSections';
import {
  CommandConditionDetails,
  useConditionProcesses,
} from '../settings-ui/CommandConditionDetails';
import { externalShortcutScopes } from '../../shared/keybindings';
import { useState } from 'react';
import {
  gestureTypes,
  moveDirections,
  normalizeGesture,
  type GestureBinding,
  type GestureScope,
} from '../../shared/gestures';
import { BindingEditDialog } from '../settings-ui/BindingEditDialog';
import { ShortcutCaptureField } from '../settings-ui/ShortcutCaptureField';
import { ShortcutConditionField } from '../settings-ui/ShortcutFields';
import { Toggle } from '../settings-ui/Toggle';

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
  onChoose,
}: {
  label: string;
  value: string;
  disabled?: string;
  onChoose(direction: string): void;
}) {
  return (
    <div className="gesture-choice-grid gesture-choice-move" role="group" aria-label={label}>
      {moveDirections.map(([id, title]) => (
        <button
          key={id}
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
  const { processText, setProcessText, processes, processError } = useConditionProcesses(
    value.when,
  );
  const choose = (gesture: string) => {
    setValue({ ...value, gesture });
    setChoices({ ...choices, [family]: gesture });
    if (gesture.startsWith('move-'))
      setMoveChoices({ ...moveChoices, [gesture.split('-').length - 1]: gesture });
  };
  const valid =
    !!value.gesture &&
    value.gesture !== 'key:' &&
    (value.when.scope !== 'applets' || !!value.when.appletIds.length) &&
    (value.when.scope !== 'exe' || (!processError && !!processes.length));
  const commonScope =
    value.when.scope === 'exe' || value.when.scope === 'browser' || value.when.scope === 'desktop'
      ? 'global'
      : value.when.scope;
  return (
    <BindingEditDialog
      className="gesture-binding-dialog"
      title={title}
      adding={adding}
      valid={valid}
      onClose={onClose}
      onApply={() =>
        onApply({
          ...value,
          gesture: touchpad ? touchpadId(value.gesture) : normalizeGesture(value.gesture),
          when: { ...value.when, processes },
        })
      }
    >
      {(ready, setError) => (
        <>
          {touchpad ? (
            <SettingsField title={translate('settings.gestureBindingDialog.action')}>
              <select
                aria-label={translate('settings.gestureBindingDialog.action')}
                data-initial-focus
                value={value.gesture}
                onChange={(e) => choose(e.target.value)}
              >
                {touchpadGestureTypes.map(([id, title]) => (
                  <option key={id} value={id}>
                    {title}
                  </option>
                ))}
              </select>
            </SettingsField>
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
                          aria-pressed={movement.length === steps}
                          onClick={() => choose(moveChoices[steps])}
                        >
                          {translate('settings.gestureBindingDialog.stagesLabel', { count: steps })}
                        </button>
                      ))}
                    </div>
                  </SettingsField>
                  {movement.length === 1 ? (
                    <SettingsField title={translate('settings.gestureBindingDialog.action')}>
                      <MoveDirectionPicker
                        label={translate('settings.gestureBindingDialog.action')}
                        value={movement[0]}
                        onChoose={(direction) => choose('move-' + direction)}
                      />
                    </SettingsField>
                  ) : (
                    <>
                      <SettingsField
                        title={translate('settings.gestureBindingDialog.firstDirection')}
                      >
                        <MoveDirectionPicker
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
                          label={translate('settings.gestureBindingDialog.nextDirection')}
                          value={movement[1]}
                          disabled={movement[0]}
                          onChoose={(direction) => choose(`move-${movement[0]}-${direction}`)}
                        />
                      </SettingsField>
                    </>
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
          <SettingsField
            title={translate('settings.gestureBindingDialog.scope')}
            hint={
              value.when.scope === 'browser'
                ? translate('settings.gestureBindingDialog.browserHint')
                : undefined
            }
          >
            <ShortcutConditionField
              value={{ scope: commonScope, appletIds: value.when.appletIds }}
              selectedScope={value.when.scope}
              extraScopes={externalShortcutScopes.slice()}
              onExtraScope={(scope) =>
                setValue({
                  ...value,
                  when: {
                    scope: scope as GestureScope,
                    appletIds: [],
                    processes: [],
                    ...(scope === 'exe' && value.when.excludeDesktop !== undefined
                      ? { excludeDesktop: value.when.excludeDesktop }
                      : {}),
                  },
                })
              }
              label={translate('settings.gestureBindingDialog.scopeLabel')}
              ownerTitle={ownerTitle}
              applets={applets}
              onChange={(when) => {
                if (when.scope !== 'default')
                  setValue({
                    ...value,
                    when: {
                      scope: when.scope,
                      appletIds: when.appletIds,
                      processes: [],
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
            onChange={(when) =>
              setValue({ ...value, when: { ...when, processes: when.processes ?? [] } })
            }
            processText={processText}
            setProcessText={setProcessText}
            processes={processes}
            processError={processError}
          />
          <SettingsField title={translate('settings.gestureBindingDialog.enabled')}>
            <Toggle
              checked={value.enabled}
              label={translate('settings.gestureBindingDialog.enabled')}
              onChange={(enabled) => setValue({ ...value, enabled })}
            />
          </SettingsField>
        </>
      )}
    </BindingEditDialog>
  );
}

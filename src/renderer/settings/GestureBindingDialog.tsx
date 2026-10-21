import { SettingsHint } from '../settings-ui/SettingsHint';
import { SettingsTextarea } from '../settings-ui/SettingsInput';
import { useState } from 'react';
import {
  gestureTypes,
  moveDirections,
  normalizeGesture,
  processNames,
  type GestureBinding,
  type GestureScope,
} from '../../shared/gestures';
import { BindingEditDialog } from '../settings-ui/BindingEditDialog';
import { ShortcutCaptureField } from '../settings-ui/ShortcutCaptureField';
import { ShortcutConditionField } from '../settings-ui/ShortcutFields';
import { Toggle } from '../settings-ui/Toggle';

const families = [
  { id: 'move', title: '移動', icon: '↗' },
  { id: 'click', title: 'クリック', icon: '◉' },
  { id: 'wheel', title: 'ホイール', icon: '↕' },
  { id: 'key', title: 'キーボード', icon: '⌨' },
];
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
          <span aria-hidden="true">{title.slice(0, 1)}</span>
          {title.slice(2)}
        </button>
      ))}
    </div>
  );
}
export function GestureBindingDialog({
  initial,
  title,
  ownerTitle,
  applets,
  adding,
  onApply,
  onClose,
}: {
  initial: GestureBinding;
  title: string;
  ownerTitle?: string;
  applets: { id: string; title: string }[];
  adding: boolean;
  onApply(row: GestureBinding): void;
  onClose(): void;
}) {
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
  const [processText, setProcessText] = useState(initial.when.processes.join(', '));
  const choose = (gesture: string) => {
    setValue({ ...value, gesture });
    setChoices({ ...choices, [family]: gesture });
    if (gesture.startsWith('move-'))
      setMoveChoices({ ...moveChoices, [gesture.split('-').length - 1]: gesture });
  };
  let processes: string[] = [];
  let processError = '';
  if (value.when.scope === 'exe') {
    try {
      processes = processNames(
        processText
          .split(/[,\n]/)
          .map((s) => s.trim())
          .filter(Boolean),
      );
    } catch {
      processError = 'パスを含めず、exe名をカンマまたは改行で区切ってください。';
    }
  }
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
          gesture: normalizeGesture(value.gesture),
          when: { ...value.when, processes },
        })
      }
    >
      {(ready, setError) => (
        <>
          <SettingsHint className="gesture-input-hint">
            右ボタンを押しながら行う操作を選びます。
          </SettingsHint>
          <div className="gesture-family-picker" role="group" aria-label="ジェスチャーの種類">
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
          {family === 'key' ? (
            <ShortcutCaptureField
              allowWin={false}
              label="ジェスチャーのキー"
              value={value.gesture.slice(4)}
              recordingReady={ready}
              setError={setError}
              onChange={(key) => choose('key:' + key)}
            />
          ) : family === 'move' ? (
            <>
              <div
                className="gesture-choice-grid gesture-step-picker"
                role="group"
                aria-label="移動の段階"
              >
                {[1, 2].map((steps) => (
                  <button
                    key={steps}
                    aria-pressed={movement.length === steps}
                    onClick={() => choose(moveChoices[steps])}
                  >
                    {steps}段階移動
                  </button>
                ))}
              </div>
              {movement.length === 1 ? (
                <MoveDirectionPicker
                  label="ジェスチャーの操作"
                  value={movement[0]}
                  onChoose={(direction) => choose('move-' + direction)}
                />
              ) : (
                <>
                  <span>最初の方向</span>
                  <MoveDirectionPicker
                    label="最初の方向"
                    value={movement[0]}
                    onChoose={(direction) =>
                      choose(
                        `move-${direction}-${direction === movement[1] ? movement[0] : movement[1]}`,
                      )
                    }
                  />
                  <span>次の方向</span>
                  <MoveDirectionPicker
                    label="次の方向"
                    value={movement[1]}
                    disabled={movement[0]}
                    onChoose={(direction) => choose(`move-${movement[0]}-${direction}`)}
                  />
                </>
              )}
            </>
          ) : (
            <div
              className={`gesture-choice-grid gesture-choice-${family}`}
              role="group"
              aria-label="ジェスチャーの操作"
            >
              {gestureTypes
                .filter(([id]) => id.startsWith(family + '-'))
                .map(([id, label]) => (
                  <button key={id} aria-pressed={value.gesture === id} onClick={() => choose(id)}>
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
          )}
          <SettingsHint className="shortcut-capture-hint">
            {family === 'move'
              ? '右ボタンを離したときに、動かした順番と一致する操作を実行します。同じ方向の移動は1段階、3方向目へ変えるとキャンセルします。'
              : '右ボタンを押したまま、この操作をしたときに実行します。'}
          </SettingsHint>
          <div className="shortcut-dialog-condition">
            <span>いつ・どこで</span>
            <div>
              <ShortcutConditionField
                value={{ scope: commonScope, appletIds: value.when.appletIds }}
                selectedScope={value.when.scope}
                extraScopes={[
                  { id: 'browser', title: 'Webブラウザ' },
                  { id: 'exe', title: '指定したexe' },
                  { id: 'desktop', title: 'デスクトップ', after: 'global' },
                ]}
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
                        processes: [],
                        ...(when.scope === 'global' && value.when.excludeDesktop !== undefined
                          ? { excludeDesktop: value.when.excludeDesktop }
                          : {}),
                      },
                    });
                }}
              />
              {['global', 'exe'].includes(value.when.scope) && (
                <label className="gesture-desktop-exclusion">
                  <input
                    type="checkbox"
                    checked={value.when.excludeDesktop ?? false}
                    onChange={(event) =>
                      setValue({
                        ...value,
                        when: { ...value.when, excludeDesktop: event.target.checked },
                      })
                    }
                  />
                  デスクトップを除外
                </label>
              )}
              {value.when.scope === 'browser' && (
                <SettingsHint as="small" className="gesture-condition-hint">
                  画面上部の「動作設定」で指定したブラウザに適用します。
                </SettingsHint>
              )}
              {value.when.scope === 'exe' && (
                <label className="gesture-processes">
                  <span>対象のexe名</span>
                  <SettingsTextarea
                    aria-label="対象のexe名"
                    rows={2}
                    value={processText}
                    placeholder="notepad.exe, explorer.exe"
                    onChange={(event) => setProcessText(event.target.value)}
                  />
                  <SettingsHint as="small">
                    複数指定した場合は、いずれかに一致すると実行します。
                  </SettingsHint>
                  {(processError || !processes.length) && (
                    <small role="alert">{processError || 'exe名を1件以上入力してください。'}</small>
                  )}
                </label>
              )}
            </div>
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

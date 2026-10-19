import { SettingsHint } from '../settings-ui/SettingsHint';
import { SettingsTextarea } from '../settings-ui/SettingsInput';
import { useState } from 'react';
import {
  gestureTypes,
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
  const [processText, setProcessText] = useState(initial.when.processes.join(', '));
  const choose = (gesture: string) => {
    setValue({ ...value, gesture });
    setChoices({ ...choices, [family]: gesture });
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
    value.when.scope === 'exe' || value.when.scope === 'browser' ? 'global' : value.when.scope;
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
                      {id.startsWith('move-')
                        ? label.slice(0, 1)
                        : id === 'wheel-up'
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
              ? '右ボタンを離したときに実行。途中で方向を変えるとキャンセルします。'
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
                ]}
                onExtraScope={(scope) =>
                  setValue({
                    ...value,
                    when: { scope: scope as GestureScope, appletIds: [], processes: [] },
                  })
                }
                label="割り当てのいつ・どこで"
                ownerTitle={ownerTitle}
                applets={applets}
                onChange={(when) => {
                  if (when.scope !== 'default')
                    setValue({
                      ...value,
                      when: { scope: when.scope, appletIds: when.appletIds, processes: [] },
                    });
                }}
              />
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

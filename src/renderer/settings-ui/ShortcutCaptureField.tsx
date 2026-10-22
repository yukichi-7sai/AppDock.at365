import { SettingsField } from './SettingsSections';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useSettingsControls } from './api';
import { normalizeShortcut, shortcutFromEvent } from '../../shared/commands';
import { inputKeysFromEvent, normalizeInputKeys } from '../../shared/input-command';
const specialGroups = [
  ['操作', ['Tab', 'Enter', 'Escape', 'Space', 'Backspace', 'Delete', 'Insert', 'Pause', 'Plus']],
  ['移動', ['Up', 'Down', 'Left', 'Right', 'Home', 'End', 'PageUp', 'PageDown']],
  ['ファンクション', Array.from({ length: 24 }, (_, i) => `F${i + 1}`)],
] as const;

export function ShortcutCaptureField({
  value,
  onChange,
  recordingReady,
  setError,
  label = 'ショートカットキー',
  mode = 'shortcut',
  allowWin = true,
}: {
  value: string;
  onChange(value: string): void;
  recordingReady: boolean;
  setError(error: string): void;
  label?: string;
  mode?: 'shortcut' | 'send';
  allowWin?: boolean;
}) {
  const controls = useSettingsControls();
  const id = useId();
  const recorder = useRef<HTMLButtonElement>(null);
  const [focused, setFocused] = useState(false);
  const [captureReady, setCaptureReady] = useState(false);
  const callbacks = useRef({ onChange, setError });
  callbacks.current = { onChange, setError };
  const [special, setSpecial] = useState(false);
  const normalize = mode === 'send' ? normalizeInputKeys : normalizeShortcut;
  const [modifiers, setModifiers] = useState<string[]>(() => {
    try {
      return normalize(value).split('+').slice(0, -1);
    } catch {
      return [];
    }
  });
  const supported = (key: string) => {
    try {
      if (!allowWin && key.split('+').includes('Win')) return false;
      normalize(key);
      return true;
    } catch {
      return false;
    }
  };
  useLayoutEffect(() => {
    recorder.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (mode !== 'shortcut' || !focused || !recordingReady) {
      setCaptureReady(false);
      return;
    }
    const token = crypto.randomUUID();
    let active = true;
    const unsubscribe = controls.onShortcutCaptured((event) => {
      if (!active || event.token !== token || document.activeElement !== recorder.current) return;
      try {
        const key = normalizeShortcut(event.key);
        if (!allowWin && key.split('+').includes('Win')) return;
        callbacks.current.onChange(key);
        setModifiers(key.split('+').slice(0, -1));
        callbacks.current.setError('');
      } catch (error) {
        callbacks.current.setError(String(error));
      }
    });
    void controls
      .setShortcutCapture({ token, active: true, allowWin })
      .then(() => {
        if (active) setCaptureReady(true);
      })
      .catch((error) => {
        if (active) callbacks.current.setError(String(error));
      });
    return () => {
      active = false;
      unsubscribe();
      setCaptureReady(false);
      void controls.setShortcutCapture({ token, active: false, allowWin }).catch(() => {});
    };
  }, [focused, recordingReady, mode, allowWin]);
  const choose = (key: string) => {
    onChange(key);
    setModifiers(key.split('+').slice(0, -1));
    setError('');
  };
  return (
    <SettingsField
      title={label}
      hint="Tabで次の項目へ・Escでキャンセル。これらのキーは特殊キーから選べます。"
      description={
        !recordingReady
          ? '入力を準備中…'
          : !focused
            ? 'クリックして入力'
            : mode === 'send' || captureReady
              ? '押して入力'
              : '入力を準備中…'
      }
    >
      <button
        ref={recorder}
        className="shortcut-capture"
        aria-label={`${label}を入力`}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(event) => {
          if (
            event.key === 'Escape' ||
            (event.key === 'Tab' && !event.ctrlKey && !event.altKey && !event.metaKey)
          )
            return;
          event.preventDefault();
          event.stopPropagation();
          if (
            !recordingReady ||
            event.repeat ||
            event.nativeEvent.isComposing ||
            event.nativeEvent.keyCode === 229
          )
            return;
          const key = (mode === 'send' ? inputKeysFromEvent : shortcutFromEvent)(event.nativeEvent);
          if (key && supported(key)) choose(key);
          else if (!['Control', 'Alt', 'Shift', 'Meta'].includes(event.key))
            setError('このキーは使用できません。特殊キーから選択することもできます。');
        }}
      >
        {value ? (
          value.split('+').map((part, index) => <kbd key={index}>{part}</kbd>)
        ) : (
          <span>キーの組み合わせを押してください</span>
        )}
      </button>
      <button
        className="shortcut-special-trigger"
        aria-expanded={special}
        aria-controls={`${id}-special`}
        onClick={() => setSpecial(!special)}
      >
        特殊キーから選ぶ <span aria-hidden="true">{special ? '−' : '＋'}</span>
      </button>
      {special && (
        <div className="shortcut-special-picker" id={`${id}-special`}>
          <div className="shortcut-modifiers" role="group" aria-label="特殊キーの修飾キー">
            {['Ctrl', 'Alt', 'Shift', ...(allowWin ? ['Win'] : [])].map((modifier) => (
              <button
                key={modifier}
                aria-pressed={modifiers.includes(modifier)}
                onClick={() =>
                  setModifiers(
                    modifiers.includes(modifier)
                      ? modifiers.filter((m) => m !== modifier)
                      : [...modifiers, modifier],
                  )
                }
              >
                {modifier}
              </button>
            ))}
            <small>組み合わせて選択</small>
          </div>
          <SettingsField title="英数字">
            <select
              aria-label="英数字のキーを選択"
              value=""
              onChange={(event) => {
                if (!event.target.value) return;
                choose(normalize([...modifiers, event.target.value].join('+')));
                setSpecial(false);
                recorder.current?.focus({ preventScroll: true });
              }}
            >
              <option value="">キーを選択…</option>
              {Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789').map((key) => (
                <option key={key}>{key}</option>
              ))}
            </select>
          </SettingsField>
          {specialGroups.map(([name, keys]) => (
            <div className="shortcut-special-group" key={name}>
              <small>{name}</small>
              <div>
                {keys.filter(supported).map((key) => (
                  <button
                    key={key}
                    aria-pressed={value === normalize([...modifiers, key].join('+'))}
                    onClick={() => {
                      choose(normalize([...modifiers, key].join('+')));
                      setSpecial(false);
                      recorder.current?.focus({ preventScroll: true });
                    }}
                  >
                    {key}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </SettingsField>
  );
}

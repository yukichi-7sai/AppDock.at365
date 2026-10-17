import { useId, useLayoutEffect, useRef, useState } from 'react';
import { normalizeShortcut, shortcutFromEvent } from '../../shared/commands';
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
}: {
  value: string;
  onChange(value: string): void;
  recordingReady: boolean;
  setError(error: string): void;
  label?: string;
}) {
  const id = useId();
  const recorder = useRef<HTMLButtonElement>(null);
  const [special, setSpecial] = useState(false);
  const [modifiers, setModifiers] = useState<string[]>(value.split('+').slice(0, -1));
  useLayoutEffect(() => {
    recorder.current?.focus({ preventScroll: true });
  }, []);
  const choose = (key: string) => {
    onChange(key);
    setModifiers(key.split('+').slice(0, -1));
    setError('');
  };
  return (
    <>
      {' '}
      <div className="shortcut-capture-label">
        <span>{label}</span>
        <small>{recordingReady ? '押して入力' : '入力を準備中…'}</small>
      </div>
      <button
        ref={recorder}
        className="shortcut-capture"
        aria-label={`${label}を入力`}
        aria-describedby={`${id}-hint`}
        onKeyDown={(event) => {
          if (event.key === 'Escape' || (event.key === 'Tab' && !event.ctrlKey && !event.altKey))
            return;
          event.preventDefault();
          event.stopPropagation();
          if (!recordingReady || event.repeat || event.nativeEvent.isComposing) return;
          const key = shortcutFromEvent(event.nativeEvent);
          if (key) choose(key);
          else if (!['Control', 'Alt', 'Shift'].includes(event.key))
            setError('このキーは使用できません。特殊キーから選択することもできます。');
        }}
      >
        {value ? (
          value.split('+').map((part, index) => <kbd key={index}>{part}</kbd>)
        ) : (
          <span>キーの組み合わせを押してください</span>
        )}
      </button>
      <p className="shortcut-capture-hint" id={`${id}-hint`}>
        Tabで次の項目へ・Escでキャンセル。これらのキーは特殊キーから選べます。
      </p>
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
            {['Ctrl', 'Alt', 'Shift'].map((modifier) => (
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
          {specialGroups.map(([name, keys]) => (
            <div className="shortcut-special-group" key={name}>
              <small>{name}</small>
              <div>
                {keys.map((key) => (
                  <button
                    key={key}
                    aria-pressed={value === normalizeShortcut([...modifiers, key].join('+'))}
                    onClick={() => {
                      choose(normalizeShortcut([...modifiers, key].join('+')));
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
    </>
  );
}

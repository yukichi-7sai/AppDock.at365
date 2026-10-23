import type { CustomCommandType } from './custom-commands';
import type { KeyStroke } from './commands';

/** The sending grammar mirrors SDK InputKeyChord, independently of trigger shortcuts. */
export function normalizeInputKeys(value: unknown): string {
  if (typeof value !== 'string' || !value.length || value.length > 100)
    throw Error('送信キーを100文字以内で指定してください。');
  const parts = value.split('+').map((part) => part.trim().toUpperCase());
  const key = parts.pop()!;
  const modifiers = parts.map(
    (part) =>
      ({
        CTRL: 'Ctrl',
        CONTROL: 'Ctrl',
        ALT: 'Alt',
        SHIFT: 'Shift',
        WIN: 'Win',
        WINDOWS: 'Win',
        META: 'Win',
      })[part],
  );
  if (modifiers.some((part) => !part) || new Set(modifiers).size !== modifiers.length)
    throw Error('送信キーの修飾キーを確認してください。');
  const special: Record<string, string> = {
    WIN: 'Win',
    WINDOWS: 'Win',
    META: 'Win',
    PAUSE: 'Pause',
    PRINTSCREEN: 'PrintScreen',
    PRTSCN: 'PrintScreen',
    VOLUMEMUTE: 'VolumeMute',
    VOLUMEDOWN: 'VolumeDown',
    VOLUMEUP: 'VolumeUp',
    MEDIANEXTTRACK: 'MediaNextTrack',
    MEDIAPREVTRACK: 'MediaPrevTrack',
    MEDIASTOP: 'MediaStop',
    MEDIAPLAYPAUSE: 'MediaPlayPause',
    PERIOD: 'Period',
    '.': 'Period',
    SEMICOLON: 'Semicolon',
    ';': 'Semicolon',
    SLASH: 'Slash',
    '/': 'Slash',
    PLUS: 'Plus',
    MINUS: 'Minus',
    '-': 'Minus',
    ENTER: 'Enter',
    TAB: 'Tab',
    ESC: 'Escape',
    ESCAPE: 'Escape',
    SPACE: 'Space',
    BACKSPACE: 'Backspace',
    DELETE: 'Delete',
    INSERT: 'Insert',
    HOME: 'Home',
    END: 'End',
    PAGEUP: 'PageUp',
    PAGEDOWN: 'PageDown',
    LEFT: 'Left',
    RIGHT: 'Right',
    UP: 'Up',
    DOWN: 'Down',
  };
  const normalized =
    /^[A-Z0-9]$/.test(key) || /^F([1-9]|1[0-9]|2[0-4])$/.test(key) ? key : special[key];
  if (!normalized) throw Error('未対応の送信キーです。例: Ctrl+Shift+T、Enter、Win+E');
  if (normalized === 'Win' && modifiers.length)
    throw Error('Win単独は修飾キーなしで指定してください。');
  return [
    ...['Ctrl', 'Alt', 'Shift', 'Win'].filter((part) => modifiers.includes(part)),
    normalized,
  ].join('+');
}

export function inputKeysFromEvent(event: KeyStroke): string | null {
  if (
    event.isComposing ||
    ['Control', 'Alt', 'Shift', 'Meta', 'Process', 'Dead', 'Unidentified'].includes(event.key)
  )
    return null;
  let key = event.key;
  if (key === '+') key = 'Plus';
  if (event.code?.startsWith('Digit') && event.shiftKey) key = event.code.slice(5);
  if (key === ' ') key = 'Space';
  if (key.startsWith('Arrow')) key = key.slice(5);
  try {
    return normalizeInputKeys(
      [
        ...(event.ctrlKey ? ['Ctrl'] : []),
        ...(event.altKey ? ['Alt'] : []),
        ...(event.shiftKey ? ['Shift'] : []),
        ...(event.metaKey ? ['Win'] : []),
        key,
      ].join('+'),
    );
  } catch {
    return null;
  }
}

export const inputCommandType: CustomCommandType = {
  id: 'appdock.input.sendKeys',
  title: 'キーを送信する',
  description: '単独キーや修飾キーとの組合せを、実行時の最前面へ送信します。',
  configVersion: 1,
  automation: true,
  configSchema: {
    type: 'object',
    properties: { keys: { type: 'string', minLength: 1, maxLength: 100 } },
    required: ['keys'],
    additionalProperties: false,
  },
  fields: [{ key: 'keys', title: '送信キー', type: 'string', default: 'Enter' }],
};

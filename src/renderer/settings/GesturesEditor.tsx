import type { Settings } from '../../shared/contracts';
import { defaultGestures } from '../../shared/gestures';
import { defaultTouchpadGestures } from '../../shared/touchpad-gestures';
import { InputBrowserOptions } from '../settings-ui/InputBrowserOptions';
import { GestureOptions } from './GestureOptions';
import { TouchpadOptions, type TouchpadEditorStatus } from './TouchpadOptions';

export function GesturesEditor({
  settings,
  onChange,
  touchpad,
}: {
  settings: Settings;
  onChange(value: Settings): void;
  touchpad?: TouchpadEditorStatus;
}) {
  if (touchpad) {
    const value = settings.touchpadGestures ?? defaultTouchpadGestures();
    return (
      <TouchpadOptions
        {...touchpad}
        value={value}
        change={(patch) => onChange({ ...settings, touchpadGestures: { ...value, ...patch } })}
        commonSettings={
          <InputBrowserOptions pageId="touchpad-gestures" settings={settings} onChange={onChange} />
        }
      />
    );
  }
  const value = settings.gestures ?? defaultGestures();
  return (
    <>
      <GestureOptions
        gestures={value}
        change={(patch) => onChange({ ...settings, gestures: { ...value, ...patch } })}
      />
      <InputBrowserOptions pageId="gestures" settings={settings} onChange={onChange} />
    </>
  );
}

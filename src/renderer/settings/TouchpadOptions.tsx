import { useHostTranslation } from '../HostTranslation';
import { useState } from 'react';
import {
  parseTouchpadGestures,
  touchpadGestureTypes,
  touchpadModifiers,
  touchpadTitle,
  type TouchpadConnection,
  type TouchpadGestureId,
  type TouchpadGestureSettings,
  type TouchpadSnapshot,
} from '../../shared/touchpad-gestures';
import { SettingsSection, SettingsField, SettingsChoice } from '../settings-ui/SettingsSections';
import { SettingsButton } from '../settings-ui/SettingsButton';
import { Toggle } from '../settings-ui/Toggle';
import { settingAnchor } from '../settings-ui/setting-anchor';
import { CommandExecutionModeField } from '../settings-ui/CommandExecutionModeField';
import { InputBrowserOptions } from '../settings-ui/InputBrowserOptions';

export interface TouchpadEditorStatus {
  snapshot?: TouchpadSnapshot;
  invoke(name: string, args?: unknown[]): Promise<unknown>;
}
export function TouchpadOptions({
  value,
  change,
  snapshot,
  invoke,
}: TouchpadEditorStatus & {
  value: TouchpadGestureSettings;
  change(patch: Partial<TouchpadGestureSettings>): void;
}) {
  const { t: translate } = useHostTranslation();
  const [errors, setErrors] = useState<Partial<Record<TouchpadGestureId, string>>>({});
  const changeConnection = (gesture: TouchpadGestureId, connection: TouchpadConnection) => {
    try {
      const next = parseTouchpadGestures({
        ...value,
        connections: { ...value.connections, [gesture]: connection },
      });
      setErrors((current) => ({ ...current, [gesture]: undefined }));
      change({ connections: next.connections });
    } catch (failure) {
      setErrors((current) => ({
        ...current,
        [gesture]: String(failure instanceof Error ? failure.message : failure),
      }));
    }
  };
  return (
    <>
      <SettingsSection data-testid="touchpad-gesture-enablement">
        <SettingsField
          title={translate('settings.touchpadOptions.enabled')}
          hint={translate('settings.touchpadOptions.enabledHint')}
          {...settingAnchor('touchpad-gestures', 'enabled')}
        >
          <Toggle
            label={translate('settings.touchpadOptions.enabled')}
            checked={value.enabled}
            disabled={snapshot?.busy}
            onChange={(enabled) => change({ enabled })}
          />
        </SettingsField>
      </SettingsSection>
      <SettingsSection
        title={translate('settings.touchpadOptions.behavior')}
        data-testid="touchpad-options"
        collapsible
        {...settingAnchor('touchpad-gestures', 'options')}
      >
        <CommandExecutionModeField
          pageId="touchpad-gestures"
          value={value.executionMode}
          onChange={(executionMode) => change({ executionMode })}
        />
        <InputBrowserOptions pageId="touchpad-gestures" value={value} onChange={change} />
      </SettingsSection>
      <SettingsSection
        title={translate('settings.touchpadOptions.connection')}
        data-testid="touchpad-connection"
        collapsible
        description={`${translate('settings.touchpadOptions.connectionHint')} ${translate('settings.touchpadOptions.keysHint')}`}
        {...settingAnchor('touchpad-gestures', 'connections')}
      >
        <SettingsField
          title={translate('settings.touchpadOptions.windowsSettings')}
          data-testid="touchpad-windows-settings"
        >
          <SettingsButton onClick={() => void invoke('touchpad.openWindows')}>
            {translate('settings.touchpadOptions.openWindowsSettings')}
          </SettingsButton>
        </SettingsField>
        {snapshot?.statuses
          .filter((row) => ['conflict', 'unconnected', 'unavailable', 'error'].includes(row.state))
          .map((row) => (
            <SettingsField
              key={row.gesture}
              title={touchpadTitle(row.gesture)}
              description={row.message ?? translate('settings.touchpadOptions.connectionRequired')}
            >
              <SettingsButton
                pending={snapshot.busy}
                disabled={!value.enabled}
                onClick={() => void invoke('touchpad.reconnect', [row.gesture])}
              >
                {translate('settings.touchpadOptions.reconnect')}
              </SettingsButton>
              <SettingsButton
                disabled={snapshot.busy}
                onClick={() => void invoke('touchpad.ignore', [row.gesture])}
              >
                {translate('settings.touchpadOptions.disconnect')}
              </SettingsButton>
              <SettingsButton
                disabled={snapshot.busy}
                onClick={() => void invoke('touchpad.clear', [row.gesture])}
              >
                {translate('settings.touchpadOptions.removeBindings')}
              </SettingsButton>
            </SettingsField>
          ))}
        {touchpadGestureTypes.map(([gesture, title]) => {
          const connection = value.connections[gesture];
          return (
            <SettingsField
              key={gesture}
              title={title}
              error={errors[gesture]}
              {...settingAnchor('touchpad-gestures', `connection.${gesture}`)}
            >
              <div
                className="settings-inline-choices"
                role="group"
                aria-label={translate('settings.touchpadOptions.keysLabel', { title: title })}
              >
                <select
                  aria-label={translate('settings.touchpadOptions.keyLabel', { title: title })}
                  value={connection.key}
                  disabled={snapshot?.busy}
                  onChange={(event) =>
                    changeConnection(gesture, { ...connection, key: event.target.value })
                  }
                >
                  {Array.from({ length: 12 }, (_, i) => `F${13 + i}`).map((key) => (
                    <option key={key}>{key}</option>
                  ))}
                </select>
                {touchpadModifiers.map((modifier) => (
                  <SettingsChoice
                    key={modifier}
                    label={modifier}
                    ariaLabel={translate('settings.touchpadOptions.modifierLabel', {
                      title: title,
                      modifier: modifier,
                    })}
                    disabled={snapshot?.busy}
                    checked={connection.modifiers.includes(modifier)}
                    onChange={(checked) =>
                      changeConnection(gesture, {
                        ...connection,
                        modifiers: checked
                          ? [...connection.modifiers, modifier]
                          : connection.modifiers.filter((item) => item !== modifier),
                      })
                    }
                  />
                ))}
              </div>
            </SettingsField>
          );
        })}
      </SettingsSection>
    </>
  );
}

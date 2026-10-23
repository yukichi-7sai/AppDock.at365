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
      <SettingsSection
        title="Windowsとの接続"
        description="判定のタイミングと移動量はWindowsの設定に従います。OFFにしたときや最後の割り当てを削除したときも、Windowsの設定はそのまま残ります。"
      >
        <SettingsField
          title="タッチパッドジェスチャーを使う"
          description="ONにすると、割り当てのあるジェスチャーを接続します。このPCだけの設定です。"
          {...settingAnchor('touchpad-gestures', 'enabled')}
        >
          <Toggle
            label="タッチパッドジェスチャーを使う"
            checked={value.enabled}
            disabled={snapshot?.busy}
            onChange={(enabled) => change({ enabled })}
          />
        </SettingsField>
        <SettingsButton onClick={() => void invoke('touchpad.openWindows')}>
          Windowsのタッチパッド設定を開く
        </SettingsButton>
        {snapshot?.statuses
          .filter((row) => ['conflict', 'unconnected', 'unavailable', 'error'].includes(row.state))
          .map((row) => (
            <SettingsField
              key={row.gesture}
              title={touchpadTitle(row.gesture)}
              description={row.message ?? 'Windowsとの接続を確認してください。'}
            >
              <SettingsButton
                pending={snapshot.busy}
                disabled={!value.enabled}
                onClick={() => void invoke('touchpad.reconnect', [row.gesture])}
              >
                Windowsの設定を再設定する
              </SettingsButton>
              <SettingsButton
                disabled={snapshot.busy}
                onClick={() => void invoke('touchpad.ignore', [row.gesture])}
              >
                AppDockでの制御をしない
              </SettingsButton>
              <SettingsButton
                disabled={snapshot.busy}
                onClick={() => void invoke('touchpad.clear', [row.gesture])}
              >
                このジェスチャーの割り当てを全部解除する
              </SettingsButton>
            </SettingsField>
          ))}
      </SettingsSection>
      <SettingsSection
        title="動作設定"
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
        title="接続用キー設定"
        collapsible
        description="割り当てのある接続用キーはAppDock専用になり、入力をブロックします。条件に一致しない場所では何もしません。同じキーを使うWindowsの機能などにも影響します。"
        {...settingAnchor('touchpad-gestures', 'connections')}
      >
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
                aria-label={`${title}の接続用キー設定`}
              >
                <select
                  aria-label={`${title}の接続用キー`}
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
                    ariaLabel={`${title}の${modifier}`}
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

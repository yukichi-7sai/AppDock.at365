import { hostSettingItem } from '../../shared/settings-catalog';
import { settingAnchor } from '../settings-ui/setting-anchor';
import { useState } from 'react';
import type { Settings, ExtensionSnapshot } from '../../shared/contracts';
import type { UiCommand } from '../../shared/commands';
import {
  defaultGestures,
  gestureTitle,
  gestureConditionLabel,
  applyGestureBinding,
  type GestureBinding,
} from '../../shared/gestures';
import { Toggle } from '../settings-ui/Toggle';
import { SettingsField } from '../settings-ui/SettingsSections';
import { CommandBindingList } from '../settings-ui/CommandBindingList';
import { CommandBindingToolbar } from '../settings-ui/CommandBindingToolbar';
import { GestureBindingDialog } from './GestureBindingDialog';
import { GestureOrderDialog } from './GestureOrderDialog';
import { GestureOptions } from './GestureOptions';

export function GesturesEditor({
  settings,
  onChange,
  commands,
  applets,
}: {
  settings: Settings;
  onChange(value: Settings): void;
  commands: UiCommand[];
  applets: ExtensionSnapshot[];
}) {
  const gestures = settings.gestures ?? defaultGestures();
  const bindings = gestures.bindings;
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [orderOpen, setOrderOpen] = useState(false);
  const change = (patch: Partial<typeof gestures>) =>
    onChange({ ...settings, gestures: { ...gestures, ...patch } });
  const targets = applets
    .filter((applet) => applet.pages?.length)
    .map((applet) => ({ id: applet.id, title: applet.displayName }));
  const known = new Map(commands.map((command) => [command.id, command]));
  for (const row of bindings)
    if (!known.has(row.command))
      known.set(row.command, {
        id: row.command,
        title: row.command,
        extension: '未確認のコマンド',
        available: false,
      });
  const catalog = [...known.values()].filter(
    (command) => !command.hidden || bindings.some((row) => row.command === command.id),
  );
  const conditionLabel = (row: GestureBinding, command?: UiCommand) =>
    gestureConditionLabel(row.when, command?.extensionId ? command.extension : undefined, targets);
  const terms = filter.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const visible = catalog.filter((command) => {
    const assigned = bindings.filter((row) => row.command === command.id);
    const text = [
      command.title,
      command.id,
      command.extension,
      ...assigned.map(
        (row) => `${gestureTitle(row.gesture)} ${row.gesture} ${conditionLabel(row, command)}`,
      ),
    ]
      .join(' ')
      .toLocaleLowerCase();
    return (
      terms.every((term) => text.includes(term)) &&
      (statusFilter === 'all' ||
        (statusFilter === 'assigned' ? !!assigned.length : !assigned.length))
    );
  });
  return (
    <section
      className="gestures-editor command-shortcuts"
      {...settingAnchor('gestures', 'gestures')}
      aria-label="マウスジェスチャー設定"
    >
      <CommandBindingToolbar
        inputName="ジェスチャー"
        count={catalog.length}
        visibleCount={visible.length}
        filter={filter}
        statusFilter={statusFilter}
        setFilter={setFilter}
        setStatusFilter={setStatusFilter}
        onOrder={() => setOrderOpen(true)}
      >
        <SettingsField
          className="gesture-settings-toggle"
          title={hostSettingItem('gestures', 'enabled').title}
          description="右ボタンを押しながら、移動・クリック・ホイール・キーで操作。"
          {...settingAnchor('gestures', 'enabled')}
        >
          <Toggle
            label={hostSettingItem('gestures', 'enabled').title}
            checked={gestures.enabled}
            onChange={(enabled) => change({ enabled })}
          />
        </SettingsField>
        <GestureOptions gestures={gestures} change={change} />
      </CommandBindingToolbar>
      {!gestures.enabled && (
        <p className="settings-help">
          現在、ジェスチャーは無効です。割り当てはそのまま編集できます。
        </p>
      )}
      {bindings.length >= 2000 && (
        <p role="status">
          割り当ては2000件までです。追加するには既存の割り当てを削除してください。
        </p>
      )}
      <CommandBindingList<GestureBinding>
        commands={visible}
        bindings={bindings}
        showProvider
        inputName="ジェスチャー"
        inputLabel={(row) => gestureTitle(row.gesture)}
        conditionLabel={conditionLabel}
        newBinding={(command) => ({
          id: crypto.randomUUID(),
          command: command.id,
          gesture: 'move-up',
          enabled: true,
          when: { scope: command.extensionId ? 'owner' : 'app', appletIds: [], processes: [] },
        })}
        applyBinding={(row, original) =>
          change({ bindings: applyGestureBinding(bindings, row, original) })
        }
        deleteBinding={(row) => change({ bindings: bindings.filter((item) => item.id !== row.id) })}
        renderEditor={(edit, apply, close) => (
          <GestureBindingDialog
            initial={edit.row}
            title={edit.title}
            ownerTitle={edit.ownerTitle}
            applets={targets}
            adding={edit.adding}
            onApply={apply}
            onClose={close}
          />
        )}
        renderOrder={(row, close) => (
          <GestureOrderDialog
            settings={settings}
            commands={catalog}
            applets={targets}
            initialGesture={row.gesture}
            onChange={onChange}
            onClose={close}
          />
        )}
      />
      {orderOpen && (
        <GestureOrderDialog
          settings={settings}
          commands={catalog}
          applets={targets}
          onChange={onChange}
          onClose={() => setOrderOpen(false)}
        />
      )}
    </section>
  );
}

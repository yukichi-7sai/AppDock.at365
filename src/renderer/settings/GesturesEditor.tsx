import { settingAnchor } from '../settings-ui/setting-anchor';
import { useEffect, useState } from 'react';
import type { Settings, ExtensionSnapshot } from '../../shared/contracts';
import type { UiCommand } from '../../shared/commands';
import { shortcutPageChoices } from '../../shared/shortcut-pages';
import {
  defaultGestures,
  gestureTitle,
  gestureConditionLabel,
  applyGestureBinding,
  type GestureBinding,
} from '../../shared/gestures';
import { CommandBindingList } from '../settings-ui/CommandBindingList';
import { CommandBindingToolbar } from '../settings-ui/CommandBindingToolbar';
import { CommandProviderFilter } from '../settings-ui/CommandProviderFilter';
import { GestureBindingDialog } from './GestureBindingDialog';
import { GestureOrderDialog } from './GestureOrderDialog';
import { GestureOptions } from './GestureOptions';
import { SettingsSection } from '../settings-ui/SettingsSections';
import {
  CommandTargetFilter,
  useCommandSettingsTarget,
} from '../settings-ui/CommandSettingsNavigation';

export function GesturesEditor({
  settings,
  onChange,
  commands,
  applets,
  provider,
  clearProvider,
}: {
  settings: Settings;
  onChange(value: Settings): void;
  commands: UiCommand[];
  applets: ExtensionSnapshot[];
  provider?: { id: string; title: string; request: number };
  clearProvider?(): void;
}) {
  const gestures = settings.gestures ?? defaultGestures();
  const target = useCommandSettingsTarget();
  const bindings = gestures.bindings;
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [orderOpen, setOrderOpen] = useState(false);
  useEffect(() => {
    setFilter('');
    setStatusFilter('all');
  }, [provider?.request, target?.request]);
  const change = (patch: Partial<typeof gestures>) =>
    onChange({ ...settings, gestures: { ...gestures, ...patch } });
  const targets = shortcutPageChoices(applets);
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
    if (target) return command.id === target.id;
    if (provider && command.extensionId !== provider.id) return false;
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
    <>
      <GestureOptions gestures={gestures} change={change} />
      <SettingsSection
        title="マウスジェスチャー割り当て"
        description={[
          !gestures.enabled ? '現在、ジェスチャーは無効です。割り当てはそのまま編集できます。' : '',
          bindings.length >= 2000
            ? '割り当ては2000件までです。追加するには既存の割り当てを削除してください。'
            : '',
        ]
          .filter(Boolean)
          .join(' ')}
        hint="＋で割り当てを追加します。"
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
          {target ? (
            <CommandTargetFilter />
          ) : (
            provider && <CommandProviderFilter title={provider.title} onClear={clearProvider} />
          )}
        </CommandBindingToolbar>
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
          deleteBinding={(row) =>
            change({ bindings: bindings.filter((item) => item.id !== row.id) })
          }
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
      </SettingsSection>
    </>
  );
}

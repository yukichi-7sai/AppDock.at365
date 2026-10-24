import { useHostTranslation } from '../HostTranslation';
import {
  defaultTouchpadGestures,
  touchpadTitle,
  touchpadGestureTypes,
  touchpadAsGestureSettings,
} from '../../shared/touchpad-gestures';
import { TouchpadOptions, type TouchpadEditorStatus } from './TouchpadOptions';
import { settingAnchor } from '../settings-ui/setting-anchor';
import { useState } from 'react';
import { useBindingCommandFilter } from '../settings-ui/useBindingCommandFilter';
import type { Settings, ExtensionSnapshot } from '../../shared/contracts';
import type { UiCommand } from '../../shared/commands';
import { shortcutPageChoices } from '../../shared/shortcut-pages';
import {
  defaultGestures,
  groupGestureBindings,
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
import { CommandListSection } from '../settings-ui/CommandListScroll';
import { CommandTargetFilter } from '../settings-ui/CommandSettingsNavigation';

export function GesturesEditor({
  settings,
  onChange,
  commands,
  applets,
  provider,
  clearProvider,
  touchpad,
}: {
  touchpad?: TouchpadEditorStatus;
  settings: Settings;
  onChange(value: Settings): void;
  commands: UiCommand[];
  applets: ExtensionSnapshot[];
  provider?: { id: string; title: string; request: number };
  clearProvider?(): void;
}) {
  const { t: translate } = useHostTranslation();
  const touchpadValue = settings.touchpadGestures ?? defaultTouchpadGestures();
  const gestures = touchpad
    ? touchpadAsGestureSettings(touchpadValue)
    : (settings.gestures ?? defaultGestures());
  const label = touchpad ? touchpadTitle : gestureTitle;
  const page = touchpad ? 'touchpad-gestures' : 'gestures';
  const {
    target,
    filter,
    setFilter,
    statusFilter,
    setStatusFilter,
    inputFilter,
    selectInput,
    clearInput,
  } = useBindingCommandFilter(provider?.request, clearProvider);
  const bindings = gestures.bindings;
  const displayBindings = touchpad
    ? touchpadGestureTypes.flatMap(([gesture]) => bindings.filter((row) => row.gesture === gesture))
    : groupGestureBindings(bindings).flatMap((group) => group.bindings);
  const [orderOpen, setOrderOpen] = useState(false);
  const change = (patch: Partial<typeof gestures>) =>
    onChange(
      touchpad
        ? { ...settings, touchpadGestures: { ...touchpadValue, ...patch } }
        : { ...settings, gestures: { ...gestures, ...patch } },
    );
  const targets = shortcutPageChoices(applets);
  const known = new Map(commands.map((command) => [command.id, command]));
  for (const row of bindings)
    if (!known.has(row.command))
      known.set(row.command, {
        id: row.command,
        title: row.command,
        extension: translate('settings.gesturesEditor.unknownCommand'),
        available: false,
      });
  const catalog = [...known.values()].filter(
    (command) => !command.hidden || bindings.some((row) => row.command === command.id),
  );
  const conditionLabel = (row: GestureBinding, command?: UiCommand) =>
    gestureConditionLabel(row.when, command?.extensionId ? command.extension : undefined, targets);
  const terms = filter.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const visible = catalog.filter((command) => {
    if (!inputFilter) {
      if (target) return command.id === target.id;
      if (provider && command.extensionId !== provider.id) return false;
    }
    const assigned = bindings.filter((row) => row.command === command.id);
    if (inputFilter && !assigned.some((row) => row.gesture === inputFilter.key)) return false;
    const text = [
      command.title,
      command.id,
      command.extension,
      ...assigned.map(
        (row) => `${label(row.gesture)} ${row.gesture} ${conditionLabel(row, command)}`,
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
      {touchpad ? (
        <TouchpadOptions value={touchpadValue} change={change} {...touchpad} />
      ) : (
        <GestureOptions gestures={gestures} change={change} />
      )}
      <CommandListSection
        title={
          touchpad
            ? translate('settings.gesturesEditor.touchpadBindings')
            : translate('settings.gesturesEditor.mouseBindings')
        }
        description={[
          !gestures.enabled ? translate('settings.gesturesEditor.disabled') : '',
          bindings.length >= 2000 ? translate('settings.gesturesEditor.limit') : '',
        ]
          .filter(Boolean)
          .join(' ')}
        className="gestures-editor command-shortcuts"
        {...settingAnchor(page, touchpad ? 'bindings' : 'gestures')}
        aria-label={
          touchpad
            ? translate('settings.gesturesEditor.touchpadSettings')
            : translate('settings.gesturesEditor.mouseSettings')
        }
      >
        <CommandBindingToolbar
          inputKind="gesture"
          inputName={translate('settings.gesturesEditor.inputName')}
          count={catalog.length}
          visibleCount={visible.length}
          filter={filter}
          statusFilter={statusFilter}
          setFilter={setFilter}
          setStatusFilter={setStatusFilter}
          onOrder={() => setOrderOpen(true)}
          inputFilter={inputFilter}
          clearInputFilter={clearInput}
        >
          {target ? (
            <CommandTargetFilter />
          ) : (
            provider && <CommandProviderFilter title={provider.title} onClear={clearProvider} />
          )}
        </CommandBindingToolbar>
        <CommandBindingList<GestureBinding>
          commands={visible}
          bindings={displayBindings}
          showProvider
          selectedInput={inputFilter?.key}
          onInputFilter={selectInput}
          inputName={translate('settings.gesturesEditor.inputName')}
          inputKey={(row) => row.gesture}
          inputLabel={(row) => label(row.gesture)}
          conditionLabel={conditionLabel}
          newBinding={(command) => ({
            id: crypto.randomUUID(),
            command: command.id,
            gesture: touchpad ? 'three.tap' : 'move-up',
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
              touchpad={!!touchpad}
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
              touchpad={!!touchpad}
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
            touchpad={!!touchpad}
            settings={settings}
            commands={catalog}
            applets={targets}
            onChange={onChange}
            onClose={() => setOrderOpen(false)}
          />
        )}
      </CommandListSection>
    </>
  );
}

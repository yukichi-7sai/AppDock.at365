import { useRef, useState, useEffect, useLayoutEffect } from 'react';
import { useHostTranslation } from '../HostTranslation';
import type { ExtensionSnapshot, GlobalHotKeyStatus, Settings } from '../../shared/contracts';
import type { UiCommand } from '../../shared/commands';
import {
  applyCommandTrigger,
  commandTriggerBinding,
  commandTriggerBindings,
  commandTriggerInput,
  commandTriggerKinds,
  deleteCommandTrigger,
  type CommandTriggerBinding,
  type CommandTriggerKind,
} from '../../shared/command-triggers';
import { externalShortcutScope, keybindingConditionLabel } from '../../shared/keybindings';
import { gestureConditionLabel, gestureTitle } from '../../shared/gestures';
import { touchpadTitle } from '../../shared/touchpad-gestures';
import { shortcutPageChoices } from '../../shared/shortcut-pages';
import { Icon } from '../../shared/ui-icons';
import { CommandBindingList, type BindingEdit } from '../settings-ui/CommandBindingList';
import { CommandBindingToolbar } from '../settings-ui/CommandBindingToolbar';
import { CommandListSection } from '../settings-ui/CommandListScroll';
import { CommandTargetFilter } from '../settings-ui/CommandSettingsNavigation';
import { CommandProviderFilter } from '../settings-ui/CommandProviderFilter';
import { useBindingCommandFilter } from '../settings-ui/useBindingCommandFilter';
import { useSettingsControls } from '../settings-ui/api';
import { useSettingsFeedback } from '../settings-ui/SettingsStatus';
import { settingAnchor } from '../settings-ui/setting-anchor';
import { AppletShortcutDialog } from '../settings-ui/AppletShortcutDialog';
import { GestureBindingDialog } from './GestureBindingDialog';
import { TriggerStackDialog, TriggerStackSettings } from './TriggerStackSettings';
import { triggerStacks } from '../../shared/trigger-stacks';
import type { SettingsPageAuxiliary } from '../../shared/settings-page';

const kindKeys = {
  shortcuts: 'settings.commandTriggers.keys',
  gestures: 'settings.commandTriggers.mouse',
  'touchpad-gestures': 'settings.commandTriggers.touchpad',
} as const;
const filterKindKeys = {
  shortcuts: 'settings.commandTriggers.keyFilter',
  gestures: 'settings.commandTriggers.mouseFilter',
  'touchpad-gestures': 'settings.commandTriggers.touchFilter',
} as const;
const triggerKindKeys = {
  shortcuts: 'settings.commandTriggers.keyTrigger',
  gestures: 'settings.commandTriggers.mouseTrigger',
  'touchpad-gestures': 'settings.commandTriggers.touchpadTrigger',
} as const;
const kindIcons = {
  shortcuts: 'keyboard',
  gestures: 'mouse',
  'touchpad-gestures': 'touchpad',
} as const;
function newTrigger(
  kind: CommandTriggerKind,
  command: Pick<UiCommand, 'id'>,
  scope: 'owner' | 'app',
) {
  const common = { id: crypto.randomUUID(), command: command.id, enabled: true };
  const when = { scope, appletIds: [] };
  return kind === 'shortcuts'
    ? commandTriggerBinding(kind, { ...common, key: '', when })
    : commandTriggerBinding(kind, {
        ...common,
        gesture: kind === 'gestures' ? 'move-up' : 'three.tap',
        when: { ...when, processes: [] },
      });
}

function TriggerBindingDialog({
  edit,
  applets,
  apply,
  close,
}: {
  edit: BindingEdit<CommandTriggerBinding>;
  applets: { id: string; title: string }[];
  apply(row: CommandTriggerBinding): void;
  close(): void;
}) {
  const row = edit.row;
  const common = {
    title: edit.title,
    ownerTitle: edit.ownerTitle,
    applets,
    adding: edit.adding,
    onClose: close,
  };
  return row.kind === 'shortcuts' ? (
    <AppletShortcutDialog
      {...common}
      initial={row.binding}
      onApply={(binding) => apply(commandTriggerBinding('shortcuts', binding))}
    />
  ) : (
    <GestureBindingDialog
      {...common}
      touchpad={row.kind === 'touchpad-gestures'}
      initial={row.binding}
      onApply={(binding) => apply(commandTriggerBinding(row.kind, binding))}
    />
  );
}

type TriggerTab = 'commands' | CommandTriggerKind;
const triggerTabs: readonly TriggerTab[] = ['commands', ...commandTriggerKinds];

/** Command reverse lookup and the three dedicated trigger-stack lists share one settings page. */
export function CommandTriggersEditor({
  settings,
  onChange,
  commands,
  applets,
  statuses,
  provider,
  clearProvider,
  busy = false,
  inheritedModes,
}: {
  settings: Settings;
  onChange(settings: Settings): void;
  commands: UiCommand[];
  applets: ExtensionSnapshot[];
  statuses: GlobalHotKeyStatus[];
  provider?: { id: string; title: string; request: number };
  clearProvider?(): void;
  busy?: boolean;
  inheritedModes?: SettingsPageAuxiliary['triggerExecutionModes'];
}) {
  const { t } = useHostTranslation();
  const controls = useSettingsControls();
  const filters = useBindingCommandFilter(provider, clearProvider);
  const [tab, setTab] = useState<TriggerTab>('commands');
  const root = useRef<HTMLDivElement>(null);
  const positions = useRef<Partial<Record<TriggerTab, { left: number; top: number }>>>({});
  const selectTab = (value: TriggerTab) => {
    if (value === tab) return;
    const body = root.current?.closest<HTMLElement>('.settings-body');
    if (body) positions.current[tab] = { left: body.scrollLeft, top: body.scrollTop };
    setTab(value);
  };
  useLayoutEffect(() => {
    if (provider?.request !== undefined || filters.target?.request !== undefined) {
      delete positions.current.commands;
      selectTab('commands');
    }
  }, [provider?.request, filters.target?.request]);
  useLayoutEffect(() => {
    const body = root.current?.closest<HTMLElement>('.settings-body');
    const position = positions.current[tab];
    if (body) {
      body.scrollLeft = position?.left ?? 0;
      body.scrollTop = position?.top ?? 0;
    }
  }, [tab]);
  const [kinds, setKinds] = useState<readonly CommandTriggerKind[]>(commandTriggerKinds);
  const [error, setError] = useState('');
  const lastStatuses = useRef(statuses);
  useEffect(() => {
    if (statuses.length) lastStatuses.current = statuses;
  }, [statuses]);
  const targets = shortcutPageChoices(applets);
  const allRows = commandTriggerBindings(settings);
  const rows = allRows.filter((row) => kinds.includes(row.kind));
  const known = new Map(commands.map((command) => [command.id, command]));
  for (const row of allRows)
    if (!known.has(row.command))
      known.set(row.command, {
        id: row.command,
        title: row.command,
        extension: t('settings.gesturesEditor.unknownCommand'),
        available: false,
      });
  const catalog = [...known.values()].filter(
    (command) => !command.hidden || allRows.some((row) => row.command === command.id),
  );
  const inputText = (row: CommandTriggerBinding) =>
    row.kind === 'shortcuts'
      ? row.binding.key
      : row.kind === 'gestures'
        ? gestureTitle(row.binding.gesture)
        : touchpadTitle(row.binding.gesture);
  const inputLabel = (row: CommandTriggerBinding) =>
    t('settings.commandTriggers.input', {
      kind: t(kindKeys[row.kind]),
      input: inputText(row),
    });
  const conditionLabel = (row: CommandTriggerBinding, command: UiCommand) =>
    row.kind === 'shortcuts'
      ? keybindingConditionLabel(
          row.binding.when,
          command.extensionId ? command.extension : undefined,
          targets,
        ) +
        (externalShortcutScope(row.binding.when.scope)
          ? row.binding.blockOriginalInput === false
            ? t('settings.shortcutCommandList.pass')
            : t('settings.shortcutCommandList.block')
          : '')
      : gestureConditionLabel(
          row.binding.when,
          command.extensionId ? command.extension : undefined,
          targets,
        );
  const statusError = (row: CommandTriggerBinding) =>
    row.kind === 'shortcuts' &&
    row.enabled &&
    externalShortcutScope(row.binding.when.scope) &&
    known.get(row.command)?.available
      ? (statuses.length ? statuses : lastStatuses.current).find(
          (status) => status.commandId === row.command && status.shortcut === row.binding.key,
        )?.error
      : undefined;
  const terms = filters.filter.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const visible = catalog.filter((command) => {
    if (!kinds.length) return false;
    if (!filters.inputFilter) {
      if (filters.target && command.id !== filters.target.id) return false;
      if (filters.provider && command.extensionId !== filters.provider.id) return false;
    }
    const assigned = rows.filter((row) => row.command === command.id);
    if (
      filters.inputFilter &&
      !assigned.some((row) => commandTriggerInput(row) === filters.inputFilter!.key)
    )
      return false;
    const text = [
      command.title,
      command.id,
      command.extension,
      ...assigned.map((row) => `${inputLabel(row)} ${conditionLabel(row, command)}`),
    ]
      .join(' ')
      .toLocaleLowerCase();
    return (
      terms.every((term) => text.includes(term)) &&
      (filters.statusFilter === 'all' ||
        (filters.statusFilter === 'assigned' && !!assigned.length) ||
        (filters.statusFilter === 'unassigned' && !assigned.length) ||
        (filters.statusFilter === 'conflict' && assigned.some(statusError)))
    );
  });
  useSettingsFeedback({ error: tab === 'commands' ? error : '' });
  const commandList = (
    <CommandListSection
      title={t('settings.commandTriggers.title')}
      className="command-triggers-editor command-shortcuts"
      data-testid="command-triggers-list"
      {...settingAnchor('command-triggers', 'bindings')}
    >
      <CommandBindingToolbar
        inputKind="trigger"
        inputName={t('settings.commandTriggers.trigger')}
        count={catalog.length}
        visibleCount={visible.length}
        filter={filters.filter}
        statusFilter={filters.statusFilter}
        setFilter={filters.setFilter}
        setStatusFilter={filters.setStatusFilter}
        showRegistrationErrors
        inputFilter={filters.inputFilter}
        clearInputFilter={filters.clearInput}
        hasAdditionalFilters={kinds.length !== commandTriggerKinds.length}
        clearAdditionalFilters={() => setKinds(commandTriggerKinds)}
        filters={
          <div
            className="binding-kind-filters"
            role="group"
            aria-label={t('settings.commandTriggers.kindFilter')}
          >
            {commandTriggerKinds.map((value) => (
              <button
                key={value}
                type="button"
                data-testid={`command-trigger-filter:${value}`}
                title={t(kindKeys[value])}
                aria-label={t(kindKeys[value])}
                className="settings-list-icon"
                aria-pressed={kinds.includes(value)}
                onClick={() => {
                  setKinds(
                    kinds.includes(value)
                      ? kinds.filter((kind) => kind !== value)
                      : [...kinds, value],
                  );
                }}
              >
                <Icon name={kindIcons[value]} />
              </button>
            ))}
          </div>
        }
      >
        {filters.target ? (
          <CommandTargetFilter />
        ) : (
          filters.provider && (
            <CommandProviderFilter title={filters.provider.title} onClear={filters.clearProvider} />
          )
        )}
      </CommandBindingToolbar>
      <CommandBindingList<CommandTriggerBinding>
        commands={visible}
        bindings={rows}
        showProvider
        showNavigation={false}
        separateConditions
        triggerStackActions
        followCommands
        addOptions={commandTriggerKinds.map((kind) => ({
          id: kind,
          title: t('settings.commandTriggers.addType', { kind: t(triggerKindKeys[kind]) }),
          label: (command) =>
            t('settings.commandTriggers.addForCommand', {
              title: command.title,
              kind: t(triggerKindKeys[kind]),
            }),
          icon: <Icon name={kindIcons[kind]} />,
          create: (command) => newTrigger(kind, command, command.extensionId ? 'owner' : 'app'),
        }))}
        inputName={t('settings.commandTriggers.trigger')}
        inputKey={commandTriggerInput}
        inputLabel={inputLabel}
        renderInput={(row) => (
          <kbd className="binding-trigger-mark" data-trigger-kind={row.kind}>
            <span className="binding-trigger-icon" title={t(kindKeys[row.kind])} aria-hidden="true">
              <Icon name={kindIcons[row.kind]} />
            </span>
            <span>{inputText(row)}</span>
          </kbd>
        )}
        conditionLabel={conditionLabel}
        selectedInput={filters.inputFilter?.key}
        onInputFilter={filters.selectInput}
        selectedProvider={filters.provider?.id}
        onProviderFilter={filters.selectProvider}
        newBinding={(command) =>
          newTrigger(
            kinds.length === 1 ? kinds[0] : 'shortcuts',
            command,
            command.extensionId ? 'owner' : 'app',
          )
        }
        applyBinding={(row, original) => onChange(applyCommandTrigger(settings, row, original))}
        deleteBinding={(row) => onChange(deleteCommandTrigger(settings, row))}
        statusError={statusError}
        onRetry={() =>
          void controls.retryGlobalHotKeys().catch((reason) => setError(String(reason)))
        }
        renderEditor={(edit, apply, close) =>
          edit.adding ? (
            <TriggerBindingDialog edit={edit} applets={targets} apply={apply} close={close} />
          ) : (
            <TriggerStackDialog
              settings={settings}
              inheritedMode={inheritedModes?.[edit.row.kind]}
              initial={triggerStacks(settings, edit.row.kind).find(
                (stack) =>
                  stack.input ===
                  ('key' in edit.row.binding ? edit.row.binding.key : edit.row.binding.gesture),
              )!}
              commands={catalog}
              applets={targets}
              initialEntryId={edit.row.binding.id}
              onChange={onChange}
              onClose={close}
            />
          )
        }
        renderOrder={(row, close) => (
          <TriggerStackDialog
            settings={settings}
            inheritedMode={inheritedModes?.[row.kind]}
            initial={triggerStacks(settings, row.kind).find(
              (stack) =>
                stack.input === ('key' in row.binding ? row.binding.key : row.binding.gesture),
            )!}
            commands={catalog}
            applets={targets}
            initialEntryId={row.binding.id}
            onChange={onChange}
            onClose={close}
          />
        )}
      />
    </CommandListSection>
  );
  return (
    <>
      <div
        ref={root}
        className="command-trigger-tabs"
        role="group"
        aria-label={t('settings.commandTriggers.view')}
        data-testid="command-trigger-tabs"
      >
        {triggerTabs.map((value) => (
          <button
            key={value}
            type="button"
            data-testid={'command-trigger-tab:' + value}
            aria-pressed={tab === value}
            onClick={() => selectTab(value)}
          >
            {t(value === 'commands' ? 'settings.commandTriggers.commands' : kindKeys[value])}
          </button>
        ))}
      </div>
      {tab === 'commands' ? (
        commandList
      ) : (
        <TriggerStackSettings
          key={tab}
          kind={tab}
          inheritedMode={inheritedModes?.[tab]}
          settings={settings}
          commands={commands}
          applets={applets}
          onChange={onChange}
          busy={busy}
        />
      )}
    </>
  );
}

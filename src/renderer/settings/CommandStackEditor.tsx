import { useEffect, useRef, useState } from 'react';
import type { UiCommand } from '../../shared/commands';
import type { CommandStackEntry } from '../../shared/command-stacks';
import { keybindingConditionLabel, externalShortcutScope } from '../../shared/keybindings';
import { useHostTranslation } from '../HostTranslation';
import { SettingsChoice, SettingsField } from '../settings-ui/SettingsSections';
import { CommandPicker } from '../settings-ui/CommandPicker';
import { CommandConditionEditor } from '../settings-ui/CommandConditionEditor';
import { conditionExclusions, useConditionProcesses } from '../settings-ui/CommandConditionDetails';
import { Icon } from '../../shared/ui-icons';
import './command-stacks.css';

export function StackExecutionMode({
  value,
  onChange,
  inherited,
}: {
  value: 'inherit' | 'first' | 'all';
  onChange(value: 'inherit' | 'first' | 'all'): void;
  inherited?: 'first' | 'all';
}) {
  const { t } = useHostTranslation();
  return (
    <SettingsField title={t('settings.commandStacks.mode')}>
      <select
        aria-label={t('settings.commandStacks.mode')}
        data-testid="stack-execution-mode"
        value={value}
        onChange={(event) => onChange(event.target.value as typeof value)}
      >
        {inherited && (
          <option value="inherit">
            {t('settings.inputExecution.inherit')} (
            {t(`settings.commandExecutionModeField.${inherited}`)})
          </option>
        )}
        <option value="first">{t('settings.commandExecutionModeField.first')}</option>
        <option value="all">{t('settings.commandExecutionModeField.all')}</option>
      </select>
    </SettingsField>
  );
}

function EntryConditions({
  entry,
  command,
  applets,
  onChange,
  onValidity,
  keyboard,
}: {
  entry: CommandStackEntry;
  command?: UiCommand;
  applets: { id: string; title: string }[];
  onChange(entry: CommandStackEntry): void;
  onValidity(valid: boolean): void;
  keyboard: boolean;
}) {
  const { t } = useHostTranslation();
  const draft = useConditionProcesses(entry.when);
  const when = {
    ...conditionExclusions(entry.when, draft),
    ...(entry.when.scope === 'exe' ? { processes: draft.processes } : {}),
  };
  const serialized = JSON.stringify(when);
  const valid =
    !draft.processError &&
    !draft.excludedProcessError &&
    (when.scope !== 'exe' || !!draft.processes.length) &&
    (when.scope !== 'applets' || !!when.appletIds.length);
  const callbacks = useRef({ entry, onChange, onValidity });
  callbacks.current = { entry, onChange, onValidity };
  useEffect(() => {
    const current = callbacks.current;
    if (valid && JSON.stringify(current.entry.when) !== serialized)
      current.onChange({ ...current.entry, when: JSON.parse(serialized) });
  }, [serialized, valid]);
  useEffect(() => callbacks.current.onValidity(valid), [valid]);
  return (
    <>
      <strong className="stack-selected-title">{command?.title ?? entry.command}</strong>
      <SettingsChoice
        label={t('settings.customCommandsSettings.enabled')}
        checked={entry.enabled}
        onChange={(enabled) => onChange({ ...entry, enabled })}
      />
      <CommandConditionEditor
        when={entry.when}
        onChange={(next) => onChange({ ...entry, when: next })}
        draft={draft}
        ownerTitle={command?.extensionId ? command.extension : undefined}
        applets={applets}
      />
      {keyboard && externalShortcutScope(entry.when.scope) && (
        <SettingsChoice
          label={t('settings.appletShortcutDialog.blockOriginal')}
          checked={entry.blockOriginalInput !== false}
          onChange={(blockOriginalInput) => onChange({ ...entry, blockOriginalInput })}
        />
      )}
    </>
  );
}

/** The same ordered entries and condition editor serve named and trigger-owned stacks. */
export function CommandStackEditor({
  entries,
  onChange,
  commands,
  applets,
  onValidity,
  keyboard = false,
  excludeId,
  initialEntryId,
  maxEntries = 256,
}: {
  entries: CommandStackEntry[];
  onChange(entries: CommandStackEntry[]): void;
  commands: UiCommand[];
  applets: { id: string; title: string }[];
  onValidity(valid: boolean): void;
  keyboard?: boolean;
  excludeId?: string;
  initialEntryId?: string;
  maxEntries?: number;
}) {
  const { t } = useHostTranslation();
  const [selected, setSelected] = useState(initialEntryId ?? entries[0]?.id);
  const [picking, setPicking] = useState(false);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const dragged = useRef<string | null>(null);
  const list = useRef<HTMLOListElement>(null);
  const active = entries.some((row) => row.id === selected) ? selected : entries[0]?.id;
  const known = new Map(commands.map((command) => [command.id, command]));
  const valid = entries.every((row) => !errors[row.id]);
  const validity = useRef(onValidity);
  validity.current = onValidity;
  useEffect(() => validity.current(valid), [valid]);
  function move(from: string, to: string) {
    const source = entries.findIndex((row) => row.id === from),
      target = entries.findIndex((row) => row.id === to);
    if (source < 0 || target < 0 || source === target) return;
    const next = entries.slice();
    next.splice(target, 0, next.splice(source, 1)[0]);
    onChange(next);
    setSelected(from);
    requestAnimationFrame(() => {
      const handle = list.current?.querySelector<HTMLElement>(
        `[data-stack-entry="${CSS.escape(from)}"] .stack-drag`,
      );
      handle?.focus({ preventScroll: true });
      handle?.scrollIntoView({ block: 'nearest' });
    });
  }
  return (
    <div className="command-stack-editor" data-testid="command-stack-editor">
      <div className="stack-list-panel">
        <div className="stack-list-heading">
          <strong>{t('settings.commandStacks.entries')}</strong>
          <button
            type="button"
            data-testid="stack-add-command"
            disabled={entries.length >= maxEntries}
            onClick={() => setPicking(true)}
          >
            ＋ {t('settings.commandStacks.add')}
          </button>
        </div>
        <ol
          ref={list}
          className="stack-entry-list"
          aria-label={t('settings.commandStacks.entries')}
        >
          {!entries.length && (
            <li className="muted stack-empty">{t('settings.commandStacks.empty')}</li>
          )}
          {entries.map((row, index) => {
            const command = known.get(row.command);
            const detail = keybindingConditionLabel(
              row.when,
              command?.extensionId ? command.extension : undefined,
              applets,
            );
            return (
              <li
                key={row.id}
                data-testid="stack-entry"
                data-stack-entry={row.id}
                data-selected={active === row.id}
                onDragOver={(event) => {
                  if (dragged.current) event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (dragged.current) move(dragged.current, row.id);
                  dragged.current = null;
                }}
              >
                <button
                  type="button"
                  className="stack-drag"
                  draggable
                  aria-label={t('settings.commandStacks.move')}
                  title={t('settings.bindingOrderDialog.dragHint')}
                  onDragStart={(event) => {
                    dragged.current = row.id;
                    event.dataTransfer.setData('text/plain', row.id);
                    event.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragEnd={() => {
                    dragged.current = null;
                  }}
                  onKeyDown={(event) => {
                    if (
                      event.nativeEvent.isComposing ||
                      event.nativeEvent.keyCode === 229 ||
                      event.altKey ||
                      event.ctrlKey ||
                      event.metaKey ||
                      event.shiftKey
                    )
                      return;
                    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                      event.preventDefault();
                      const target = entries[index + (event.key === 'ArrowUp' ? -1 : 1)];
                      if (target) move(row.id, target.id);
                    }
                  }}
                >
                  ⠿
                </button>
                <button
                  type="button"
                  className="stack-entry-select"
                  aria-pressed={active === row.id}
                  onClick={() => setSelected(row.id)}
                >
                  <strong>
                    {index + 1}. {command?.title ?? row.command}
                  </strong>
                  <small title={detail}>{detail}</small>
                  {(!row.enabled || !command?.available || errors[row.id]) && (
                    <small>
                      {errors[row.id]
                        ? t('settings.commandStacks.invalid')
                        : !row.enabled
                          ? t('settings.bindingOrderDialog.disabled')
                          : t('settings.bindingOrderDialog.unavailable')}
                    </small>
                  )}
                </button>
                <button
                  type="button"
                  className="settings-list-icon"
                  aria-label={t('settings.commandStacks.remove')}
                  onClick={() => onChange(entries.filter((item) => item.id !== row.id))}
                >
                  <Icon name="trash" />
                </button>
              </li>
            );
          })}
        </ol>
      </div>
      <div className="stack-condition-panel">
        {!entries.length && <p className="muted">{t('settings.commandStacks.select')}</p>}
        {entries.map((row) => (
          <div key={row.id} hidden={active !== row.id}>
            <EntryConditions
              entry={row}
              command={known.get(row.command)}
              applets={applets}
              keyboard={keyboard}
              onChange={(entry) =>
                onChange(entries.map((item) => (item.id === entry.id ? entry : item)))
              }
              onValidity={(value) =>
                setErrors((previous) =>
                  previous[row.id] === !value ? previous : { ...previous, [row.id]: !value },
                )
              }
            />
          </div>
        ))}
      </div>
      {picking && (
        <CommandPicker
          commands={commands.filter((command) => !command.hidden && command.id !== excludeId)}
          pins={[]}
          shortcuts={{}}
          onClose={() => setPicking(false)}
          onChoose={(command) => {
            const id = crypto.randomUUID();
            onChange([
              ...entries,
              { id, command: command.id, enabled: true, when: { scope: 'global', appletIds: [] } },
            ]);
            setSelected(id);
            setPicking(false);
          }}
        />
      )}
    </div>
  );
}

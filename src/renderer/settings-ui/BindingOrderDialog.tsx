import { useHostTranslation } from '../HostTranslation';
import { SettingsField } from './SettingsSections';
import { useState } from 'react';
import { OrderDialogFrame } from './OrderDialogFrame';
import { SettingsOrderList } from './SettingsOrderList';
import type { UiCommand } from '../../shared/commands';
import type { CommandExecutionMode } from '../../shared/command-execution';
import {
  parseCommandExecutionMode,
  type GestureExecutionMode,
} from '../../shared/command-execution-mode';
import { StackExecutionMode } from '../settings/CommandStackEditor';
import type { InputExecutionModes } from '../../shared/input-execution';
export function BindingOrderDialog<R extends { id: string; command: string; enabled: boolean }>({
  bindings,
  executionMode,
  inputExecutionModes,
  commands,
  initialInput,
  title,
  inputName,
  inputLabel,
  conditionLabel,
  groupRows,
  onApply,
  onClose,
}: {
  bindings: R[];
  executionMode: GestureExecutionMode;
  inputExecutionModes: InputExecutionModes;
  commands: UiCommand[];
  initialInput?: string;
  title: string;
  inputName: string;
  inputLabel(input: string): string;
  conditionLabel(row: R, command?: UiCommand): string;
  groupRows(rows: R[]): [string, R[]][];
  onApply(
    ordered: R[],
    original: R[],
    modes: InputExecutionModes,
    originalModes: InputExecutionModes,
  ): void;
  onClose(): void;
}) {
  const { t: translate } = useHostTranslation();
  const [original] = useState(() => structuredClone(bindings));
  const [ordered, setOrdered] = useState(original);
  const [originalModes] = useState(() => structuredClone(inputExecutionModes));
  const [modes, setModes] = useState(originalModes);
  const groups = groupRows(ordered);
  const [key, setKey] = useState(
    initialInput ?? groups.find(([, rows]) => rows.length > 1)?.[0] ?? groups[0]?.[0] ?? '',
  );
  const rows = groups.find(([name]) => name === key)?.[1] ?? [];
  const catalog = new Map(commands.map((command) => [command.id, command]));
  const commandTitle = (id: string) => {
    const command = catalog.get(id);
    return command && command.title !== id
      ? command.title
      : translate('settings.bindingOrderDialog.unknown');
  };
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState('');
  const originalGroups = new Map(groupRows(original));
  const changed = groups.filter(
    ([name, group]) =>
      JSON.stringify(modes[name]) !== JSON.stringify(originalModes[name]) ||
      group.map((row) => row.id).join('\n') !==
        (originalGroups.get(name) ?? []).map((row) => row.id).join('\n'),
  ).length;
  const mode: CommandExecutionMode | 'inherit' = Object.hasOwn(modes, key) ? modes[key] : 'inherit';
  const effectiveMode = mode === 'inherit' ? executionMode : mode;
  let validModes = true;
  try {
    Object.values(modes).forEach(parseCommandExecutionMode);
  } catch {
    validModes = false;
  }

  return (
    <OrderDialogFrame
      title={title}
      eyebrow={translate('settings.bindingOrderDialog.allBindings')}
      className="shortcut-order-dialog"
      closeLabel={translate('settings.bindingOrderDialog.cancel')}
      onClose={onClose}
      onReady={setReady}
      onError={setError}
      initialFocus="select"
      error={error || (!validModes ? translate('settings.commandStacks.invalidCount') : '')}
      description={translate('settings.inputExecution.description')}
      message={[
        notice,
        changed ? translate('settings.bindingOrderDialog.changedCount', { changed }) : '',
      ]
        .filter(Boolean)
        .join(' · ')}
      hint={translate('settings.bindingOrderDialog.hint')}
      applyLabel={translate('settings.bindingOrderDialog.apply')}
      applyDisabled={!changed || !ready || !validModes}
      onApply={() => {
        try {
          onApply(ordered, original, modes, originalModes);
          onClose();
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      }}
    >
      <div className="gesture-settings-options">
        <SettingsField
          title={inputName}
          description={
            rows.length < 2
              ? rows.length
                ? translate('settings.bindingOrderDialog.single', { inputName: inputName })
                : translate('settings.bindingOrderDialog.emptyHint', { inputName: inputName })
              : undefined
          }
        >
          <select
            aria-label={translate('settings.bindingOrderDialog.input', { inputName: inputName })}
            value={key}
            disabled={!groups.length}
            onChange={(event) => {
              setKey(event.target.value);
              setNotice('');
            }}
          >
            {!groups.length && (
              <option value="">{translate('settings.bindingOrderDialog.noBindings')}</option>
            )}
            {groups.map(([name, group]) => (
              <option key={name} value={name}>
                {translate('settings.bindingOrderDialog.groupCount', {
                  name: inputLabel(name),
                  count: group.length,
                })}
              </option>
            ))}
          </select>
        </SettingsField>
        <div data-testid="binding-execution-field">
          <StackExecutionMode
            testId="binding-execution-mode"
            value={mode}
            inherited={executionMode}
            disabled={!rows.length}
            onChange={(value) => {
              setModes((current) => {
                const next = { ...current };
                if (value === 'inherit') delete next[key];
                else next[key] = value;
                return next;
              });
              setError('');
            }}
          />
        </div>
      </div>
      <div className="gesture-settings-order-heading">
        <h3>{translate('settings.inputExecution.order')}</h3>
        <p>
          {typeof effectiveMode === 'object'
            ? translate('settings.commandStacks.firstCount', { count: effectiveMode.count })
            : translate(`settings.inputExecution.${effectiveMode}Hint`)}
        </p>
      </div>
      <SettingsOrderList
        key={key}
        label={translate('settings.bindingOrderDialog.executionOrder', { value: inputLabel(key) })}
        items={rows.map((row) => {
          const command = catalog.get(row.command);
          return {
            id: row.id,
            title: commandTitle(row.command),
            description: [
              command && command.title !== row.command ? command.extension : '',
              conditionLabel(row, command),
            ]
              .filter(Boolean)
              .join(' · '),
            state: !row.enabled
              ? translate('settings.bindingOrderDialog.disabled')
              : !command?.available
                ? translate('settings.bindingOrderDialog.unavailable')
                : undefined,
          };
        })}
        onChange={(ids, message) => {
          const byId = new Map(rows.map((row) => [row.id, row]));
          let index = 0;
          setOrdered(ordered.map((row) => (byId.has(row.id) ? byId.get(ids[index++])! : row)));
          setNotice(message);
          setError('');
        }}
      />
    </OrderDialogFrame>
  );
}

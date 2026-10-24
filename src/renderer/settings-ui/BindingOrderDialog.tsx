import { useHostTranslation } from '../HostTranslation';
import { SettingsField } from './SettingsSections';
import { useRef, useState } from 'react';
import { OrderDialogFrame } from './OrderDialogFrame';
import type { UiCommand } from '../../shared/commands';
export function BindingOrderDialog<R extends { id: string; command: string; enabled: boolean }>({
  bindings,
  commands,
  initialInput,
  title,
  inputName,
  inputLabel,
  conditionLabel,
  groupRows,
  moveRow,
  onApply,
  onClose,
}: {
  bindings: R[];
  commands: UiCommand[];
  initialInput?: string;
  title: string;
  inputName: string;
  inputLabel(input: string): string;
  conditionLabel(row: R, command?: UiCommand): string;
  groupRows(rows: R[]): [string, R[]][];
  moveRow(rows: R[], from: string, to: string): R[];
  onApply(ordered: R[], original: R[]): void;
  onClose(): void;
}) {
  const { t: translate } = useHostTranslation();
  const [original] = useState(() => structuredClone(bindings));
  const [ordered, setOrdered] = useState(original);
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
  const [over, setOver] = useState<string | null>(null);
  const dragged = useRef<string | null>(null);
  const selector = useRef<HTMLSelectElement>(null);
  const originalGroups = new Map(groupRows(original));
  const changed = groups.filter(
    ([name, group]) =>
      group.map((row) => row.id).join('\n') !==
      (originalGroups.get(name) ?? []).map((row) => row.id).join('\n'),
  ).length;

  const move = (from: string, to: string) => {
    setOrdered((value) => moveRow(value, from, to));
    const source = rows.find((row) => row.id === from);
    setNotice(
      translate('settings.bindingOrderDialog.moved', {
        value: commandTitle(source?.command ?? ''),
        value2: rows.findIndex((row) => row.id === to) + 1,
      }),
    );
    setError('');
  };
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
      error={error}
      description={translate('settings.bindingOrderDialog.changedCount', { changed: changed })}
      message={notice}
      hint={translate('settings.bindingOrderDialog.hint')}
      applyLabel={translate('settings.bindingOrderDialog.apply')}
      applyDisabled={!changed || !ready}
      onApply={() => {
        try {
          onApply(ordered, original);
          onClose();
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      }}
    >
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
          ref={selector}
          aria-label={translate('settings.bindingOrderDialog.input', { inputName: inputName })}
          value={key}
          disabled={!groups.length}
          onChange={(event) => {
            setKey(event.target.value);
            dragged.current = null;
            setOver(null);
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
      <ol
        className="shortcut-order-list"
        aria-label={translate('settings.bindingOrderDialog.executionOrder', {
          value: inputLabel(key),
        })}
      >
        {rows.map((row, index) => {
          const command = catalog.get(row.command);
          const title = commandTitle(row.command);
          const detail = [
            command && command.title !== row.command ? command.extension : '',
            conditionLabel(row, command),
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <li
              key={row.id}
              data-order-binding={row.id}
              className={`shortcut-order-row${over === row.id ? ' drop-target' : ''}`}
              onDragOver={(event) => {
                if (dragged.current && dragged.current !== row.id) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  setOver(row.id);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragged.current) move(dragged.current, row.id);
                dragged.current = null;
                setOver(null);
              }}
            >
              <button
                className="shortcut-order-handle"
                draggable
                aria-label={translate('settings.bindingOrderDialog.drag', { title: title })}
                title={translate('settings.bindingOrderDialog.dragHint')}
                onDragStart={(event) => {
                  dragged.current = row.id;
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', row.id);
                }}
                onDragEnd={() => {
                  dragged.current = null;
                  setOver(null);
                }}
                onKeyDown={(event) => {
                  if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
                    event.preventDefault();
                    const target = rows[index + (event.key === 'ArrowUp' ? -1 : 1)];
                    if (target) move(row.id, target.id);
                  }
                }}
              >
                ⠿
              </button>
              <span
                className="shortcut-order-number"
                aria-label={translate('settings.bindingOrderDialog.position', { value: index + 1 })}
              >
                {index + 1}
              </span>
              <div className="shortcut-order-command">
                <strong title={title}>{title}</strong>
                <small title={detail}>{detail}</small>
                {(!row.enabled || !command?.available) && (
                  <small className="shortcut-order-state">
                    {!row.enabled
                      ? translate('settings.bindingOrderDialog.disabled')
                      : translate('settings.bindingOrderDialog.unavailable')}
                  </small>
                )}
              </div>
              <div className="shortcut-order-moves">
                <button
                  aria-label={translate('settings.bindingOrderDialog.up', { title: title })}
                  className="secondary"
                  data-testid={`binding-order-up:${row.id}`}
                  disabled={index === 0}
                  onClick={() => move(row.id, rows[index - 1].id)}
                >
                  ↑
                </button>
                <button
                  aria-label={translate('settings.bindingOrderDialog.down', { title: title })}
                  className="secondary"
                  data-testid={`binding-order-down:${row.id}`}
                  disabled={index === rows.length - 1}
                  onClick={() => move(row.id, rows[index + 1].id)}
                >
                  ↓
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </OrderDialogFrame>
  );
}

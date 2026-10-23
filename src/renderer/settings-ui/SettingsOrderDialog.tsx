import { useHostTranslation } from '../HostTranslation';
import { useRef, useState } from 'react';
import { OrderDialogFrame } from './OrderDialogFrame';

export interface SettingsOrderItem {
  id: string;
  title: string;
  description?: string;
}

/** Shell-neutral ordering UI. Persistence and conflict checks belong to the caller. */
export function SettingsOrderDialog({
  title,
  listLabel,
  items,
  onApply,
  onClose,
}: {
  title: string;
  listLabel: string;
  items: SettingsOrderItem[];
  onApply(ordered: string[], original: string[]): Promise<unknown>;
  onClose(): void;
}) {
  const { t: translate } = useHostTranslation();
  const [original] = useState(() => items.map((item) => item.id));
  const [rows, setRows] = useState(items);
  const [over, setOver] = useState('');
  const [notice, setNotice] = useState('');
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const dragged = useRef('');
  const saving = useRef(false);
  const move = (from: string, to: string) => {
    if (saving.current) return;
    const next = [...rows];
    const source = next.findIndex((item) => item.id === from);
    const target = next.findIndex((item) => item.id === to);
    if (source < 0 || target < 0 || source === target) return;
    const [row] = next.splice(source, 1);
    next.splice(target, 0, row);
    setRows(next);
    setNotice(
      translate('settings.settingsOrderDialog.moved', { title: row.title, value: target + 1 }),
    );
  };
  return (
    <OrderDialogFrame
      title={title}
      hint={translate('settings.settingsOrderDialog.hint')}
      message={notice}
      className="settings-order-dialog"
      onClose={onClose}
      onReady={setReady}
      onError={setError}
      error={error}
      pending={pending}
      applyDisabled={!ready}
      onApply={async () => {
        if (saving.current || !ready) return;
        saving.current = true;
        setPending(true);
        setError('');
        dragged.current = '';
        setOver('');
        try {
          await onApply(
            rows.map((item) => item.id),
            original,
          );
          onClose();
        } catch (reason) {
          setError(
            reason instanceof Error
              ? reason.message
              : translate('settings.settingsOrderDialog.saveFailed'),
          );
        } finally {
          saving.current = false;
          setPending(false);
        }
      }}
    >
      <ol className="shortcut-order-list" aria-label={listLabel}>
        {rows.map((item, index) => (
          <li
            key={item.id}
            data-order-id={item.id}
            className={`shortcut-order-row${over === item.id ? ' drop-target' : ''}`}
            onDragOver={(event) => {
              if (!saving.current && dragged.current && dragged.current !== item.id) {
                event.preventDefault();
                setOver(item.id);
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              move(dragged.current, item.id);
              dragged.current = '';
              setOver('');
            }}
          >
            <button
              type="button"
              className="shortcut-order-handle"
              draggable={!pending}
              disabled={pending}
              data-initial-focus={index === 0 || undefined}
              aria-label={translate('settings.settingsOrderDialog.drag', { title: item.title })}
              onDragStart={(event) => {
                if (saving.current) {
                  event.preventDefault();
                  return;
                }
                dragged.current = item.id;
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', item.id);
              }}
              onDragEnd={() => {
                dragged.current = '';
                setOver('');
              }}
              onKeyDown={(event) => {
                if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
                  event.preventDefault();
                  const target = rows[index + (event.key === 'ArrowUp' ? -1 : 1)];
                  if (target) move(item.id, target.id);
                }
              }}
            >
              ⠿
            </button>
            <span className="shortcut-order-number">{index + 1}</span>
            <div className="shortcut-order-command">
              <strong>{item.title}</strong>
              {item.description && <small>{item.description}</small>}
            </div>
            <div className="shortcut-order-moves">
              <button
                type="button"
                aria-label={translate('settings.settingsOrderDialog.up', { title: item.title })}
                className="accent-action"
                disabled={pending || !index}
                onClick={() => move(item.id, rows[index - 1].id)}
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={translate('settings.settingsOrderDialog.down', { title: item.title })}
                className="accent-action"
                disabled={pending || index === rows.length - 1}
                onClick={() => move(item.id, rows[index + 1].id)}
              >
                ↓
              </button>
            </div>
          </li>
        ))}
      </ol>
    </OrderDialogFrame>
  );
}

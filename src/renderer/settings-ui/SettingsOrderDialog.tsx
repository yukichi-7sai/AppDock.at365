import { useHostTranslation } from '../HostTranslation';
import { useLayoutEffect, useRef, useState } from 'react';
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
  returnFocus,
}: {
  title: string;
  listLabel: string;
  items: SettingsOrderItem[];
  onApply(ordered: string[], original: string[]): Promise<unknown>;
  onClose(): void;
  returnFocus?: HTMLElement | null;
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
  const handles = useRef(new Map<string, HTMLButtonElement>());
  const movedHandle = useRef<string | null>(null);
  useLayoutEffect(() => {
    const id = movedHandle.current;
    movedHandle.current = null;
    if (!id) return;
    const handle = handles.current.get(id);
    handle?.focus({ preventScroll: true });
    handle?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [rows]);
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
      returnFocus={returnFocus}
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
            draggable={!pending}
            onDragStart={(event) => {
              if (saving.current) {
                event.preventDefault();
                return;
              }
              dragged.current = item.id;
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', item.id);
              handles.current.get(item.id)?.focus({ preventScroll: true });
            }}
            onDragEnd={() => {
              dragged.current = '';
              setOver('');
            }}
            onDragOver={(event) => {
              if (!saving.current && dragged.current && dragged.current !== item.id) {
                event.preventDefault();
                setOver(item.id);
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              movedHandle.current = dragged.current;
              move(dragged.current, item.id);
              dragged.current = '';
              setOver('');
            }}
          >
            <button
              type="button"
              className="shortcut-order-handle"
              ref={(element) => {
                if (element) handles.current.set(item.id, element);
                else handles.current.delete(item.id);
              }}
              data-testid={`settings-order-handle:${item.id}`}
              draggable={!pending}
              disabled={pending}
              data-initial-focus={index === 0 || undefined}
              aria-label={translate('settings.settingsOrderDialog.drag', { title: item.title })}
              aria-keyshortcuts="ArrowUp ArrowDown"
              title={translate('settings.settingsOrderDialog.dragHint')}
              onKeyDown={(event) => {
                if (
                  !saving.current &&
                  !event.nativeEvent.isComposing &&
                  event.keyCode !== 229 &&
                  !event.altKey &&
                  !event.ctrlKey &&
                  !event.metaKey &&
                  !event.shiftKey &&
                  ['ArrowUp', 'ArrowDown'].includes(event.key)
                ) {
                  event.preventDefault();
                  event.stopPropagation();
                  const target = rows[index + (event.key === 'ArrowUp' ? -1 : 1)];
                  if (target) {
                    movedHandle.current = item.id;
                    move(item.id, target.id);
                  }
                }
              }}
            >
              ⠿
            </button>
            <span className="shortcut-order-number">{index + 1}</span>
            <div className="shortcut-order-command">
              <strong title={item.title}>{item.title}</strong>
              {item.description && <small title={item.description}>{item.description}</small>}
            </div>
          </li>
        ))}
      </ol>
    </OrderDialogFrame>
  );
}

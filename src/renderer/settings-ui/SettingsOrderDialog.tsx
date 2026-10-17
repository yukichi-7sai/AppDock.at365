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
    setNotice(`${row.title}を${target + 1}番目に移動しました。`);
  };
  return (
    <OrderDialogFrame
      title={title}
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
          setError(reason instanceof Error ? reason.message : '保存できませんでした。');
        } finally {
          saving.current = false;
          setPending(false);
        }
      }}
    >
      <p className="shortcut-order-help">ドラッグ、上下ボタン、またはAlt＋↑↓で移動できます。</p>
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
              aria-label={`${item.title}の順番をドラッグで変更`}
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
                aria-label={`${item.title}を上へ`}
                disabled={pending || !index}
                onClick={() => move(item.id, rows[index - 1].id)}
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`${item.title}を下へ`}
                disabled={pending || index === rows.length - 1}
                onClick={() => move(item.id, rows[index + 1].id)}
              >
                ↓
              </button>
            </div>
          </li>
        ))}
      </ol>
      <div role="status" className="shortcut-order-notice">
        {notice || 'OKで一覧の表示順を保存します。'}
      </div>
    </OrderDialogFrame>
  );
}

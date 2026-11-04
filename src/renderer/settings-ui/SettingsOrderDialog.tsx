import { useHostTranslation } from '../HostTranslation';
import { useRef, useState } from 'react';
import { OrderDialogFrame } from './OrderDialogFrame';
import { SettingsOrderList } from './SettingsOrderList';
import { orderListResult, type OrderListItem } from '../../shared/order-list';

export type SettingsOrderItem = OrderListItem;

/** Reusable ordering UI. Persistence and conflict checks belong to the caller. */
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
  const { t } = useHostTranslation();
  const [original] = useState(items);
  const [rows, setRows] = useState(items);
  const [notice, setNotice] = useState('');
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const saving = useRef(false);
  return (
    <OrderDialogFrame
      returnFocus={returnFocus}
      title={title}
      hint={t('settings.settingsOrderDialog.hint')}
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
        setNotice('');
        try {
          await onApply(
            orderListResult(original, rows),
            original.map((item) => item.id),
          );
          onClose();
        } catch (reason) {
          setError(
            reason instanceof Error ? reason.message : t('settings.settingsOrderDialog.saveFailed'),
          );
        } finally {
          saving.current = false;
          setPending(false);
        }
      }}
    >
      <SettingsOrderList
        items={rows}
        label={listLabel}
        disabled={pending}
        onChange={(ids, message) => {
          if (saving.current) return;
          const byId = new Map(rows.map((item) => [item.id, item]));
          setRows(ids.map((id) => byId.get(id)!));
          setNotice(message);
          setError('');
        }}
      />
    </OrderDialogFrame>
  );
}

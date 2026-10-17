import { SettingsInput } from './SettingsInput';
import { ListIcon } from './SettingsListTable';
import type { ReactNode } from 'react';
export function CommandBindingToolbar({
  inputName,
  count,
  visibleCount,
  filter,
  statusFilter,
  setFilter,
  setStatusFilter,
  onOrder,
  showRegistrationErrors = false,
  children,
}: {
  inputName: string;
  count: number;
  visibleCount: number;
  filter: string;
  statusFilter: string;
  setFilter(value: string): void;
  setStatusFilter(value: string): void;
  onOrder(): void;
  showRegistrationErrors?: boolean;
  children?: ReactNode;
}) {
  return (
    <>
      {children}
      <div className="command-shortcut-tools">
        <div className="command-shortcut-search">
          <span aria-hidden="true">⌕</span>
          <SettingsInput
            type="search"
            aria-label={`${inputName}のコマンドを検索`}
            placeholder={`コマンド・${inputName === 'ショートカット' ? 'キー' : inputName}・提供元を検索…`}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
        </div>
        <select
          className="shortcut-status-filter"
          aria-label={`${inputName}の絞り込み`}
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="all">すべて</option>
          <option value="assigned">割り当て済み</option>
          <option value="unassigned">未割り当て</option>
          {showRegistrationErrors && <option value="conflict">登録エラー</option>}
        </select>
      </div>
      <div className="command-shortcut-summary">
        <span role="status">
          {visibleCount} / {count} コマンドを表示
        </span>
        <button
          type="button"
          className="settings-list-icon shortcut-order-open"
          aria-label="実行順…"
          title={`${inputName}の実行順`}
          onClick={onOrder}
        >
          <ListIcon kind="order" />
        </button>
        {(filter || statusFilter !== 'all') && (
          <button
            className="text-button"
            onClick={() => {
              setFilter('');
              setStatusFilter('all');
            }}
          >
            絞り込みを解除
          </button>
        )}
      </div>
    </>
  );
}

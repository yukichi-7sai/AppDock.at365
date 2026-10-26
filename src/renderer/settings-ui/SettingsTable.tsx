import type { ComponentProps, ReactNode } from 'react';
import './settings-list.css';

/** Shared table surface; callers retain their own columns, row spans and controls. */
export function SettingsTable({
  className = '',
  framed = false,
  ...props
}: ComponentProps<'table'> & { framed?: boolean }) {
  return (
    <table
      {...props}
      className={`settings-data-table${framed ? ' settings-data-table-framed' : ''} ${className}`}
    />
  );
}

export function SettingsTableEmptyRow({
  colSpan,
  title,
  description,
  testId,
}: {
  colSpan: number;
  title: ReactNode;
  description?: ReactNode;
  testId?: string;
}) {
  return (
    <tr data-testid={testId}>
      <td colSpan={colSpan} className="settings-table-empty-cell">
        <div className="settings-table-empty">
          <strong>{title}</strong>
          {description && <p>{description}</p>}
        </div>
      </td>
    </tr>
  );
}

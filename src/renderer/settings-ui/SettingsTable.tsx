import type { ComponentProps } from 'react';
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

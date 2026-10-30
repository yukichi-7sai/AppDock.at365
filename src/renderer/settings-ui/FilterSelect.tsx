import type { ComponentProps } from 'react';
import './filter-select.css';

/** A native list filter whose unrestricted value is supplied by its owner. */
export function FilterSelect({
  value,
  allValue = 'all',
  className,
  ...props
}: Omit<ComponentProps<'select'>, 'value'> & { value: string; allValue?: string }) {
  return (
    <select
      {...props}
      value={value}
      className={['filter-select', className].filter(Boolean).join(' ')}
      data-filter-active={value !== allValue}
    />
  );
}

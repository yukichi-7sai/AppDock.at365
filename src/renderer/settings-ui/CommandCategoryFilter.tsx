import { useMemo } from 'react';
import type { Command } from '../../shared/contracts';
import { useHostTranslation } from '../HostTranslation';
import { FilterSelect } from './FilterSelect';

export function CommandCategoryFilter({
  commands,
  value,
  onChange,
  className,
}: {
  commands: readonly Pick<Command, 'category'>[];
  value: string;
  onChange(value: string): void;
  className?: string;
}) {
  const { t } = useHostTranslation();
  const categories = useMemo(
    () =>
      [
        ...new Set(
          commands
            .map((command) => command.category?.trim())
            .filter((category): category is string => !!category),
        ),
      ].sort((a, b) => a.localeCompare(b, 'ja')),
    [commands],
  );
  return (
    <FilterSelect
      className={className}
      aria-label={t('settings.commandSelection.category')}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="all">{t('settings.commandSelection.allCategories')}</option>
      <option value="category:">{t('settings.commandSelection.uncategorized')}</option>
      {categories.map((category) => (
        <option key={category} value={`category:${category}`}>
          {category}
        </option>
      ))}
      {value !== 'all' && value !== 'category:' && !categories.includes(value.slice(9)) && (
        <option value={value}>{value.slice(9)}</option>
      )}
    </FilterSelect>
  );
}

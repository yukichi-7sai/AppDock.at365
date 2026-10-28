import { useHostTranslation } from '../HostTranslation';

export function SettingsListCount({ visible, total }: { visible: number; total: number }) {
  const { t } = useHostTranslation();
  return (
    <span role="status">{t('settings.settingsListTable.filteredCount', { visible, total })}</span>
  );
}

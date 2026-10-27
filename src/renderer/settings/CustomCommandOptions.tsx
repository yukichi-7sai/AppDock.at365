import type { ReactNode } from 'react';
import { useHostTranslation } from '../HostTranslation';

/** Optional command settings share one disclosure while each type owns its fields. */
export function CustomCommandOptions({ children }: { children: ReactNode }) {
  const { t } = useHostTranslation();
  return (
    <details className="custom-command-options" data-testid="custom-command-options">
      <summary>{t('settings.customCommandsSettings.advanced')}</summary>
      <div>{children}</div>
    </details>
  );
}

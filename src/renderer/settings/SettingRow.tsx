import type React from 'react';
import { useHostTranslation } from '../HostTranslation';
import { hostSettingItem } from '../../shared/settings-catalog';
import { settingAnchor } from '../settings-ui/setting-anchor';
import { SettingsField } from '../settings-ui/SettingsSections';

export function SettingRow({
  pageId,
  itemKey,
  description,
  error,
  children,
}: {
  pageId: string;
  itemKey: string;
  description?: string;
  error?: string;
  children: React.ReactNode;
}) {
  const { language } = useHostTranslation();
  const item = hostSettingItem(pageId, itemKey, language);
  const requiredDescription =
    pageId === 'about' &&
    ['startAtLogon', 'runAsAdministrator', 'hardwareAcceleration'].includes(itemKey);
  return (
    <SettingsField
      title={item.title}
      error={error}
      hint={description === undefined && !requiredDescription ? item.description : undefined}
      description={description ?? (requiredDescription ? item.description : undefined)}
      {...settingAnchor(pageId, itemKey)}
    >
      {children}
    </SettingsField>
  );
}

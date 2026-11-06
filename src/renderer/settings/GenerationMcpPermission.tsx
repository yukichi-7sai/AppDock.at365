import { useHostTranslation } from '../HostTranslation';
import { SettingsField } from '../settings-ui/SettingsSections';
import { Toggle } from '../settings-ui/Toggle';

export function GenerationMcpPermission({
  enabled,
  onChange,
  future = false,
}: {
  enabled?: boolean;
  onChange(value: boolean): void;
  future?: boolean;
}) {
  const { t } = useHostTranslation();
  return (
    <SettingsField
      className="server-editor-full"
      title={t('settings.generation.mcp')}
      description={t(future ? 'settings.generation.mcpFuture' : 'settings.generation.mcpHint')}
    >
      <Toggle label={t('settings.generation.mcp')} checked={enabled === true} onChange={onChange} />
    </SettingsField>
  );
}

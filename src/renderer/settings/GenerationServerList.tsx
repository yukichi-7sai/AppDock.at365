import { useHostTranslation } from '../HostTranslation';
import {
  ListIcon,
  SettingsListLayout,
  SettingsListToolbar,
  SettingsListToolbarActions,
} from '../settings-ui/SettingsListTable';
import { SettingsTableEmptyRow } from '../settings-ui/SettingsTable';

const listLabels = {
  ai: {
    title: 'settings.aiSettings.registered',
    add: 'settings.aiConnectionDialog.add',
    count: 'settings.aiSettings.serverCount',
  },
  tts: {
    title: 'settings.ttsServers.registered',
    add: 'settings.ttsServers.add',
    count: 'settings.ttsServers.serverCount',
  },
  imageAi: {
    title: 'imageAi.connections',
    add: 'imageAi.add',
    count: 'imageAi.serverCount',
  },
} as const;

type ServerEntry = { id: string; name: string; baseUrl: string; mcpEnabled?: boolean };

export function GenerationServerList<Server extends ServerEntry>({
  kind,
  servers,
  defaultId,
  statuses,
  busy,
  presetName,
  model,
  voice,
  onEdit,
  onDelete,
  onOrder,
}: {
  kind: keyof typeof listLabels;
  servers: Server[];
  defaultId?: string;
  statuses?: { id: string; error?: string }[];
  busy: boolean;
  presetName(server: Server): string;
  model(server: Server): string | undefined;
  voice?(server: Server): string;
  onEdit(server: Server | null): void;
  onDelete(server: Server): void;
  onOrder(): void;
}) {
  const { t } = useHostTranslation();
  const labels = listLabels[kind];
  const speech = kind === 'tts';
  const keyErrors = new Set(statuses?.filter((status) => status.error).map((status) => status.id));
  return (
    <SettingsListLayout
      title={t(labels.title)}
      actionsAlign="start"
      tableClassName="generation-server-table"
      toolbar={
        <SettingsListToolbar
          actions={
            <SettingsListToolbarActions
              addLabel={t(labels.add)}
              addDisabled={busy}
              onAdd={() => onEdit(null)}
              orderLabel={t(speech ? 'settings.ttsServers.order' : 'settings.aiSettings.order')}
              orderDisabled={busy || servers.length < 2}
              onOrder={onOrder}
            />
          }
        >
          {t(labels.count, { count: servers.length })}
        </SettingsListToolbar>
      }
    >
      <colgroup>
        <col span={2} />
        <col className="generation-server-mcp-column" />
        <col className="generation-server-actions-column" />
      </colgroup>
      <thead>
        <tr>
          <th scope="col">{t('settings.aiSettings.server')}</th>
          <th scope="col">
            {t(speech ? 'settings.ttsSettings.modelsAndVoices' : 'settings.aiSettings.model')}
          </th>
          <th scope="col">{t('settings.generation.mcpPublication')}</th>
          <th scope="col" className="settings-list-actions-heading">
            {t('settings.aiSettings.actions')}
          </th>
        </tr>
      </thead>
      <tbody>
        {servers.map((server) => {
          const defaultVoice = voice?.(server);
          return (
            <tr key={server.id} data-ai-connection={server.id}>
              <td className="settings-list-wrap">
                <div className="ai-server-heading">
                  <strong>{server.name || server.id}</strong>
                  {server.id === defaultId && (
                    <span className="ai-default-badge">{t('settings.aiSettings.default')}</span>
                  )}
                </div>
                <small>{presetName(server)}</small>
                <small>{server.baseUrl || t('settings.aiSettings.unsetUrl')}</small>
              </td>
              <td className="settings-list-wrap">
                {model(server) || (speech ? null : t('settings.aiSettings.perCall'))}
                {defaultVoice && <small>{defaultVoice}</small>}
                {keyErrors.has(server.id) && (
                  <small className="error-text">{t('settings.aiSettings.checkKey')}</small>
                )}
              </td>
              <td className="generation-server-mcp-state">
                {t(
                  server.mcpEnabled === true
                    ? 'settings.generation.mcpPublic'
                    : 'settings.generation.mcpPrivate',
                )}
              </td>
              <td className="settings-list-actions-cell">
                <div className="settings-list-actions ai-row-actions">
                  <button
                    type="button"
                    className="settings-list-icon"
                    disabled={busy}
                    aria-label={t('settings.aiSettings.serverSettings', { name: server.name })}
                    title={t('settings.aiSettings.settings')}
                    onClick={() => onEdit(server)}
                  >
                    <ListIcon kind="edit" />
                  </button>
                  <button
                    type="button"
                    className="settings-list-icon settings-list-delete"
                    disabled={busy}
                    aria-label={t('settings.aiSettings.deleteServerLabel', { name: server.name })}
                    title={t('settings.aiSettings.delete')}
                    onClick={() => onDelete(server)}
                  >
                    <ListIcon kind="delete" />
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
        {!servers.length && (
          <SettingsTableEmptyRow
            colSpan={4}
            title={t(speech ? 'settings.ttsServers.empty' : 'settings.aiSettings.empty')}
            description={speech ? undefined : t('settings.aiSettings.emptyHint')}
          />
        )}
      </tbody>
    </SettingsListLayout>
  );
}

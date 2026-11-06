import { GenerationPreviewActions } from './GenerationPreviewActions';
import { useState, useEffect, useRef } from 'react';
import { useHostTranslation } from '../HostTranslation';
import { useSettingsFeedback } from '../settings-ui/SettingsStatus';
import type { SettingsControlEditor } from '../settings-ui/api';
import type { SettingsPageAuxiliary } from '../../shared/settings-page';
import { defaultTtsConfiguration, selectedTtsServer, type TtsServer } from '../../shared/tts';
import { settingAnchor } from '../settings-ui/setting-anchor';
import { SettingsTextarea } from '../settings-ui/SettingsInput';
import { SettingsSection, SettingsField, SettingsContent } from '../settings-ui/SettingsSections';
import { GenerationServerList } from './GenerationServerList';
import { SettingsDialog } from '../settings-ui/SettingsModal';
import { SettingsOrderDialog } from '../settings-ui/SettingsOrderDialog';
import { SettingsMcpScope } from '../settings-ui/SettingsMcpAccess';
import { settingsItemId } from '../../shared/settings-catalog';
import { TtsConnectionDialog } from './TtsConnectionDialog';

export function TtsSettingsForm({
  editor,
  auxiliary,
  invoke,
  busy,
}: {
  editor: SettingsControlEditor;
  auxiliary?: SettingsPageAuxiliary['tts'];
  invoke(name: string, args?: unknown[]): Promise<any>;
  busy: boolean;
}) {
  const { t: translate } = useHostTranslation();
  const config = editor.value.tts ?? defaultTtsConfiguration();
  const [dialog, setDialog] = useState<
    | {
        kind: 'edit' | 'delete';
        original: TtsServer | null;
        status?: NonNullable<SettingsPageAuxiliary['tts']>['connections'][number];
        defaultId?: string;
      }
    | { kind: 'order'; connections: TtsServer[] }
    | null
  >(null);
  const [replacement, setReplacement] = useState('');
  const [previewId, setPreviewId] = useState(
    config.defaultConnectionId ?? config.connections[0]?.id ?? '',
  );
  const previewServer = selectedTtsServer(config, previewId);
  const [previewInstructions, setPreviewInstructions] = useState('');
  useEffect(() => {
    if (!config.connections.some((c) => c.id === previewId))
      setPreviewId(config.defaultConnectionId ?? config.connections[0]?.id ?? '');
  }, [config, previewId]);
  const [text, setText] = useState(''),
    [pending, setPending] = useState(false),
    [error, setError] = useState('');
  const operation = useRef(false);
  const run = async (action: () => Promise<void>) => {
    if (operation.current) return;
    operation.current = true;
    setPending(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      operation.current = false;
      setPending(false);
    }
  };
  const open = (kind: 'edit' | 'delete', original: TtsServer | null) => {
    setReplacement('');
    setDialog({
      kind,
      original: original ? structuredClone(original) : null,
      status: auxiliary?.connections.find((c) => c.id === original?.id),
      defaultId: config.defaultConnectionId,
    });
  };
  const active = auxiliary?.jobs.some((j) =>
    ['queued', 'generating', 'waitingPlayback', 'playing'].includes(j.state),
  );
  const previewJob = auxiliary?.jobs.at(-1);
  const previewState = previewJob && translate(`settings.ttsSettings.${previewJob.state}`);
  useSettingsFeedback({ busy: pending, error });
  return (
    <div
      className="settings-sections tts-settings"
      aria-label={translate('settings.ttsSettings.title')}
    >
      <SettingsContent className="ai-connection-table" {...settingAnchor('tts', 'connections')}>
        <GenerationServerList
          kind="tts"
          servers={config.connections}
          defaultId={config.defaultConnectionId}
          statuses={auxiliary?.connections}
          busy={busy}
          presetName={(server) => translate(`settings.ttsSettings.preset.${server.preset}`)}
          model={(server) => server.model}
          voice={(server) => server.defaultVoice}
          onEdit={(server) => open('edit', server)}
          onDelete={(server) => open('delete', server)}
          onOrder={() =>
            setDialog({ kind: 'order', connections: structuredClone(config.connections) })
          }
        />
      </SettingsContent>
      <SettingsSection>
        <SettingsField
          title={translate('settings.ttsServers.defaultServer')}
          hint={translate('settings.ttsServers.defaultsHint')}
          {...settingAnchor('tts', 'defaultConnectionId')}
        >
          <select
            aria-label={translate('settings.ttsServers.defaultServer')}
            value={config.defaultConnectionId ?? ''}
            onChange={(e) =>
              editor.edit({
                ...editor.value,
                tts: { ...config, defaultConnectionId: e.target.value || undefined },
              })
            }
          >
            <option value="">{translate('settings.aiSettings.perCall')}</option>
            {config.connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </SettingsField>
      </SettingsSection>
      {dialog?.kind === 'edit' && (
        <SettingsMcpScope itemId={settingsItemId('tts', 'connections')}>
          <TtsConnectionDialog
            original={dialog.original}
            status={dialog.status}
            invoke={invoke}
            onClose={() => setDialog(null)}
          />
        </SettingsMcpScope>
      )}
      {dialog?.kind === 'order' && (
        <SettingsOrderDialog
          title={translate('settings.ttsServers.order')}
          listLabel={translate('settings.ttsServers.registered')}
          items={dialog.connections.map((c) => ({ id: c.id, title: c.name }))}
          onApply={(ordered, original) => invoke('ttsOrderConnections', [original, ordered])}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'delete' && dialog.original && (
        <SettingsDialog
          title={translate('settings.ttsServers.delete')}
          applyLabel={translate('settings.aiSettings.delete')}
          onClose={() => setDialog(null)}
          onApply={() =>
            invoke('ttsDeleteConnection', [
              dialog.original,
              dialog.status?.keyRevision,
              replacement,
              dialog.defaultId,
            ])
          }
        >
          <p>
            {translate('settings.ttsServers.deleteConfirmation', { name: dialog.original.name })}
          </p>
          {dialog.original.id === dialog.defaultId && (
            <SettingsField title={translate('settings.ttsServers.replacement')}>
              <select
                aria-label={translate('settings.ttsServers.replacement')}
                value={replacement}
                onChange={(e) => setReplacement(e.target.value)}
              >
                <option value="">{translate('settings.ttsServers.unselected')}</option>
                {config.connections
                  .filter((c) => c.id !== dialog.original?.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </SettingsField>
          )}
        </SettingsDialog>
      )}
      <SettingsSection
        title={translate('settings.ttsSettings.preview')}
        description={translate('settings.ttsSettings.previewHint')}
        {...settingAnchor('tts', 'preview')}
      >
        <SettingsField
          title={translate('settings.generation.server')}
          description={translate('settings.ttsServers.previewIndependent')}
        >
          <select
            aria-label={translate('settings.aiSettings.testServer')}
            value={previewId}
            onChange={(e) => setPreviewId(e.target.value)}
          >
            <option value="" disabled>
              {translate('settings.ttsServers.unselected')}
            </option>
            {config.connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </SettingsField>
        <SettingsField
          title={translate('settings.ttsSettings.previewInstructions')}
          hint={translate('settings.ttsSettings.previewInstructionsHint')}
        >
          <SettingsTextarea
            aria-label={translate('settings.ttsSettings.previewInstructions')}
            commitOn="input"
            rows={2}
            placeholder={translate('settings.ttsSettings.instructionsPlaceholder')}
            value={previewInstructions}
            onChange={(event) => setPreviewInstructions(event.target.value)}
          />
        </SettingsField>
        <SettingsField
          title={translate('settings.ttsSettings.text')}
          description={
            !previewServer?.baseUrl || !previewServer?.model
              ? translate('settings.ttsSettings.previewRequirements')
              : (previewState ?? translate('settings.ttsSettings.previewReady'))
          }
          error={previewJob?.error?.message}
        >
          <SettingsTextarea
            aria-label={translate('settings.ttsSettings.text')}
            commitOn="input"
            value={text}
            placeholder={translate('settings.ttsSettings.textPlaceholder')}
            onChange={(e) => setText(e.target.value)}
          />
          <GenerationPreviewActions
            startLabel={translate('settings.ttsSettings.play')}
            stopLabel={translate('settings.ttsSettings.stop')}
            startDisabled={
              busy ||
              pending ||
              active ||
              !text.trim() ||
              !previewServer?.baseUrl ||
              !previewServer?.model
            }
            stopDisabled={pending}
            onStart={() =>
              void run(async () => {
                await invoke('ttsPreview', [
                  text,
                  crypto.randomUUID(),
                  previewServer?.id,
                  previewInstructions.trim() ? previewInstructions : undefined,
                ]);
              })
            }
            onStop={() =>
              void run(async () => {
                await invoke('ttsStop');
              })
            }
          />
        </SettingsField>
      </SettingsSection>
    </div>
  );
}

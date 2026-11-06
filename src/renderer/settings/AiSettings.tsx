import { GenerationPreviewActions } from './GenerationPreviewActions';
import { HostMessage, useHostTranslation } from '../HostTranslation';
import { useSettingsFeedback } from '../settings-ui/SettingsStatus';
import { useRef, useState } from 'react';
import type { SettingsControlEditor } from '../settings-ui/api';
import type { SettingsPageAuxiliary } from '../../shared/settings-page';
import { defaultAiSettings, type AiConnectionSettings } from '../../shared/ai';
import { SettingsTextarea } from '../settings-ui/SettingsInput';
import { SettingsSection, SettingsField, SettingsContent } from '../settings-ui/SettingsSections';
import { SettingsDialog } from '../settings-ui/SettingsModal';
import { settingAnchor } from '../settings-ui/setting-anchor';
import { SettingsMcpScope } from '../settings-ui/SettingsMcpAccess';
import { settingsItemId } from '../../shared/settings-catalog';
import { GenerationServerList } from './GenerationServerList';
import {
  AiConnectionDialog,
  AiConnectionOrderDialog,
  aiPresetNames,
  type AiInvoke,
} from './AiConnectionDialog';

export function AiSettingsForm({
  editor,
  auxiliary,
  invoke,
  busy,
}: {
  editor: SettingsControlEditor;
  auxiliary?: SettingsPageAuxiliary['ai'];
  invoke: AiInvoke;
  busy: boolean;
}) {
  const { t: translate } = useHostTranslation();
  const value = editor.value.ai ?? defaultAiSettings();
  const [selected, setSelected] = useState('');
  const c =
    value.connections.find((v) => v.id === selected) ??
    value.connections.find((v) => v.id === value.defaultConnectionId) ??
    value.connections[0];
  const [dialog, setDialog] = useState<
    | {
        kind: 'edit' | 'delete';
        original: AiConnectionSettings | null;
        status?: NonNullable<SettingsPageAuxiliary['ai']>['connections'][number];
      }
    | { kind: 'order'; connections: AiConnectionSettings[] }
    | null
  >(null);
  const [prompt, setPrompt] = useState(''),
    [input, setInput] = useState('');
  const [pending, setPending] = useState(false),
    [error, setError] = useState('');
  const operation = useRef(false);
  const run = async (work: () => Promise<void>) => {
    if (operation.current) return;
    operation.current = true;
    setPending(true);
    setError('');
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : translate('settings.aiSettings.operationFailed'));
    } finally {
      operation.current = false;
      setPending(false);
    }
  };
  const jobs = (auxiliary?.jobs ?? []).filter((j) => j.connectionId === c?.id),
    job = jobs.at(-1);
  const active = jobs.some((j) => ['queued', 'running'].includes(j.state));
  const change = (next: typeof value) => editor.edit({ ...editor.value, ai: next });
  const open = (kind: 'edit' | 'delete', original: AiConnectionSettings | null) =>
    setDialog({
      kind,
      original: original ? structuredClone(original) : null,
      status: auxiliary?.connections.find((v) => v.id === original?.id),
    });
  useSettingsFeedback({ busy: pending, error });
  return (
    <div className="settings-sections ai-settings">
      <SettingsContent
        className="ai-connection-table"
        data-testid="ai-connections"
        {...settingAnchor('ai', 'connections')}
      >
        <GenerationServerList
          kind="ai"
          servers={value.connections}
          defaultId={value.defaultConnectionId}
          statuses={auxiliary?.connections}
          busy={busy}
          presetName={(server) => aiPresetNames[server.preset]}
          model={(server) => server.defaultModel}
          onEdit={(server) => open('edit', server)}
          onDelete={(server) => open('delete', server)}
          onOrder={() =>
            setDialog({ kind: 'order', connections: structuredClone(value.connections) })
          }
        />
      </SettingsContent>
      <SettingsSection>
        <SettingsField
          title={translate('settings.aiSettings.defaultConnection')}
          {...settingAnchor('ai', 'defaultConnectionId')}
        >
          <select
            aria-label={translate('settings.aiSettings.defaultConnection')}
            value={value.defaultConnectionId ?? ''}
            onChange={(e) => change({ ...value, defaultConnectionId: e.target.value || undefined })}
          >
            <option value="">{translate('settings.aiSettings.perCall')}</option>
            {value.defaultConnectionId &&
              !value.connections.some((v) => v.id === value.defaultConnectionId) && (
                <option value={value.defaultConnectionId}>
                  {translate('settings.aiSettings.missingConnection')}
                  {value.defaultConnectionId}
                </option>
              )}
            {value.connections.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </SettingsField>
      </SettingsSection>
      {dialog?.kind === 'edit' && (
        <SettingsMcpScope itemId={settingsItemId('ai', 'connections')}>
          <AiConnectionDialog
            original={dialog.original}
            status={dialog.status}
            invoke={invoke}
            onClose={() => setDialog(null)}
          />
        </SettingsMcpScope>
      )}
      {dialog?.kind === 'order' && (
        <AiConnectionOrderDialog
          connections={dialog.connections}
          invoke={invoke}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'delete' && dialog.original && (
        <SettingsDialog
          title={translate('settings.aiSettings.deleteServer')}
          applyLabel={translate('settings.aiSettings.delete')}
          onClose={() => setDialog(null)}
          onApply={() =>
            invoke('aiDeleteConnection', [dialog.original, dialog.status?.keyRevision])
          }
        >
          <p>
            <HostMessage
              message="settings.aiSettings.deleteConfirmation"
              values={{ name: <strong>{dialog.original.name}</strong> }}
            />
          </p>
          <p className="muted">{translate('settings.aiSettings.deleteHint')}</p>
        </SettingsDialog>
      )}
      <SettingsSection
        title={translate('settings.aiSettings.test')}
        description={translate('settings.aiSettings.testHint')}
        {...settingAnchor('ai', 'preview')}
      >
        <SettingsField title={translate('settings.generation.server')}>
          <select
            aria-label={translate('settings.aiSettings.testServer')}
            value={c?.id ?? ''}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="" disabled>
              {translate('settings.aiSettings.selectServer')}
            </option>
            {value.connections.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </SettingsField>
        <SettingsField
          title={translate('settings.aiSettings.extraPrompt')}
          description={translate('settings.aiSettings.extraPromptHint')}
        >
          <SettingsTextarea
            aria-label={translate('settings.aiSettings.extraPromptLabel')}
            commitOn="input"
            placeholder={translate('settings.aiSettings.extraPromptPlaceholder')}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </SettingsField>
        <SettingsField title={translate('settings.aiSettings.input')}>
          <SettingsTextarea
            aria-label={translate('settings.aiSettings.inputLabel')}
            commitOn="input"
            placeholder={translate('settings.aiSettings.inputPlaceholder')}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <GenerationPreviewActions
            startLabel={translate('settings.aiSettings.generate')}
            stopLabel={translate('settings.aiSettings.cancel')}
            startDisabled={
              busy ||
              pending ||
              active ||
              !c ||
              !c.defaultModel?.trim() ||
              !(c.alwaysPrompt.trim() || c.defaultPrompt.trim() || prompt.trim() || input.trim())
            }
            stopDisabled={pending || !active}
            onStart={() =>
              void run(async () => {
                await invoke('aiPreview', [
                  {
                    requestId: crypto.randomUUID(),
                    connectionId: c!.id,
                    ...(prompt.trim() ? { additionalPrompt: prompt } : {}),
                    input,
                  },
                ]);
              })
            }
            onStop={() =>
              void run(async () => {
                for (const j of jobs.filter((j) => ['queued', 'running'].includes(j.state)))
                  await invoke('aiCancel', [j.jobId]);
              })
            }
          />
        </SettingsField>

        {job && (
          <SettingsField
            title={translate('settings.aiSettings.result')}
            className="settings-field-wide"
            description={`${
              {
                queued: translate('settings.aiSettings.queued'),
                running: translate('settings.aiSettings.generating'),
                completed: translate('settings.aiSettings.completed'),
                failed: translate('settings.aiSettings.failed'),
                canceled: translate('settings.aiSettings.canceled'),
              }[job.state]
            }：${job.model}${job.resultExpired ? translate('settings.aiSettings.expired') : ''}`}
            error={job.error?.message}
          >
            {job.text && <pre className="ai-preview-result">{job.text}</pre>}
          </SettingsField>
        )}
      </SettingsSection>
    </div>
  );
}

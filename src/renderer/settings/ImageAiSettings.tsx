import { GenerationPreviewActions } from './GenerationPreviewActions';
import { HostMessage, useHostTranslation } from '../HostTranslation';
import { useSettingsFeedback } from '../settings-ui/SettingsStatus';
import { useEffect, useRef, useState } from 'react';
import type { SettingsControlEditor } from '../settings-ui/api';
import type { SettingsPageAuxiliary } from '../../shared/settings-page';
import { defaultImageAiSettings, type ImageAiConnection } from '../../shared/image-ai';
import { SettingsTextarea } from '../settings-ui/SettingsInput';
import { SettingsSection, SettingsField, SettingsContent } from '../settings-ui/SettingsSections';
import { SettingsDialog } from '../settings-ui/SettingsModal';
import { settingAnchor } from '../settings-ui/setting-anchor';
import { SettingsMcpScope } from '../settings-ui/SettingsMcpAccess';
import { settingsItemId } from '../../shared/settings-catalog';
import { GenerationServerList } from './GenerationServerList';
import { ImageAiConnectionDialog, ImageAiConnectionOrderDialog } from './ImageAiConnectionDialog';
import type { AiInvoke } from './AiConnectionDialog';
import type { ImageAiJob, ImageReadResult } from '../../shared/image-ai';

export function ImageAiSettingsForm({
  editor,
  auxiliary,
  invoke,
  busy,
}: {
  editor: SettingsControlEditor;
  auxiliary?: SettingsPageAuxiliary['imageAi'];
  invoke: AiInvoke;
  busy: boolean;
}) {
  const { t: translate } = useHostTranslation();
  const value = editor.value.imageAi ?? defaultImageAiSettings();
  const [selected, setSelected] = useState('');
  const c =
    value.connections.find((v) => v.id === selected) ??
    value.connections.find((v) => v.id === value.defaultConnectionId) ??
    value.connections[0];
  const [dialog, setDialog] = useState<
    | {
        kind: 'edit' | 'delete';
        original: ImageAiConnection | null;
        status?: NonNullable<SettingsPageAuxiliary['imageAi']>['connections'][number];
      }
    | { kind: 'order'; connections: ImageAiConnection[] }
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
  const change = (next: typeof value) => editor.edit({ ...editor.value, imageAi: next });
  const open = (kind: 'edit' | 'delete', original: ImageAiConnection | null) =>
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
        {...settingAnchor('image-ai', 'connections')}
      >
        <GenerationServerList
          kind="imageAi"
          servers={value.connections}
          defaultId={value.defaultConnectionId}
          statuses={auxiliary?.connections}
          busy={busy}
          presetName={() => 'OpenAI Images API'}
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
          {...settingAnchor('image-ai', 'defaultConnectionId')}
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
        <SettingsMcpScope itemId={settingsItemId('image-ai', 'connections')}>
          <ImageAiConnectionDialog
            original={dialog.original}
            status={dialog.status}
            invoke={invoke}
            onClose={() => setDialog(null)}
          />
        </SettingsMcpScope>
      )}
      {dialog?.kind === 'order' && (
        <ImageAiConnectionOrderDialog
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
            invoke('imageAiDeleteConnection', [dialog.original, dialog.status?.keyRevision])
          }
        >
          <p>
            <HostMessage
              message="settings.aiSettings.deleteConfirmation"
              values={{ name: <strong>{dialog.original.name}</strong> }}
            />
          </p>
          <p className="muted">{translate('imageAi.deleteHint')}</p>
        </SettingsDialog>
      )}
      <SettingsSection
        title={translate('imageAi.test')}
        description={translate('imageAi.testHint')}
        {...settingAnchor('image-ai', 'preview')}
      >
        <SettingsField title={translate('settings.generation.server')}>
          <select
            aria-label={translate('settings.aiSettings.testServer')}
            value={c?.id ?? ''}
            onChange={(e) => setSelected(e.target.value)}
            disabled={pending}
          >
            <option value="">{translate('settings.aiSettings.selectServer')}</option>
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
            value={prompt}
            placeholder={translate('imageAi.extraPromptPlaceholder')}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </SettingsField>
        <SettingsField title={translate('settings.aiSettings.input')}>
          <SettingsTextarea
            aria-label={translate('settings.aiSettings.inputLabel')}
            commitOn="input"
            value={input}
            placeholder={translate('imageAi.inputPlaceholder')}
            onChange={(e) => setInput(e.target.value)}
          />
          <GenerationPreviewActions
            startLabel={translate('imageAi.generate')}
            stopLabel={translate('settings.aiSettings.cancel')}
            startDisabled={
              busy ||
              pending ||
              active ||
              !c ||
              !c.defaultModel.trim() ||
              !(c.alwaysPrompt.trim() || c.defaultPrompt.trim() || prompt.trim() || input.trim())
            }
            stopDisabled={pending || !active}
            onStart={() =>
              void run(async () => {
                await invoke('imageAiPreview', [
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
                if (job) await invoke('imageAiCancel', [job.jobId]);
              })
            }
          />
        </SettingsField>
        {job && (
          <SettingsField
            title={translate('imageAi.result')}
            description={
              {
                queued: translate('settings.aiSettings.queued'),
                running: translate('settings.aiSettings.generating'),
                saving: translate('imageGeneration.state.saving'),
                unsaved: translate('imageGeneration.state.unsaved'),
                completed: translate('settings.aiSettings.completed'),
                failed: translate('settings.aiSettings.failed'),
                canceled: translate('settings.aiSettings.canceled'),
              }[job.state]
            }
          >
            {job.error && <p>{job.error.message}</p>}
            {job.resultExpired ? (
              <p>{translate('imageAi.expired')}</p>
            ) : (
              job.state === 'completed' && (
                <ImageAiPreview key={job.jobId} job={job} invoke={invoke} />
              )
            )}
          </SettingsField>
        )}
      </SettingsSection>
    </div>
  );
}
function ImageAiPreview({ job, invoke }: { job: ImageAiJob; invoke: AiInvoke }) {
  const { t } = useHostTranslation();
  const [urls, setUrls] = useState<string[]>([]),
    [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    const created: string[] = [];
    void (async () => {
      for (const image of job.images ?? []) {
        let offset = 0,
          done = false;
        const chunks: Uint8Array<ArrayBuffer>[] = [];
        while (live && !done) {
          const part: ImageReadResult = await invoke('imageAiRead', [
            { jobId: job.jobId, imageId: image.id, offset },
          ]);
          chunks.push(Uint8Array.from(atob(part.data), (c) => c.charCodeAt(0)));
          offset = part.nextOffset;
          done = part.done;
        }
        if (!live) return;
        created.push(URL.createObjectURL(new Blob(chunks, { type: image.mimeType })));
      }
      if (live) setUrls([...created]);
    })().catch((e) => {
      if (live) setError(e instanceof Error ? e.message : t('imageAi.invalidResponse'));
    });
    return () => {
      live = false;
      for (const url of created) URL.revokeObjectURL(url);
    };
  }, [job.jobId]);
  return (
    <div className="image-ai-preview">
      {error ? (
        <p>{error}</p>
      ) : !urls.length ? (
        <p>{t('imageAi.reading')}</p>
      ) : (
        urls.map((url, i) => (
          <img
            key={url}
            src={url}
            alt={t('imageAi.resultAlt', { index: i + 1 })}
            style={{ maxWidth: '100%', maxHeight: 480, objectFit: 'contain' }}
          />
        ))
      )}
    </div>
  );
}

import { HostMessage, useHostTranslation } from '../HostTranslation';
import { useSettingsFeedback } from '../settings-ui/SettingsStatus';
import { useRef, useState } from 'react';
import type { SettingsControlEditor } from '../settings-ui/api';
import type { SettingsPageAuxiliary } from '../../shared/settings-page';
import { defaultAiSettings, type AiConnectionSettings } from '../../shared/ai';
import { SettingsInput, SettingsTextarea } from '../settings-ui/SettingsInput';
import {
  SettingsSection,
  SettingsField,
  SettingsActions,
  SettingsContent,
} from '../settings-ui/SettingsSections';
import { SettingsDialog } from '../settings-ui/SettingsModal';
import { settingAnchor } from '../settings-ui/setting-anchor';
import {
  ListIcon,
  SettingsListAddButton,
  SettingsListLayout,
} from '../settings-ui/SettingsListTable';
import { CommandListSummary } from '../settings-ui/CommandListScroll';
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
  const [model, setModel] = useState(''),
    [prompt, setPrompt] = useState(''),
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
        <SettingsListLayout
          title={translate('settings.aiSettings.registered')}
          actionsAlign="start"
          toolbar={
            <CommandListSummary className="settings-list-toolbar" actions={null}>
              {translate('settings.aiSettings.serverCount', { count: value.connections.length })}
            </CommandListSummary>
          }
        >
          <thead>
            <tr>
              <th>
                <span className="settings-list-heading">
                  {translate('settings.aiSettings.server')}
                  <SettingsListAddButton
                    label={translate('settings.aiSettings.add')}
                    disabled={busy || value.connections.length >= 8}
                    onClick={() => open('edit', null)}
                  />
                  <button
                    className="settings-list-icon ai-icon-button"
                    aria-label={translate('settings.aiSettings.order')}
                    title={translate('settings.aiSettings.orderAction')}
                    disabled={busy || value.connections.length < 2}
                    onClick={() =>
                      setDialog({
                        kind: 'order',
                        connections: structuredClone(value.connections),
                      })
                    }
                  >
                    <ListIcon kind="order" />
                  </button>
                </span>
              </th>
              <th>{translate('settings.aiSettings.model')}</th>
              <th className="settings-list-actions-heading">
                {translate('settings.aiSettings.actions')}
              </th>
            </tr>
          </thead>
          <tbody>
            {value.connections.map((server) => (
              <tr key={server.id} data-ai-connection={server.id}>
                <td className="settings-list-wrap">
                  <div className="ai-server-heading">
                    <strong>{server.name || server.id}</strong>
                    {server.id === value.defaultConnectionId && (
                      <span className="ai-default-badge">
                        {translate('settings.aiSettings.default')}
                      </span>
                    )}
                  </div>
                  <small>{aiPresetNames[server.preset]}</small>
                  <small className="ai-server-url">
                    {server.baseUrl || translate('settings.aiSettings.unsetUrl')}
                  </small>
                </td>
                <td className="settings-list-wrap">
                  <span className="ai-model-name">
                    {server.defaultModel || translate('settings.aiSettings.perCall')}
                  </span>
                  {auxiliary?.connections.find((v) => v.id === server.id)?.error && (
                    <small className="error-text">
                      {translate('settings.aiSettings.checkKey')}
                    </small>
                  )}
                </td>
                <td className="settings-list-actions-cell">
                  <div className="settings-list-actions ai-row-actions">
                    <button
                      className="settings-list-icon ai-icon-button"
                      aria-label={translate('settings.aiSettings.serverSettings', {
                        name: server.name,
                      })}
                      title={translate('settings.aiSettings.settings')}
                      disabled={busy}
                      onClick={() => open('edit', server)}
                    >
                      <ListIcon kind="edit" />
                    </button>
                    <button
                      className="settings-list-icon settings-list-delete ai-icon-button ai-delete-button"
                      aria-label={translate('settings.aiSettings.deleteServerLabel', {
                        name: server.name,
                      })}
                      title={translate('settings.aiSettings.delete')}
                      disabled={busy}
                      onClick={() => open('delete', server)}
                    >
                      <ListIcon kind="delete" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!value.connections.length && (
              <tr>
                <td colSpan={3}>
                  <div className="ai-empty">
                    <strong>{translate('settings.aiSettings.empty')}</strong>
                    <p>{translate('settings.aiSettings.emptyHint')}</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </SettingsListLayout>
      </SettingsContent>
      <SettingsSection
        title={translate('settings.aiSettings.common')}
        hint={translate('settings.aiSettings.commonHint')}
      >
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
        <SettingsField
          title={translate('settings.aiSettings.prompt')}
          hint={translate('settings.aiSettings.promptHint')}
          {...settingAnchor('ai', 'commonPrompt')}
        >
          <SettingsTextarea
            aria-label={translate('settings.aiSettings.prompt')}
            maxLength={2048}
            value={value.commonPrompt}
            onChange={(e) => change({ ...value, commonPrompt: e.target.value })}
          />
        </SettingsField>
      </SettingsSection>
      {dialog?.kind === 'edit' && (
        <AiConnectionDialog
          original={dialog.original}
          status={dialog.status}
          invoke={invoke}
          onClose={() => setDialog(null)}
        />
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
        collapsible
        description={translate('settings.aiSettings.testHint')}
        {...settingAnchor('ai', 'preview')}
      >
        <SettingsField title={translate('settings.aiSettings.testServer')}>
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
          title={translate('settings.aiSettings.modelOverride')}
          hint={translate('settings.aiSettings.modelOverrideHint')}
        >
          <SettingsInput
            aria-label={translate('settings.aiSettings.testModel')}
            commitOn="input"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
        </SettingsField>
        <SettingsField title={translate('settings.aiSettings.extraPrompt')}>
          <SettingsTextarea
            aria-label={translate('settings.aiSettings.extraPromptLabel')}
            commitOn="input"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </SettingsField>
        <SettingsField title={translate('settings.aiSettings.input')}>
          <SettingsTextarea
            aria-label={translate('settings.aiSettings.inputLabel')}
            commitOn="input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </SettingsField>
        <SettingsActions>
          <button
            className="primary"
            disabled={
              busy ||
              pending ||
              active ||
              !c ||
              !(value.commonPrompt.trim() || prompt.trim() || input.trim())
            }
            onClick={() =>
              void run(async () => {
                await invoke('aiPreview', [
                  {
                    requestId: crypto.randomUUID(),
                    connectionId: c!.id,
                    ...(model ? { model } : {}),
                    additionalPrompt: prompt,
                    input,
                  },
                ]);
              })
            }
          >
            {translate('settings.aiSettings.generate')}
          </button>
          <button
            disabled={pending || !active}
            onClick={() =>
              void run(async () => {
                for (const j of jobs.filter((j) => ['queued', 'running'].includes(j.state)))
                  await invoke('aiCancel', [j.jobId]);
              })
            }
          >
            {translate('settings.aiSettings.cancel')}
          </button>
        </SettingsActions>

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

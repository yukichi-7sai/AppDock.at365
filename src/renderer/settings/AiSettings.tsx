import { useRef, useState } from 'react';
import type { SettingsControlEditor } from '../settings-ui/api';
import type { SettingsPageAuxiliary } from '../../shared/settings-page';
import { defaultAiSettings, type AiConnectionSettings } from '../../shared/ai';
import { SettingsInput, SettingsTextarea } from '../settings-ui/SettingsInput';
import { SettingsSection, SettingsField, SettingsFeedback } from '../settings-ui/SettingsSections';
import { SettingsDialog } from '../settings-ui/SettingsModal';
import { settingAnchor } from '../settings-ui/setting-anchor';
import {
  AiConnectionDialog,
  AiConnectionOrderDialog,
  aiPresetNames,
  type AiInvoke,
} from './AiConnectionDialog';

function ActionIcon({ kind }: { kind: 'edit' | 'delete' | 'order' }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === 'edit' ? (
        <>
          <path d="m9 3-1 3-3 1-2 3 2 2-1 3 3 2 3-1 2 2 3-1 1-3 3-1 2-3-2-2 1-3-3-2-3 1-2-2Z" />
          <circle cx="11.5" cy="10.5" r="3" />
        </>
      ) : kind === 'delete' ? (
        <>
          <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
        </>
      ) : (
        <>
          <path d="M8 4v16m-4-4 4 4 4-4M16 20V4m-4 4 4-4 4 4" />
        </>
      )}
    </svg>
  );
}
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
      setError(e instanceof Error ? e.message : 'AIの操作に失敗しました。');
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
  return (
    <div className="settings-sections ai-settings">
      <SettingsSection
        title="AI接続設定"
        description="ローカルサーバーやクラウドのAIを登録します。接続先は8件まで追加できます。"
        {...settingAnchor('ai', 'connections')}
      >
        <div className="ai-connections-toolbar">
          <span className="muted">{value.connections.length} / 8 サーバー</span>
          <div>
            <button
              className="ai-icon-button"
              aria-label="AIサーバーを並べ替え"
              title="並べ替え"
              disabled={busy || value.connections.length < 2}
              onClick={() =>
                setDialog({ kind: 'order', connections: structuredClone(value.connections) })
              }
            >
              <ActionIcon kind="order" />
            </button>
            <button
              className="primary ai-add-button"
              data-dialog-focus-fallback
              aria-label="AIサーバーを追加"
              disabled={busy || value.connections.length >= 8}
              onClick={() => open('edit', null)}
            >
              <span aria-hidden="true">＋</span>追加
            </button>
          </div>
        </div>
        <div className="command-shortcuts ai-connection-table">
          <table className="applet-shortcut-overview" aria-label="登録済みAIサーバー">
            <thead>
              <tr>
                <th>サーバー</th>
                <th>モデル</th>
                <th>
                  <span className="ai-action-heading">操作</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {value.connections.map((server) => (
                <tr key={server.id} data-ai-connection={server.id}>
                  <td>
                    <div className="ai-server-heading">
                      <strong>{server.name || server.id}</strong>
                      {server.id === value.defaultConnectionId && (
                        <span className="ai-default-badge">既定</span>
                      )}
                    </div>
                    <small>{aiPresetNames[server.preset]}</small>
                    <small className="ai-server-url">{server.baseUrl || 'URL未設定'}</small>
                  </td>
                  <td>
                    <span className="ai-model-name">{server.defaultModel || '呼出し時に指定'}</span>
                    {auxiliary?.connections.find((v) => v.id === server.id)?.error && (
                      <small className="error-text">APIキーを確認してください</small>
                    )}
                  </td>
                  <td>
                    <div className="ai-row-actions">
                      <button
                        className="ai-icon-button"
                        aria-label={server.name + 'の設定'}
                        title="設定"
                        disabled={busy}
                        onClick={() => open('edit', server)}
                      >
                        <ActionIcon kind="edit" />
                      </button>
                      <button
                        className="ai-icon-button ai-delete-button"
                        aria-label={server.name + 'を削除'}
                        title="削除"
                        disabled={busy}
                        onClick={() => open('delete', server)}
                      >
                        <ActionIcon kind="delete" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!value.connections.length && (
                <tr>
                  <td colSpan={3}>
                    <div className="ai-empty">
                      <strong>AIサーバーを追加しましょう</strong>
                      <p>右上の＋から接続先とモデルを設定できます。</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SettingsSection>
      <SettingsSection
        title="共通設定"
        description="AppletやMCPからの文章生成に使う共通の設定です。"
      >
        <SettingsField title="既定のAI接続" {...settingAnchor('ai', 'defaultConnectionId')}>
          <select
            aria-label="既定のAI接続"
            value={value.defaultConnectionId ?? ''}
            onChange={(e) => change({ ...value, defaultConnectionId: e.target.value || undefined })}
          >
            <option value="">呼出し時に指定</option>
            {value.defaultConnectionId &&
              !value.connections.some((v) => v.id === value.defaultConnectionId) && (
                <option value={value.defaultConnectionId}>
                  未配置の接続：{value.defaultConnectionId}
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
          title="共通プロンプト"
          description="すべての用途に共通する方針を入力します。"
          {...settingAnchor('ai', 'commonPrompt')}
        >
          <SettingsTextarea
            aria-label="共通プロンプト"
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
          title="AIサーバーを削除"
          applyLabel="削除"
          onClose={() => setDialog(null)}
          onApply={() =>
            invoke('aiDeleteConnection', [dialog.original, dialog.status?.keyRevision])
          }
        >
          <p>
            <strong>{dialog.original.name}</strong>を削除しますか？
          </p>
          <p className="muted">
            このPCのAPIキーも削除します。この接続を指定しているAppletやMCPからは利用できなくなります。
          </p>
        </SettingsDialog>
      )}
      <SettingsSection
        title="文章生成の試験"
        collapsible
        description="入力は選択した接続先に送信され、課金される場合があります。最初は架空の入力で確認してください。共通プロンプトも適用されます。"
        {...settingAnchor('ai', 'preview')}
      >
        <SettingsField title="試験するAIサーバー">
          <select
            aria-label="試験するAIサーバー"
            value={c?.id ?? ''}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="" disabled>
              サーバーを選択
            </option>
            {value.connections.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </SettingsField>
        <SettingsField
          title="今回のモデル"
          description="空欄なら選択した接続の既定モデルを使います。"
        >
          <SettingsInput
            aria-label="試験のAIモデル"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
        </SettingsField>
        <SettingsField title="追加プロンプト">
          <SettingsTextarea
            aria-label="試験の追加プロンプト"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </SettingsField>
        <SettingsField title="入力データ">
          <SettingsTextarea
            aria-label="試験の入力データ"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </SettingsField>
        <div className="settings-actions">
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
            文章を生成
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
            生成を取り消す
          </button>
        </div>
        <SettingsFeedback busy={pending} error={error} />
        {job && (
          <div role="status">
            <p>
              {
                {
                  queued: '待機中',
                  running: '生成中',
                  completed: '完了',
                  failed: '失敗',
                  canceled: '取消',
                }[job.state]
              }
              ：{job.model}
              {job.error ? ' — ' + job.error.message : ''}
            </p>
            {job.text && <pre className="ai-preview-result">{job.text}</pre>}
            {job.resultExpired && <p>生成結果の保持期限を過ぎました。</p>}
          </div>
        )}
      </SettingsSection>
    </div>
  );
}

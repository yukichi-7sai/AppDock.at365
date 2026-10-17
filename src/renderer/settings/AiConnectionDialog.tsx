import { useEffect, useId, useRef, useState } from 'react';
import {
  aiBaseUrl,
  aiOutputTokenLimits,
  aiTimeoutLimits,
  newAiConnection,
  type AiConnectionSettings,
  type AiModel,
} from '../../shared/ai';
import { SettingsInput, SettingsUrlInput } from '../settings-ui/SettingsInput';
import { SettingsOrderDialog } from '../settings-ui/SettingsOrderDialog';
import { SettingsDialog } from '../settings-ui/SettingsModal';
import { SettingsSection, SettingsField, SettingsFeedback } from '../settings-ui/SettingsSections';

export const aiPresetNames = {
  ollama: 'Ollama',
  'lm-studio': 'LM Studio',
  'llama-cpp': 'llama.cpp',
  openai: 'OpenAI',
  custom: 'その他の互換サーバー',
};
export type AiInvoke = (name: string, args?: unknown[]) => Promise<any>;
export function AiConnectionDialog({
  original,
  status,
  invoke,
  onClose,
}: {
  original: AiConnectionSettings | null;
  status?: { apiKeyConfigured: boolean; keyRevision: string };
  invoke: AiInvoke;
  onClose(): void;
}) {
  const [draft, setDraft] = useState(() =>
    structuredClone(original ?? newAiConnection(crypto.randomUUID())),
  );
  const [apiKey, setApiKey] = useState<string | undefined>();
  const [models, setModels] = useState<AiModel[]>([]),
    [pending, setPending] = useState(false);
  const [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const [temperature, setTemperature] = useState(String(draft.compatibility.temperature ?? ''));
  const [tokenLimit, setTokenLimit] = useState(
    String(draft.defaultMaxOutputTokens ?? aiOutputTokenLimits.default),
  );
  const [timeoutSeconds, setTimeoutSeconds] = useState(
    String(draft.defaultTimeoutSeconds ?? aiTimeoutLimits.defaultSeconds),
  );
  const generation = useRef(0),
    live = useRef(true),
    fetching = useRef(false);
  const modelListId = useId();
  const modelRequest = useRef<string | undefined>(undefined);
  useEffect(
    () => () => {
      live.current = false;
      generation.current++;
      if (modelRequest.current)
        void invoke('aiCancelModels', [modelRequest.current]).catch(() => {});
    },
    [],
  );
  const invalidate = () => {
    generation.current++;
    setModels([]);
    setMessage('');
    setError('');
  };
  const patch = (next: Partial<AiConnectionSettings>) => {
    invalidate();
    setDraft((c) => ({ ...c, ...next }));
  };
  const normalize = (value: string) => {
    try {
      const baseUrl = aiBaseUrl(value.trim());
      setDraft((c) => ({ ...c, baseUrl }));
      setError('');
      return baseUrl;
    } catch (e) {
      setError((e as Error).message);
      return undefined;
    }
  };
  const fetchModels = async (next = draft, key = apiKey) => {
    if (fetching.current) return;
    const baseUrl = normalize(next.baseUrl);
    if (baseUrl === undefined) return;
    fetching.current = true;
    setPending(true);
    setError('');
    setMessage('');
    const started = ++generation.current;
    try {
      modelRequest.current = crypto.randomUUID();
      const result = await invoke('aiDraftModels', [
        { ...next, baseUrl },
        key,
        modelRequest.current,
      ]);
      if (!live.current || started !== generation.current) return;
      setModels(result.models);
      setMessage(
        result.models.length
          ? `${result.models.length}件のモデルを取得しました。入力欄から選択できます。`
          : 'モデル一覧は空です。モデルIDを直接入力できます。',
      );
    } catch (e) {
      if (live.current && started === generation.current)
        setError(e instanceof Error ? e.message : 'モデル一覧を取得できませんでした。');
    } finally {
      fetching.current = false;
      if (live.current) setPending(false);
    }
  };
  const enter = (event: React.KeyboardEvent<HTMLInputElement>, field: 'url' | 'key') => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)
      return;
    event.preventDefault();
    if (field === 'url') void fetchModels({ ...draft, baseUrl: event.currentTarget.value });
    else void fetchModels(draft, event.currentTarget.value || apiKey);
  };
  const sameEndpoint = (() => {
    try {
      return aiBaseUrl(draft.baseUrl.trim()) === original?.baseUrl;
    } catch {
      return false;
    }
  })();
  const savedKey = status?.apiKeyConfigured && sameEndpoint;
  return (
    <SettingsDialog
      title={original ? 'AIサーバーを編集' : 'AIサーバーを追加'}
      description="OpenAI互換APIに接続します。モデルIDは直接入力することもできます。"
      className="ai-connection-dialog"
      onClose={onClose}
      valid={!pending && !!draft.name.trim() && !!draft.baseUrl.trim()}
      footer="OKで接続情報をまとめて保存します。"
      onApply={async () => {
        const next = {
          ...draft,
          baseUrl: draft.baseUrl.trim(),
          defaultMaxOutputTokens: Number(tokenLimit),
          defaultTimeoutSeconds: Number(timeoutSeconds),
          compatibility: {
            ...draft.compatibility,
            temperature: temperature.trim() === '' ? undefined : Number(temperature),
          },
        };
        await invoke('aiSaveConnection', [next, original, apiKey, status?.keyRevision]);
      }}
    >
      <div className="ai-connection-fields">
        <SettingsField title="種類">
          <select
            data-initial-focus
            aria-label="AI接続の種類"
            value={draft.preset}
            onChange={(e) => {
              const preset = e.target.value as AiConnectionSettings['preset'];
              const next = newAiConnection(draft.id, preset),
                previous = newAiConnection(draft.id, draft.preset);
              patch({
                preset,
                authentication: next.authentication,
                compatibility: next.compatibility,
                baseUrl:
                  !draft.baseUrl || draft.baseUrl === previous.baseUrl
                    ? next.baseUrl
                    : draft.baseUrl,
              });
              setTemperature('');
            }}
          >
            {Object.entries(aiPresetNames).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </SettingsField>
        <SettingsField title="APIのURL" description="/v1まで入力し、Enterでモデルを取得します。">
          <SettingsUrlInput
            aria-label="AIのAPIのURL"
            value={draft.baseUrl}
            spellCheck={false}
            placeholder={
              draft.preset === 'lm-studio'
                ? 'http://server:1234/v1'
                : draft.preset === 'openai'
                  ? 'https://api.openai.com/v1'
                  : 'http://server:11434/v1'
            }
            onInput={(e) => {
              invalidate();
              const baseUrl = e.currentTarget.value;
              setDraft((c) => ({ ...c, baseUrl }));
            }}
            onChange={(e) => {
              const raw = e.target.value;
              const normalized = normalize(raw);
              if (normalized === undefined) setDraft((c) => ({ ...c, baseUrl: raw }));
              else if (normalized !== draft.baseUrl) invalidate();
            }}
            onKeyDown={(e) => enter(e, 'url')}
          />
        </SettingsField>
        <SettingsField title="名前">
          <SettingsInput
            aria-label="AI接続の名前"
            maxLength={160}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </SettingsField>
        <SettingsField title="認証">
          <select
            aria-label="AIの認証方式"
            value={draft.authentication}
            onChange={(e) => patch({ authentication: e.target.value as 'none' | 'bearer' })}
          >
            <option value="none">認証なし</option>
            <option value="bearer">APIキー（Bearer）</option>
          </select>
          {draft.authentication === 'bearer' && (
            <>
              <SettingsInput
                aria-label="AIのAPIキー"
                type="password"
                autoComplete="off"
                maxLength={8192}
                value={apiKey ?? ''}
                placeholder={savedKey ? '保存済み・変更する場合だけ入力' : 'APIキーを入力'}
                onChange={(e) => {
                  invalidate();
                  setApiKey(e.target.value || undefined);
                }}
                onKeyDown={(e) => enter(e, 'key')}
              />
              <small className="muted">
                このPCに暗号化して保存します。Enterでモデルを取得できます。
              </small>
            </>
          )}
        </SettingsField>
        <SettingsField title="モデル" description="呼出し側で省略したときに使う既定モデルです。">
          <div className="ai-model-picker">
            <SettingsInput
              aria-label="AIの既定モデル"
              list={modelListId}
              maxLength={200}
              placeholder="モデルを選択、またはIDを入力"
              value={draft.defaultModel ?? ''}
              onChange={(e) => setDraft({ ...draft, defaultModel: e.target.value })}
            />
            <button
              className="ai-icon-button"
              aria-label="モデル一覧を取得"
              title="モデル一覧を取得"
              disabled={pending || !draft.baseUrl}
              onClick={() => void fetchModels()}
            >
              {pending ? '…' : '↻'}
            </button>
          </div>
          <datalist id={modelListId}>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </datalist>
          <SettingsFeedback busy={pending} error={error} message={message} />
        </SettingsField>
      </div>
      <SettingsSection title="サーバーに合わせた詳細設定" collapsible>
        <SettingsField
          title="既定の出力トークン上限"
          description="APIで未指定のときと文章生成の試験に使います。思考もこの枠を使うモデルがあります。大きな値では待ち時間や料金が増える場合があります。"
        >
          <SettingsInput
            type="number"
            aria-label="AIの既定の出力トークン上限"
            min={aiOutputTokenLimits.minimum}
            max={aiOutputTokenLimits.maximum}
            step={1}
            value={tokenLimit}
            onChange={(e) => setTokenLimit(e.target.value)}
          />
        </SettingsField>
        <SettingsField
          title="既定の待ち時間（秒）"
          description="受付から待機・生成までの期限です。1〜600秒で指定し、APIで指定された待ち時間を優先します。"
        >
          <SettingsInput
            type="number"
            aria-label="AIの既定の待ち時間（秒）"
            min={aiTimeoutLimits.minimumSeconds}
            max={aiTimeoutLimits.maximumSeconds}
            step={1}
            value={timeoutSeconds}
            onChange={(e) => setTimeoutSeconds(e.target.value)}
          />
        </SettingsField>
        <SettingsField title="出力トークン上限の形式">
          <select
            aria-label="AIの出力上限形式"
            value={draft.compatibility.tokenLimitField}
            onChange={(e) =>
              setDraft({
                ...draft,
                compatibility: {
                  ...draft.compatibility,
                  tokenLimitField: e.target.value as 'max_tokens' | 'max_completion_tokens',
                },
              })
            }
          >
            <option value="max_tokens">max_tokens（ローカル互換API）</option>
            <option value="max_completion_tokens">max_completion_tokens（OpenAI）</option>
          </select>
        </SettingsField>
        <SettingsField title="Temperature" description="空欄はサーバーの既定値です。">
          <SettingsInput
            aria-label="AIのTemperature"
            inputMode="decimal"
            value={temperature}
            onChange={(e) => setTemperature(e.target.value)}
          />
        </SettingsField>
        <SettingsField
          title="推論の強さ"
          description="reasoning_effortに対応するモデルだけ指定します。"
        >
          <SettingsInput
            aria-label="AIの推論の強さ"
            value={draft.compatibility.reasoningEffort ?? ''}
            onChange={(e) =>
              setDraft({
                ...draft,
                compatibility: {
                  ...draft.compatibility,
                  reasoningEffort: e.target.value || undefined,
                },
              })
            }
          />
        </SettingsField>
        <SettingsField title="生成結果の保存指定">
          <select
            aria-label="AIの保存指定"
            value={draft.compatibility.store}
            onChange={(e) =>
              setDraft({
                ...draft,
                compatibility: {
                  ...draft.compatibility,
                  store: e.target.value as 'omit' | 'false',
                },
              })
            }
          >
            <option value="omit">指定しない</option>
            <option value="false">store:falseを送信</option>
          </select>
        </SettingsField>
      </SettingsSection>
    </SettingsDialog>
  );
}

export function AiConnectionOrderDialog({
  connections,
  invoke,
  onClose,
}: {
  connections: AiConnectionSettings[];
  invoke: AiInvoke;
  onClose(): void;
}) {
  return (
    <SettingsOrderDialog
      title="AIサーバーの並べ替え"
      listLabel="AIサーバーの表示順"
      items={connections.map((connection) => ({
        id: connection.id,
        title: connection.name,
        description: connection.baseUrl,
      }))}
      onClose={onClose}
      onApply={(ordered, original) => invoke('aiOrderConnections', [original, ordered])}
    />
  );
}

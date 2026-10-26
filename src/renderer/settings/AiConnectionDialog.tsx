import { hostText } from '../../shared/i18n';
import { useHostTranslation } from '../HostTranslation';
import { SettingsButton } from '../settings-ui/SettingsButton';
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
import { SettingsField } from '../settings-ui/SettingsSections';

export const aiPresetNames = {
  ollama: 'Ollama',
  'lm-studio': 'LM Studio',
  'llama-cpp': 'llama.cpp',
  openai: 'OpenAI',
  custom: hostText('settings.aiConnectionDialog.otherServer'),
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
  const { t: translate } = useHostTranslation();
  const [draft, setDraft] = useState(() =>
    structuredClone(original ?? newAiConnection(crypto.randomUUID())),
  );
  const [apiKey, setApiKey] = useState<string | undefined>();
  const [urlReady, setUrlReady] = useState(!!draft.baseUrl.trim());
  const [urlConfirmation, setUrlConfirmation] = useState<{ value: string }>();
  useEffect(() => setUrlReady(!!draft.baseUrl.trim()), [draft.baseUrl]);
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
      setUrlConfirmation({ value: baseUrl });
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
          ? translate('settings.aiConnectionDialog.modelsLoaded', { length: result.models.length })
          : translate('settings.aiConnectionDialog.noModels'),
      );
    } catch (e) {
      if (live.current && started === generation.current)
        setError(
          e instanceof Error ? e.message : translate('settings.aiConnectionDialog.loadFailed'),
        );
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
      title={
        original
          ? translate('settings.aiConnectionDialog.edit')
          : translate('settings.aiConnectionDialog.add')
      }
      description={translate('settings.aiConnectionDialog.hint')}
      className="ai-connection-dialog"
      onClose={onClose}
      valid={!pending && !!draft.name.trim() && urlReady}
      error={error}
      errorTarget={translate('settings.aiConnectionDialog.connection')}
      message={pending ? translate('settings.aiConnectionDialog.loading') : message}
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
      <SettingsField settingKey="preset" title={translate('settings.aiConnectionDialog.kind')}>
        <select
          data-initial-focus
          aria-label={translate('settings.aiConnectionDialog.kindLabel')}
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
                !draft.baseUrl || draft.baseUrl === previous.baseUrl ? next.baseUrl : draft.baseUrl,
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
      <SettingsField
        settingKey="baseUrl"
        title={translate('settings.aiConnectionDialog.url')}
        hint={translate('settings.aiConnectionDialog.urlHint')}
      >
        <SettingsUrlInput
          aria-label={translate('settings.aiConnectionDialog.urlLabel')}
          confirmation={urlConfirmation}
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
            setUrlReady(!!e.currentTarget.value.trim());
          }}
          onChange={(e) => {
            const raw = e.target.value;
            const normalized = normalize(raw);
            if (normalized === undefined) setDraft((c) => ({ ...c, baseUrl: raw }));
            else if (normalized !== draft.baseUrl) invalidate();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setUrlReady(!!e.currentTarget.value.trim());
            enter(e, 'url');
          }}
        />
      </SettingsField>
      <SettingsField settingKey="name" title={translate('settings.aiConnectionDialog.name')}>
        <SettingsInput
          aria-label={translate('settings.aiConnectionDialog.nameLabel')}
          maxLength={160}
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
      </SettingsField>
      <SettingsField
        settingKey="authentication"
        title={translate('settings.aiConnectionDialog.auth')}
      >
        <select
          aria-label={translate('settings.aiConnectionDialog.authLabel')}
          value={draft.authentication}
          onChange={(e) => patch({ authentication: e.target.value as 'none' | 'bearer' })}
        >
          <option value="none">{translate('settings.aiConnectionDialog.noAuth')}</option>
          <option value="bearer">{translate('settings.aiConnectionDialog.bearer')}</option>
        </select>
        {draft.authentication === 'bearer' && (
          <>
            <SettingsInput
              aria-label={translate('settings.aiConnectionDialog.apiKey')}
              type="password"
              autoComplete="off"
              maxLength={8192}
              value={apiKey ?? ''}
              placeholder={
                savedKey
                  ? translate('settings.aiConnectionDialog.storedKey')
                  : translate('settings.aiConnectionDialog.enterKey')
              }
              onChange={(e) => {
                invalidate();
                setApiKey(e.target.value || undefined);
              }}
              onKeyDown={(e) => enter(e, 'key')}
            />
            <small className="muted">{translate('settings.aiConnectionDialog.keyHint')}</small>
          </>
        )}
      </SettingsField>
      <SettingsField
        settingKey="defaultModel"
        title={translate('settings.aiConnectionDialog.model')}
        hint={translate('settings.aiConnectionDialog.modelHint')}
      >
        <div className="ai-model-picker">
          <SettingsInput
            aria-label={translate('settings.aiConnectionDialog.modelLabel')}
            list={modelListId}
            maxLength={200}
            placeholder={translate('settings.aiConnectionDialog.modelPlaceholder')}
            value={draft.defaultModel ?? ''}
            onChange={(e) => setDraft({ ...draft, defaultModel: e.target.value })}
          />
          <SettingsButton
            pending={pending}
            icon
            className="ai-icon-button"
            aria-label={translate('settings.aiConnectionDialog.loadModels')}
            title={translate('settings.aiConnectionDialog.loadModels')}
            disabled={pending || !draft.baseUrl}
            onClick={() => void fetchModels()}
          >
            {'↻'}
          </SettingsButton>
        </div>
        <datalist id={modelListId}>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </datalist>
      </SettingsField>
      <SettingsField
        settingKey="defaultMaxOutputTokens"
        title={translate('settings.aiConnectionDialog.maxTokens')}
        hint={translate('settings.aiConnectionDialog.maxTokensHint')}
        description={translate('settings.aiConnectionDialog.maxTokensWarning')}
      >
        <SettingsInput
          type="number"
          aria-label={translate('settings.aiConnectionDialog.maxTokensLabel')}
          min={aiOutputTokenLimits.minimum}
          max={aiOutputTokenLimits.maximum}
          step={1}
          value={tokenLimit}
          onChange={(e) => setTokenLimit(e.target.value)}
        />
      </SettingsField>
      <SettingsField
        settingKey="defaultTimeoutSeconds"
        title={translate('settings.aiConnectionDialog.timeout')}
        hint={translate('settings.aiConnectionDialog.timeoutHint')}
      >
        <SettingsInput
          type="number"
          aria-label={translate('settings.aiConnectionDialog.timeoutLabel')}
          min={aiTimeoutLimits.minimumSeconds}
          max={aiTimeoutLimits.maximumSeconds}
          step={1}
          value={timeoutSeconds}
          onChange={(e) => setTimeoutSeconds(e.target.value)}
        />
      </SettingsField>
      <SettingsField
        settingKey="compatibility.tokenLimitField"
        title={translate('settings.aiConnectionDialog.tokenFormat')}
      >
        <select
          aria-label={translate('settings.aiConnectionDialog.tokenFormatLabel')}
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
          <option value="max_tokens">
            {translate('settings.aiConnectionDialog.localTokenFormat')}
          </option>
          <option value="max_completion_tokens">max_completion_tokens（OpenAI）</option>
        </select>
      </SettingsField>
      <SettingsField
        title="Temperature"
        settingKey="compatibility.temperature"
        hint={translate('settings.aiConnectionDialog.temperatureHint')}
      >
        <SettingsInput
          aria-label={translate('settings.aiConnectionDialog.temperatureLabel')}
          inputMode="decimal"
          value={temperature}
          onChange={(e) => setTemperature(e.target.value)}
        />
      </SettingsField>
      <SettingsField
        settingKey="compatibility.reasoningEffort"
        title={translate('settings.aiConnectionDialog.reasoning')}
        hint={translate('settings.aiConnectionDialog.reasoningHint')}
      >
        <SettingsInput
          aria-label={translate('settings.aiConnectionDialog.reasoningLabel')}
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
      <SettingsField
        settingKey="compatibility.store"
        title={translate('settings.aiConnectionDialog.store')}
      >
        <select
          aria-label={translate('settings.aiConnectionDialog.storeLabel')}
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
          <option value="omit">{translate('settings.aiConnectionDialog.unspecified')}</option>
          <option value="false">{translate('settings.aiConnectionDialog.noStore')}</option>
        </select>
      </SettingsField>
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
  const { t: translate } = useHostTranslation();
  return (
    <SettingsOrderDialog
      title={translate('settings.aiConnectionDialog.order')}
      listLabel={translate('settings.aiConnectionDialog.displayOrder')}
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

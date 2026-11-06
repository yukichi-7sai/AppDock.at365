import { GenerationAuthentication } from './GenerationAuthentication';
import { GenerationMcpPermission } from './GenerationMcpPermission';
import { GenerationServerId } from './GenerationServerId';
import { localizedMetadata } from '../../shared/translation-metadata';
import { hostText } from '../../shared/i18n';
import { useHostTranslation } from '../HostTranslation';
import { SettingsButton } from '../settings-ui/SettingsButton';
import { useEffect, useId, useRef, useState } from 'react';
import {
  aiBaseUrl,
  aiString,
  aiOutputTokenLimits,
  aiTimeoutLimits,
  newAiConnection,
  parseAiSettings,
  type AiConnectionSettings,
  type AiModel,
} from '../../shared/ai';
import { SettingsInput, SettingsTextarea, SettingsUrlInput } from '../settings-ui/SettingsInput';
import { SettingsCombobox } from '../settings-ui/SettingsCombobox';
import { SettingsOrderDialog } from '../settings-ui/SettingsOrderDialog';
import { SettingsDialog } from '../settings-ui/SettingsModal';
import {
  SettingsField,
  SettingsSection,
  SettingsInputActions,
} from '../settings-ui/SettingsSections';
import '../settings-ui/server-connection-editor.css';

const tabs = ['connection', 'prompt', 'details'] as const;
type EditorTab = (typeof tabs)[number];

export const aiPresetNames = localizedMetadata(() => ({
  ollama: 'Ollama',
  'lm-studio': 'LM Studio',
  'llama-cpp': 'llama.cpp',
  openai: 'OpenAI',
  custom: hostText('settings.aiConnectionDialog.otherServer'),
}));
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
  const id = useId();
  const [tab, setTab] = useState<EditorTab>('connection');
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
      className="ai-connection-dialog server-connection-dialog"
      onClose={onClose}
      valid={!pending && !!draft.name.trim() && urlReady}
      error={error}
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
        try {
          parseAiSettings({ connections: [next] });
        } catch (reason) {
          let invalidTab: EditorTab = 'details';
          try {
            aiBaseUrl(next.baseUrl);
          } catch {
            invalidTab = 'connection';
          }
          if (
            !aiString(next.defaultModel ?? '', 200) ||
            /[\r\n]/.test(next.defaultModel ?? '') ||
            !aiString(next.alwaysPrompt, 2048) ||
            !aiString(next.defaultPrompt, 2048)
          )
            invalidTab = 'prompt';
          setTab(invalidTab);
          throw reason;
        }
        if (next.authentication === 'bearer' && !savedKey && !apiKey) setTab('connection');
        await invoke('aiSaveConnection', [next, original, apiKey, status?.keyRevision]);
      }}
    >
      <div
        className="tabs server-editor-tabs"
        role="tablist"
        aria-label={translate('settings.aiConnectionDialog.tabs')}
      >
        {tabs.map((item, index) => (
          <button
            type="button"
            key={item}
            role="tab"
            id={`${id}-tab-${item}`}
            aria-controls={`${id}-panel-${item}`}
            aria-selected={tab === item}
            tabIndex={tab === item ? 0 : -1}
            className={tab === item ? 'selected' : ''}
            onClick={() => setTab(item)}
            onKeyDown={(event) => {
              const next =
                event.key === 'ArrowRight'
                  ? (index + 1) % tabs.length
                  : event.key === 'ArrowLeft'
                    ? (index + tabs.length - 1) % tabs.length
                    : event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? tabs.length - 1
                        : -1;
              if (next < 0) return;
              event.preventDefault();
              setTab(tabs[next]);
              document.getElementById(`${id}-tab-${tabs[next]}`)?.focus();
            }}
          >
            {translate(`settings.aiConnectionDialog.tab.${item}`)}
          </button>
        ))}
      </div>
      <SettingsSection
        className="server-editor-panel"
        variant="group"
        id={`${id}-panel-connection`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-connection`}
        hidden={tab !== 'connection'}
      >
        <div className="server-editor-grid">
          <SettingsField settingKey="name" title={translate('settings.aiConnectionDialog.name')}>
            <SettingsInput
              data-initial-focus
              aria-label={translate('settings.aiConnectionDialog.name')}
              maxLength={160}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </SettingsField>
          <GenerationServerId id={draft.id} invoke={invoke} />
          <SettingsField settingKey="preset" title={translate('settings.aiConnectionDialog.kind')}>
            <select
              aria-label={translate('settings.aiConnectionDialog.kind')}
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
          <SettingsField
            className="server-editor-full"
            settingKey="baseUrl"
            title={translate('settings.aiConnectionDialog.url')}
            hint={translate('settings.aiConnectionDialog.urlHint')}
          >
            <SettingsUrlInput
              aria-label={translate('settings.aiConnectionDialog.url')}
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
          <GenerationAuthentication
            authentication={draft.authentication}
            onAuthenticationChange={(authentication) => patch({ authentication })}
            apiKey={apiKey}
            savedKey={savedKey}
            onKeyChange={(value) => {
              invalidate();
              setApiKey(value);
            }}
            onKeyDown={(e) => enter(e, 'key')}
            hint={translate('settings.aiConnectionDialog.keyHint')}
          />
          <GenerationMcpPermission
            enabled={draft.mcpEnabled}
            onChange={(mcpEnabled) => patch({ mcpEnabled })}
          />
        </div>
      </SettingsSection>
      <SettingsSection
        className="server-editor-panel"
        variant="group"
        id={`${id}-panel-prompt`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-prompt`}
        hidden={tab !== 'prompt'}
      >
        <div className="server-editor-grid">
          <SettingsField
            className="server-editor-full"
            settingKey="defaultModel"
            title={translate('settings.aiConnectionDialog.model')}
            hint={translate('settings.aiConnectionDialog.modelHint')}
          >
            <SettingsInputActions wrap>
              <SettingsCombobox
                label={translate('settings.aiConnectionDialog.model')}
                options={models}
                value={draft.defaultModel ?? ''}
                onChange={(defaultModel) => setDraft({ ...draft, defaultModel })}
              />
              <SettingsButton
                pending={pending}
                aria-label={translate('settings.aiConnectionDialog.loadModels')}
                title={translate('settings.aiConnectionDialog.loadModels')}
                disabled={pending || !draft.baseUrl}
                onClick={() => void fetchModels()}
              >
                {translate('settings.aiConnectionDialog.fetchOptions')}
              </SettingsButton>
            </SettingsInputActions>
          </SettingsField>
          <SettingsField
            className="server-editor-full"
            settingKey="alwaysPrompt"
            title={translate('settings.aiConnectionDialog.alwaysPrompt')}
            description={translate('settings.aiConnectionDialog.alwaysPromptHint')}
          >
            <SettingsTextarea
              aria-label={translate('settings.aiConnectionDialog.alwaysPrompt')}
              rows={3}
              value={draft.alwaysPrompt}
              onChange={(e) => setDraft({ ...draft, alwaysPrompt: e.target.value })}
            />
          </SettingsField>
          <SettingsField
            className="server-editor-full"
            settingKey="defaultPrompt"
            title={translate('settings.aiConnectionDialog.defaultPrompt')}
            description={translate('settings.aiConnectionDialog.defaultPromptHint')}
          >
            <SettingsTextarea
              aria-label={translate('settings.aiConnectionDialog.defaultPrompt')}
              rows={3}
              value={draft.defaultPrompt}
              onChange={(e) => setDraft({ ...draft, defaultPrompt: e.target.value })}
            />
          </SettingsField>
        </div>
      </SettingsSection>
      <SettingsSection
        className="server-editor-panel"
        variant="group"
        id={`${id}-panel-details`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-details`}
        hidden={tab !== 'details'}
      >
        <div className="server-editor-grid">
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
        </div>
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

import { GenerationMcpPermission } from './GenerationMcpPermission';
import { useId, useState } from 'react';
import { useHostTranslation } from '../HostTranslation';
import { SettingsDialog } from '../settings-ui/SettingsModal';
import { SettingsOrderDialog } from '../settings-ui/SettingsOrderDialog';
import { SettingsInput, SettingsTextarea, SettingsUrlInput } from '../settings-ui/SettingsInput';
import { SettingsField, SettingsSection } from '../settings-ui/SettingsSections';
import {
  newImageAiConnection,
  imageAiUrl,
  parseImageAiSettings,
  type ImageAiConnection,
  type ImageGenerationOptions,
} from '../../shared/image-ai';
import type { AiInvoke } from './AiConnectionDialog';
import '../settings-ui/server-connection-editor.css';

export function ImageAiConnectionDialog({
  original,
  status,
  invoke,
  onClose,
}: {
  original: ImageAiConnection | null;
  status?: { apiKeyConfigured: boolean; keyRevision: string };
  invoke: AiInvoke;
  onClose(): void;
}) {
  const { t } = useHostTranslation();
  const id = useId();
  const [draft, setDraft] = useState(() =>
    structuredClone(original ?? newImageAiConnection(crypto.randomUUID())),
  );
  const [tab, setTab] = useState(0),
    [key, setKey] = useState<string | undefined>();
  const [count, setCount] = useState(String(draft.defaults.count)),
    [timeout, setTimeoutValue] = useState(String(draft.timeoutSeconds));
  const [compression, setCompression] = useState(
    String(draft.defaults.providerOptions.compression ?? ''),
  );
  const titles = [
    t('settings.aiConnectionDialog.tab.connection'),
    t('imageAi.generationTab'),
    t('imageAi.promptTab'),
  ];
  const patch = (value: Partial<ImageAiConnection>) => setDraft((v) => ({ ...v, ...value }));
  const options = (value: Partial<ImageGenerationOptions>) =>
    setDraft((v) => ({ ...v, defaults: { ...v.defaults, ...value } }));
  const provider = (value: Partial<ImageGenerationOptions['providerOptions']>) =>
    options({ providerOptions: { ...draft.defaults.providerOptions, ...value } });
  return (
    <SettingsDialog
      className="server-connection-dialog"
      title={
        original ? t('settings.aiConnectionDialog.edit') : t('settings.aiConnectionDialog.add')
      }
      onClose={onClose}
      valid={!!draft.name.trim() && !!draft.baseUrl.trim()}
      onApply={async () => {
        const next = {
          ...draft,
          baseUrl: imageAiUrl(draft.baseUrl),
          timeoutSeconds: Number(timeout),
          defaults: {
            ...draft.defaults,
            count: Number(count),
            providerOptions: {
              ...draft.defaults.providerOptions,
              compression: compression.trim() ? Number(compression) : undefined,
            },
          },
        };
        parseImageAiSettings({ connections: [next] });
        await invoke('imageAiSaveConnection', [next, original, key, status?.keyRevision]);
      }}
    >
      <div
        className="tabs server-editor-tabs"
        role="tablist"
        aria-label={t('settings.aiConnectionDialog.tabs')}
      >
        {titles.map((title, i) => (
          <button
            type="button"
            key={i}
            id={`${id}-tab-${i}`}
            role="tab"
            aria-controls={`${id}-panel-${i}`}
            aria-selected={tab === i}
            tabIndex={tab === i ? 0 : -1}
            className={tab === i ? 'selected' : ''}
            onClick={() => setTab(i)}
            onKeyDown={(e) => {
              const next =
                e.key === 'ArrowRight'
                  ? (i + 1) % 3
                  : e.key === 'ArrowLeft'
                    ? (i + 2) % 3
                    : e.key === 'Home'
                      ? 0
                      : e.key === 'End'
                        ? 2
                        : -1;
              if (next >= 0) {
                e.preventDefault();
                setTab(next);
                document.getElementById(`${id}-tab-${next}`)?.focus();
              }
            }}
          >
            {title}
          </button>
        ))}
      </div>
      <SettingsSection
        variant="group"
        className="server-editor-panel"
        role="tabpanel"
        id={`${id}-panel-0`}
        aria-labelledby={`${id}-tab-0`}
        hidden={tab !== 0}
      >
        <div className="server-editor-grid">
          <GenerationMcpPermission
            enabled={draft.mcpEnabled}
            onChange={(mcpEnabled) => patch({ mcpEnabled })}
            future
          />
          <SettingsField settingKey="name" title={t('settings.aiConnectionDialog.name')}>
            <SettingsInput
              aria-label={t('settings.aiConnectionDialog.name')}
              value={draft.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </SettingsField>
          <SettingsField settingKey="protocol" title={t('settings.aiConnectionDialog.kind')}>
            <select
              aria-label={t('settings.aiConnectionDialog.kind')}
              value={draft.protocol}
              onChange={() => {}}
            >
              <option value="openai-images">OpenAI Images API</option>
            </select>
          </SettingsField>
          <SettingsField settingKey="id" title={t('imageAi.id')}>
            <SettingsInput aria-label={t('imageAi.id')} value={draft.id} readOnly />
          </SettingsField>
          <SettingsField settingKey="baseUrl" title={t('settings.aiConnectionDialog.url')}>
            <SettingsUrlInput
              aria-label={t('settings.aiConnectionDialog.url')}
              value={draft.baseUrl}
              onChange={(e) => patch({ baseUrl: e.target.value })}
            />
          </SettingsField>
          <SettingsField settingKey="authentication" title={t('settings.aiConnectionDialog.auth')}>
            <select
              aria-label={t('settings.aiConnectionDialog.auth')}
              value={draft.authentication}
              onChange={(e) => patch({ authentication: e.target.value as 'none' | 'bearer' })}
            >
              <option value="bearer">{t('settings.aiConnectionDialog.bearer')}</option>
              <option value="none">{t('settings.aiConnectionDialog.noAuth')}</option>
            </select>
          </SettingsField>
          <SettingsField
            title={t('settings.aiConnectionDialog.apiKey')}
            description={t('imageAi.keyHint')}
          >
            <SettingsInput
              type="password"
              autoComplete="new-password"
              aria-label={t('settings.aiConnectionDialog.apiKey')}
              value={key ?? ''}
              disabled={draft.authentication === 'none'}
              placeholder={
                status?.apiKeyConfigured && original?.baseUrl === draft.baseUrl
                  ? t('settings.aiConnectionDialog.storedKey')
                  : ''
              }
              onChange={(e) => setKey(e.target.value)}
            />
          </SettingsField>
        </div>
      </SettingsSection>
      <SettingsSection
        variant="group"
        className="server-editor-panel"
        role="tabpanel"
        id={`${id}-panel-1`}
        aria-labelledby={`${id}-tab-1`}
        hidden={tab !== 1}
      >
        <div className="server-editor-grid">
          <SettingsField
            settingKey="defaultModel"
            title={t('settings.aiConnectionDialog.model')}
            description={t('imageAi.modelHint')}
          >
            <SettingsInput
              aria-label={t('settings.aiConnectionDialog.model')}
              value={draft.defaultModel}
              onChange={(e) => patch({ defaultModel: e.target.value })}
            />
          </SettingsField>
          <SettingsField settingKey="defaults.size" title={t('imageAi.size')}>
            <SettingsInput
              aria-label={t('imageAi.size')}
              value={draft.defaults.size}
              placeholder="auto / 1024x1024"
              onChange={(e) => options({ size: e.target.value })}
            />
          </SettingsField>
          <SettingsField settingKey="defaults.count" title={t('imageAi.count')}>
            <SettingsInput
              type="number"
              min={1}
              max={10}
              aria-label={t('imageAi.count')}
              value={count}
              onChange={(e) => setCount(e.target.value)}
            />
          </SettingsField>
          <SettingsField settingKey="defaults.format" title={t('imageAi.format')}>
            <select
              aria-label={t('imageAi.format')}
              value={draft.defaults.format}
              onChange={(e) =>
                options({ format: e.target.value as ImageGenerationOptions['format'] })
              }
            >
              {['png', 'jpeg', 'webp'].map((v) => (
                <option key={v} value={v}>
                  {v.toUpperCase()}
                </option>
              ))}
            </select>
          </SettingsField>
          <SettingsField settingKey="defaults.providerOptions.quality" title={t('imageAi.quality')}>
            <select
              aria-label={t('imageAi.quality')}
              value={draft.defaults.providerOptions.quality}
              onChange={(e) => provider({ quality: e.target.value })}
            >
              {['auto', 'low', 'medium', 'high', 'xhigh', 'max'].map((v) => (
                <option key={v} value={v}>
                  {v === 'auto' ? t('imageAi.auto') : v}
                </option>
              ))}
            </select>
          </SettingsField>
          <SettingsField
            settingKey="defaults.providerOptions.background"
            title={t('imageAi.background')}
          >
            <select
              aria-label={t('imageAi.background')}
              value={draft.defaults.providerOptions.background}
              onChange={(e) =>
                provider({ background: e.target.value as 'auto' | 'opaque' | 'transparent' })
              }
            >
              {(['auto', 'opaque', 'transparent'] as const).map((v) => (
                <option key={v} value={v}>
                  {t(`imageAi.${v}`)}
                </option>
              ))}
            </select>
          </SettingsField>
          <SettingsField
            settingKey="defaults.providerOptions.compression"
            title={t('imageAi.compression')}
            description={t('imageAi.optionsHint')}
          >
            <SettingsInput
              type="number"
              min={0}
              max={100}
              aria-label={t('imageAi.compression')}
              value={compression}
              onChange={(e) => setCompression(e.target.value)}
            />
          </SettingsField>
          <SettingsField
            settingKey="timeoutSeconds"
            title={t('settings.aiConnectionDialog.timeout')}
          >
            <SettingsInput
              type="number"
              min={1}
              aria-label={t('settings.aiConnectionDialog.timeout')}
              value={timeout}
              onChange={(e) => setTimeoutValue(e.target.value)}
            />
          </SettingsField>
        </div>
      </SettingsSection>
      <SettingsSection
        variant="group"
        className="server-editor-panel"
        role="tabpanel"
        id={`${id}-panel-2`}
        aria-labelledby={`${id}-tab-2`}
        hidden={tab !== 2}
      >
        <SettingsField
          settingKey="alwaysPrompt"
          title={t('settings.aiConnectionDialog.alwaysPrompt')}
        >
          <SettingsTextarea
            aria-label={t('settings.aiConnectionDialog.alwaysPrompt')}
            value={draft.alwaysPrompt}
            onChange={(e) => patch({ alwaysPrompt: e.target.value })}
          />
        </SettingsField>
        <SettingsField
          settingKey="defaultPrompt"
          title={t('settings.aiConnectionDialog.defaultPrompt')}
        >
          <SettingsTextarea
            aria-label={t('settings.aiConnectionDialog.defaultPrompt')}
            value={draft.defaultPrompt}
            onChange={(e) => patch({ defaultPrompt: e.target.value })}
          />
        </SettingsField>
      </SettingsSection>
    </SettingsDialog>
  );
}
export function ImageAiConnectionOrderDialog({
  connections,
  invoke,
  onClose,
}: {
  connections: ImageAiConnection[];
  invoke: AiInvoke;
  onClose(): void;
}) {
  const { t } = useHostTranslation();
  return (
    <SettingsOrderDialog
      title={t('settings.aiConnectionDialog.order')}
      listLabel={t('settings.aiConnectionDialog.displayOrder')}
      items={connections.map((c) => ({ id: c.id, title: c.name, description: c.baseUrl }))}
      onClose={onClose}
      onApply={(ordered, original) => invoke('imageAiOrderConnections', [original, ordered])}
    />
  );
}

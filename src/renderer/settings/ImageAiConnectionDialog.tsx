import { GenerationAuthentication } from './GenerationAuthentication';
import { GenerationMcpPermission } from './GenerationMcpPermission';
import { GenerationServerId } from './GenerationServerId';
import { useId, useState } from 'react';
import { useHostTranslation } from '../HostTranslation';
import { SettingsDialog } from '../settings-ui/SettingsModal';
import { SettingsOrderDialog } from '../settings-ui/SettingsOrderDialog';
import { SettingsInput, SettingsUrlInput } from '../settings-ui/SettingsInput';
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
  const titles = [t('settings.aiConnectionDialog.tab.connection'), t('imageAi.generationTab')];
  const patch = (value: Partial<ImageAiConnection>) => setDraft((v) => ({ ...v, ...value }));
  const options = (value: Partial<ImageGenerationOptions>) =>
    setDraft((v) => ({ ...v, defaults: { ...v.defaults, ...value } }));
  const provider = (value: Partial<ImageGenerationOptions['providerOptions']>) =>
    options({ providerOptions: { ...draft.defaults.providerOptions, ...value } });
  return (
    <SettingsDialog
      className="server-connection-dialog"
      title={t(original ? 'imageAi.edit' : 'imageAi.add')}
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
                  ? (i + 1) % titles.length
                  : e.key === 'ArrowLeft'
                    ? (i + titles.length - 1) % titles.length
                    : e.key === 'Home'
                      ? 0
                      : e.key === 'End'
                        ? titles.length - 1
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
          <SettingsField settingKey="name" title={t('settings.aiConnectionDialog.name')}>
            <SettingsInput
              aria-label={t('settings.aiConnectionDialog.name')}
              value={draft.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </SettingsField>
          <GenerationServerId id={draft.id} invoke={invoke} />
          <SettingsField settingKey="protocol" title={t('settings.aiConnectionDialog.kind')}>
            <select
              aria-label={t('settings.aiConnectionDialog.kind')}
              value={draft.protocol}
              onChange={() => {}}
            >
              <option value="openai-images">OpenAI Images API</option>
            </select>
          </SettingsField>
          <SettingsField
            className="server-editor-full"
            settingKey="baseUrl"
            title={t('settings.aiConnectionDialog.url')}
          >
            <SettingsUrlInput
              aria-label={t('settings.aiConnectionDialog.url')}
              value={draft.baseUrl}
              onChange={(e) => patch({ baseUrl: e.target.value })}
            />
          </SettingsField>
          <GenerationAuthentication
            authentication={draft.authentication}
            onAuthenticationChange={(authentication) => patch({ authentication })}
            apiKey={key}
            savedKey={status?.apiKeyConfigured && original?.baseUrl === draft.baseUrl}
            onKeyChange={setKey}
          />
          <GenerationMcpPermission
            enabled={draft.mcpEnabled}
            onChange={(mcpEnabled) => patch({ mcpEnabled })}
            description={t('settings.generation.mcpImageAccess')}
          />
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
            hint={t('settings.aiConnectionDialog.modelHint')}
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

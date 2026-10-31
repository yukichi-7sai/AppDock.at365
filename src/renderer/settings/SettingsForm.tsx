import { useHostTranslation } from '../HostTranslation';
import { hostLanguages } from '../../shared/host-language';
import { McpClientSettingsForm } from './McpClientSettings';
import { displayZoomChoices, displayZoomLabel } from '../../shared/display-zoom';
import { AccentColorPicker } from './AccentColorPicker';
import { hostSettingItem } from '../../shared/settings-catalog';
import { settingAnchor } from '../settings-ui/setting-anchor';
import React from 'react';
import type { Settings } from '../../shared/contracts';
import type { SettingsPageModel } from '../../shared/settings-page';
import { defaultShellId, shellRegions, shellProviderCandidates } from '../../shared/shell';
import { useSettingsControls } from '../settings-ui/api';
import { Toggle } from '../settings-ui/Toggle';
import { SettingsInput, numberInput } from '../settings-ui/SettingsInput';
import { AboutSettings } from './AboutSettings';
import { AppletManagementSettings } from './AppletManagementSettings';
import { AppletUpdateSource } from './UpdateSettings';

import { ShortcutsEditor } from './ShortcutsEditor';
import {
  CommandTriggersEditor,
  type TriggerTab,
  type TriggerScrollPositions,
} from './CommandTriggersEditor';
import { GesturesEditor } from './GesturesEditor';
import { RibbonSettings } from './RibbonSettings';
import { TraySettings } from './TraySettings';
import { TtsSettingsForm } from './TtsSettings';
import { AiSettingsForm } from './AiSettings';
import { CustomCommandsSettings } from './CustomCommandsSettings';
import { TriggerStackSettings } from './TriggerStackSettings';
import { WebAccountSettings } from './WebAccountSettings';
import { ApiPermissionsSettings } from './ApiPermissionsSettings';
import { CodexSettings } from './CodexSettings';
import { NotificationSettings } from './NotificationSettings';
import { AppletSettingsForm } from '../settings-ui/AppletSettingsForm';
import { SettingsSection, SettingsField, SettingsActions } from '../settings-ui/SettingsSections';
import { SettingsMcpScope } from '../settings-ui/SettingsMcpAccess';
import { settingsItemId } from '../../shared/settings-catalog';
export interface FormEditor {
  value: Settings;
  edit(value: Settings): void;
}
export function SettingsForm({
  model,
  editor,
  select,
  invoke,
  onOpenNotificationCenter,
  triggerTab,
  gestureView,
  onTriggerTab,
  triggerScrollPositions,
}: {
  model: SettingsPageModel;
  editor: FormEditor;
  select(id: string): void;
  invoke(name: string, args?: unknown[]): Promise<any>;
  onOpenNotificationCenter(): Promise<unknown>;
  triggerTab: TriggerTab;
  gestureView: 'form' | 'triggers';
  onTriggerTab(tab: TriggerTab): void;
  triggerScrollPositions: TriggerScrollPositions;
}) {
  const { t, language } = useHostTranslation();
  const settingsControls = useSettingsControls();
  const { page, auxiliary: aux, editing } = model.content;
  const category = page.id,
    settings = editor.value,
    edit = editor.edit,
    busy = editing.pending;
  const extensions = aux.applets ?? [],
    commands = aux.commands ?? [],
    globalHotKeys = aux.statuses ?? [];
  const launch = aux.launch!;
  const run = async (work: () => Promise<unknown>) => {
    try {
      await work();
    } catch {
      /* The page controller publishes the operation error. */
    }
  };
  if (page.kind === 'applet')
    return (
      <>
        <AppletSettingsForm
          applet={extensions.find((a) => a.id === page.owner)!}
          settings={settings}
          onChange={edit}
          accounts={aux.accounts}
          commonFields={
            !page.collection && (
              <AppletUpdateSource
                extension={extensions.find((a) => a.id === page.owner)!}
                settings={settings}
                edit={edit}
              />
            )
          }
          onListCommit={(key, value, before) => invoke('replaceAppletList', [key, value, before])}
          onListOpen={(key, id) => invoke('openAppletListItem', [key, id])}
          onListDraftAction={(key, input) =>
            invoke('appletListDraftAction', [key, { kind: 'fetch', input }])
          }
          onListDraftImage={(key, base64) =>
            invoke('appletListDraftAction', [key, { kind: 'image', base64 }])
          }
        />
      </>
    );
  if (category === 'applets')
    return (
      <AppletManagementSettings
        applets={extensions}
        management={aux.appletManagement}
        updates={aux.updates}
        invoke={invoke}
      />
    );
  if (category === 'about')
    return <AboutSettings settings={settings} edit={edit} startupTiming={aux.hostStartupTiming} />;
  if (category === 'tray')
    return (
      <SettingsMcpScope itemId={settingsItemId('tray', 'trayMenu')}>
        <TraySettings
          settings={settings}
          extensions={extensions}
          commands={commands}
          onChange={edit}
        />
      </SettingsMcpScope>
    );
  if (category === 'tts')
    return <TtsSettingsForm editor={editor} auxiliary={aux.tts} invoke={invoke} busy={busy} />;
  if (category === 'ai')
    return <AiSettingsForm editor={editor} auxiliary={aux.ai} invoke={invoke} busy={busy} />;
  if (category === 'mcp-client')
    return (
      <McpClientSettingsForm
        settings={editor.value}
        auxiliary={aux.mcpClient}
        invoke={invoke}
        busy={busy}
      />
    );
  if (category === 'custom-commands')
    return (
      <SettingsMcpScope itemId={settingsItemId('custom-commands', 'definitions')}>
        <CustomCommandsSettings
          commands={commands}
          settings={settings}
          auxiliary={aux.customCommands}
          applets={extensions}
          invoke={invoke}
          busy={busy}
        />
      </SettingsMcpScope>
    );
  if (category === 'ribbon')
    return (
      <SettingsMcpScope itemId={settingsItemId('ribbon', 'ribbon')}>
        <RibbonSettings
          settings={settings}
          extensions={extensions}
          commands={commands}
          onEdit={(operation, before) => invoke('editRibbon', [operation, before])}
        />
      </SettingsMcpScope>
    );
  if (category === 'notifications')
    return (
      <NotificationSettings
        editor={editor}
        types={aux.notificationTypes ?? []}
        auxiliary={aux.notificationSpeech}
        invoke={invoke}
        busy={busy}
        select={select}
        onOpenCenter={onOpenNotificationCenter}
      />
    );
  if (category === 'codex')
    return <CodexSettings onOpenPermissions={() => select('permissions')} />;
  if (category === 'permissions')
    return (
      <ApiPermissionsSettings
        grants={aux.permissions?.permissions ?? {}}
        error={aux.permissions?.error}
        busy={busy}
      />
    );
  if (category === 'web-accounts')
    return (
      <WebAccountSettings
        accounts={aux.accounts ?? []}
        savedItems={aux.accountReferences?.saved ?? []}
      />
    );
  return (
    <div className="settings-layout">
      <div
        className={`settings-form${['general', 'appearance', 'statusbar', 'shortcuts', 'gestures', 'touchpad-gestures', 'command-triggers'].includes(category) ? ' settings-sections' : ''}`}
      >
        {category === 'statusbar' && (
          <SettingsSection>
            <SettingRow pageId={category} itemKey="showStatusBar">
              <Toggle
                label={t('statusbar.visible.label')}
                checked={settings.host.showStatusBar}
                disabled={busy}
                onChange={(showStatusBar) =>
                  edit({ ...settings, host: { ...settings.host, showStatusBar } })
                }
              />
            </SettingRow>
          </SettingsSection>
        )}
        {category === 'command-triggers' && (
          <CommandTriggersEditor
            tab={triggerTab}
            onTabChange={onTriggerTab}
            scrollPositions={triggerScrollPositions}
            busy={busy}
            inheritedModes={aux.triggerExecutionModes}
            triggerEnablement={aux.triggerEnablement}
            provider={aux.provider}
            clearProvider={() => void invoke('clearProvider')}
            settings={settings}
            onChange={edit}
            commands={commands}
            applets={extensions}
            statuses={globalHotKeys}
          />
        )}
        {gestureView === 'form' &&
          (category === 'gestures' || category === 'touchpad-gestures') && (
            <GesturesEditor
              key={`gesture-options:${category}`}
              touchpad={
                category === 'touchpad-gestures' ? { snapshot: aux.touchpad, invoke } : undefined
              }
              settings={settings}
              onChange={edit}
            />
          )}
        {gestureView === 'form' && category === 'shortcuts' && (
          <ShortcutsEditor key="shortcut-options" settings={settings} onChange={edit} />
        )}
        {gestureView === 'triggers' &&
          (category === 'shortcuts' ||
            category === 'gestures' ||
            category === 'touchpad-gestures') && (
            <TriggerStackSettings
              key={`trigger-stacks:${category}`}
              kind={category}
              settings={settings}
              commands={commands}
              applets={extensions}
              onChange={edit}
              busy={busy}
            />
          )}
        {category === 'appearance' && (
          <>
            <SettingsSection data-testid="appearance-common-settings">
              <SettingRow pageId={category} itemKey="language">
                <select
                  data-testid="host-language"
                  aria-label={t('language.label')}
                  value={settings.host.language}
                  onChange={(e) =>
                    edit({
                      ...settings,
                      host: {
                        ...settings.host,
                        language: e.target.value as Settings['host']['language'],
                      },
                    })
                  }
                >
                  {hostLanguages.map((value) => (
                    <option key={value} value={value}>
                      {t(`language.${value}`)}
                    </option>
                  ))}
                </select>
              </SettingRow>
              <SettingRow pageId={category} itemKey="theme">
                <select
                  aria-label={t('appearance.theme.label')}
                  value={settings.host.theme}
                  onChange={(e) =>
                    edit({
                      ...settings,
                      host: {
                        ...settings.host,
                        theme: e.target.value as Settings['host']['theme'],
                      },
                    })
                  }
                >
                  <option value="dark">{t('appearance.theme.dark')}</option>
                  <option value="light">{t('appearance.theme.light')}</option>
                  <option value="system">{t('appearance.theme.system')}</option>
                </select>
              </SettingRow>
              <SettingRow pageId={category} itemKey="zoomFactor">
                <select
                  aria-label={t('appearance.zoom.label')}
                  value={settings.host.zoomFactor}
                  onChange={(e) =>
                    edit({
                      ...settings,
                      host: { ...settings.host, zoomFactor: Number(e.target.value) },
                    })
                  }
                >
                  {!displayZoomChoices.includes(settings.host.zoomFactor) && (
                    <option value={settings.host.zoomFactor}>
                      {displayZoomLabel(settings.host.zoomFactor)}
                    </option>
                  )}
                  {displayZoomChoices.map((factor) => (
                    <option key={factor} value={factor}>
                      {displayZoomLabel(factor)}
                    </option>
                  ))}
                </select>
              </SettingRow>
              <SettingRow pageId={category} itemKey="accentColor">
                <AccentColorPicker
                  value={settings.host.accentColor}
                  custom={{
                    dark: settings.host.customAccentDark,
                    light: settings.host.customAccentLight,
                  }}
                  onChange={(accentColor) =>
                    edit({ ...settings, host: { ...settings.host, accentColor } })
                  }
                  onCustomChange={(tone, color) =>
                    edit({
                      ...settings,
                      host: {
                        ...settings.host,
                        [tone === 'dark' ? 'customAccentDark' : 'customAccentLight']: color,
                      },
                    })
                  }
                />
              </SettingRow>
              <SettingRow pageId={category} itemKey="showHints">
                <Toggle
                  label={t('appearance.hints.label')}
                  checked={settings.host.showHints}
                  onChange={(showHints) =>
                    edit({ ...settings, host: { ...settings.host, showHints } })
                  }
                />
              </SettingRow>
              <SettingRow pageId={category} itemKey="overlayBackground">
                <select
                  aria-label={t('appearance.overlayBackground.label')}
                  value={settings.host.overlayBackground}
                  onChange={(event) =>
                    edit({
                      ...settings,
                      host: {
                        ...settings.host,
                        overlayBackground: event.target.value as 'blur' | 'transparent',
                      },
                    })
                  }
                >
                  <option value="transparent">
                    {t('appearance.overlayBackground.transparent')}
                  </option>
                  <option value="blur">{t('appearance.overlayBackground.blur')}</option>
                </select>
              </SettingRow>
              <SettingRow pageId={category} itemKey="overlayShadow">
                <Toggle
                  label={t('appearance.overlayShadow.label')}
                  checked={settings.host.overlayShadow}
                  onChange={(overlayShadow) =>
                    edit({ ...settings, host: { ...settings.host, overlayShadow } })
                  }
                />
              </SettingRow>
            </SettingsSection>
            <SettingsSection title={t('appearance.shell.section')}>
              {shellRegions.map(({ id }) => {
                const title = t(`appearance.shell.region.${id}`);
                const configured = settings.host.shellProviders?.[id] ?? defaultShellId;
                const candidates = shellProviderCandidates(extensions, id);
                const state = aux.shellRegions?.regions.find((r) => r.region === id);
                const name = (provider: string | null | undefined) =>
                  provider === defaultShellId
                    ? t('appearance.shell.default')
                    : (extensions.find((e) => e.id === provider)?.displayName ??
                      provider ??
                      t('appearance.shell.notCreated'));
                return (
                  <SettingRow
                    key={id}
                    pageId={category}
                    itemKey={'shellProviders.' + id}
                    description={[
                      t('appearance.shell.active', {
                        name: name(state?.boundProvider ?? state?.resolvedProvider),
                      }),
                      state?.pendingProvider
                        ? t('appearance.shell.pending', { name: name(state.pendingProvider) })
                        : '',
                      state?.reason ? t('appearance.shell.reason', { reason: state.reason }) : '',
                    ].join('')}
                  >
                    <div className="shell-region-controls">
                      <select
                        data-testid={'shell-provider-' + id}
                        aria-label={t('appearance.shell.label', { region: title })}
                        value={configured}
                        disabled={busy}
                        onChange={(e) => {
                          const shellProviders = { ...settings.host.shellProviders };
                          if (e.target.value) shellProviders[id] = e.target.value;
                          else delete shellProviders[id];
                          edit({
                            ...settings,
                            host: {
                              ...settings.host,
                              shellProviders,
                            },
                          });
                        }}
                      >
                        <option value={defaultShellId}>
                          {t('appearance.shell.defaultOption')}
                        </option>
                        {configured &&
                          configured !== defaultShellId &&
                          !candidates.some((e) => e.id === configured) && (
                            <option value={configured}>
                              {t('appearance.shell.unavailable', { name: configured })}
                            </option>
                          )}
                        {candidates.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.displayName}
                            {!e.enabled ? t('appearance.shell.disabledSuffix') : ''}
                          </option>
                        ))}
                      </select>
                      {state?.reason && (
                        <>
                          <button
                            disabled={busy}
                            onClick={() => void invoke('retryShellRegion', [id])}
                          >
                            {t('appearance.shell.retry')}
                          </button>
                        </>
                      )}
                    </div>
                  </SettingRow>
                );
              })}
            </SettingsSection>
          </>
        )}

        {category === 'general' && (
          <>
            <SettingsSection>
              <SettingRow pageId={category} itemKey="soundEnabled">
                <Toggle
                  label={t('general.sound.label')}
                  checked={settings.host.soundEnabled}
                  onChange={(v) =>
                    edit({ ...settings, host: { ...settings.host, soundEnabled: v } })
                  }
                />
              </SettingRow>
            </SettingsSection>
            <SettingsSection title={t('general.window.section')}>
              <SettingRow
                pageId={category}
                itemKey="startPage"
                description={
                  aux.startPages?.some((option) => option.value === settings.host.startPage)
                    ? undefined
                    : t('general.startPage.unavailableDescription')
                }
              >
                <select
                  aria-label={t('general.startPage.label')}
                  value={settings.host.startPage}
                  disabled={busy}
                  onChange={(event) =>
                    edit({
                      ...settings,
                      host: {
                        ...settings.host,
                        startPage: event.target.value as Settings['host']['startPage'],
                      },
                    })
                  }
                >
                  {!aux.startPages?.some((option) => option.value === settings.host.startPage) && (
                    <option value={settings.host.startPage} disabled>
                      {t('general.startPage.unavailable', { page: settings.host.startPage })}
                    </option>
                  )}
                  {(aux.startPages ?? []).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </SettingRow>
              {(['closeToTray', 'startMinimized'] as const).map((key) => (
                <SettingRow key={key} pageId={category} itemKey={key}>
                  <Toggle
                    label={hostSettingItem(category, key, language).title}
                    checked={settings.host[key]}
                    onChange={(v) => edit({ ...settings, host: { ...settings.host, [key]: v } })}
                  />
                </SettingRow>
              ))}
            </SettingsSection>
            <SettingsSection
              title={t('general.startup.section')}
              data-testid="general-startup-settings"
              description={t('settings.storage.deviceOnly')}
              hint={t('general.startup.hint')}
            >
              <SettingRow pageId={category} itemKey="startAtLogon">
                <Toggle
                  label={t('general.startAtLogon.label')}
                  checked={settings.host.startAtLogon}
                  disabled={!launch.supported}
                  onChange={(v) =>
                    edit({ ...settings, host: { ...settings.host, startAtLogon: v } })
                  }
                />
              </SettingRow>
              <SettingRow pageId={category} itemKey="runAsAdministrator">
                <Toggle
                  label={t('general.runAsAdministrator.label')}
                  checked={settings.host.runAsAdministrator}
                  disabled={!launch.supported}
                  onChange={(v) =>
                    edit({ ...settings, host: { ...settings.host, runAsAdministrator: v } })
                  }
                />
              </SettingRow>
              <SettingRow pageId={category} itemKey="hardwareAcceleration">
                <Toggle
                  label={hostSettingItem(category, 'hardwareAcceleration', language).title}
                  checked={settings.host.hardwareAcceleration}
                  onChange={(hardwareAcceleration) =>
                    edit({ ...settings, host: { ...settings.host, hardwareAcceleration } })
                  }
                />
              </SettingRow>
              <SettingRow
                pageId={category}
                itemKey="launch"
                error={launch.error}
                description={
                  launch.supported
                    ? t('general.launch.status', {
                        privilege: launch.elevated
                          ? t('general.launch.elevated')
                          : t('general.launch.normal'),
                        registration: launch.registered
                          ? launch.taskElevated
                            ? t('general.launch.registeredElevated')
                            : t('general.launch.registeredNormal')
                          : t('general.launch.notRegistered'),
                      })
                    : t('general.launch.unsupported')
                }
              >
                <SettingsActions>
                  <button
                    disabled={!launch.supported || busy}
                    onClick={() => void run(() => invoke('refreshLaunchState'))}
                  >
                    {t('general.launch.refresh')}
                  </button>
                  <button
                    disabled={!launch.supported || launch.elevated || busy}
                    onClick={() => void run(() => invoke('restartAsAdministrator'))}
                  >
                    {t('general.launch.restartElevated')}
                  </button>
                </SettingsActions>
              </SettingRow>
            </SettingsSection>
            <SettingsSection
              title={t('general.fileWatch.section')}
              data-testid="file-watch-settings"
            >
              <SettingRow pageId={category} itemKey="fileWatchAssistanceEnabled">
                <Toggle
                  label={t('general.fileWatch.enabled')}
                  checked={settings.host.fileWatchAssistanceEnabled}
                  onChange={(checked) =>
                    edit({
                      ...settings,
                      host: { ...settings.host, fileWatchAssistanceEnabled: checked },
                    })
                  }
                />
              </SettingRow>
              <SettingRow pageId={category} itemKey="fileWatchAssistanceIntervalSeconds">
                <SettingsInput
                  aria-label={t('general.fileWatch.interval')}
                  type="number"
                  min={2}
                  step="any"
                  disabled={busy || !settings.host.fileWatchAssistanceEnabled}
                  value={settings.host.fileWatchAssistanceIntervalSeconds}
                  onChange={(event) =>
                    edit({
                      ...settings,
                      host: {
                        ...settings.host,
                        fileWatchAssistanceIntervalSeconds: numberInput(event.target.value),
                      },
                    })
                  }
                />
              </SettingRow>
            </SettingsSection>
            <SettingsSection
              title={t('general.files.title')}
              {...settingAnchor(category, 'settingsFile')}
              hint={t('general.files.hint')}
              error={[...new Set(aux.settingsHealth?.errors)].join('\n')}
              description={[
                !aux.settingsHealth?.errors.length && !aux.settingsHealth?.restartRequired
                  ? t('general.files.healthy')
                  : '',
                aux.settingsHealth?.recovered ? t('general.files.recovered') : '',
                ...(aux.settingsHealth?.reasons ?? []),
                aux.settingsHealth?.errors.length ? t('general.files.restartAdvice') : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {aux.settingsFiles?.map((file) => (
                <SettingsField
                  key={file.scope}
                  title={
                    file.scope === 'device' ? t('general.files.device') : t('general.files.shared')
                  }
                  description={
                    <>
                      <code>{file.path}</code> —{' '}
                      {file.recovered ? t('general.files.continuing') : t('general.files.normal')}
                    </>
                  }
                >
                  {file.canRestore && (
                    <button
                      disabled={busy || aux.settingsHealth?.busy}
                      onClick={() => void run(() => invoke('restoreScopedSettings', [file.scope]))}
                    >
                      {t('general.files.restoreOne')}
                    </button>
                  )}
                </SettingsField>
              ))}
              <SettingsActions>
                <button
                  disabled={busy || aux.settingsHealth?.busy}
                  onClick={() => void run(() => invoke('restart'))}
                >
                  {t('general.files.restart')}
                </button>
                <button
                  disabled={busy || aux.settingsHealth?.busy || !aux.settingsHealth?.canRestore}
                  onClick={() => void run(() => invoke('restoreSettingsBackup'))}
                >
                  {t('general.files.restore')}
                </button>
                <button onClick={() => void run(() => invoke('openSettingsDirectory'))}>
                  {t('general.files.open')}
                </button>
                {aux.settingsHealth?.launchRecovery && (
                  <button
                    disabled={busy}
                    onClick={() => void run(() => invoke('recoverLaunchSettings'))}
                  >
                    {t('general.files.recoverLaunch')}
                  </button>
                )}
              </SettingsActions>
            </SettingsSection>
          </>
        )}
      </div>
    </div>
  );
}
function SettingRow({
  pageId,
  itemKey,
  description,
  error,
  children,
}: {
  pageId: string;
  itemKey: string;
  description?: string;
  error?: string;
  children: React.ReactNode;
}) {
  const { language } = useHostTranslation();
  const item = hostSettingItem(pageId, itemKey, language);
  const requiredDescription =
    pageId === 'general' && ['runAsAdministrator', 'hardwareAcceleration'].includes(itemKey);
  return (
    <SettingsField
      title={item.title}
      error={error}
      hint={description === undefined && !requiredDescription ? item.description : undefined}
      description={description ?? (requiredDescription ? item.description : undefined)}
      {...settingAnchor(pageId, itemKey)}
    >
      {children}
    </SettingsField>
  );
}

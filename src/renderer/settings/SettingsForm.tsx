import { McpClientSettingsForm } from './McpClientSettings';
import { hostSettingItem } from '../../shared/settings-catalog';
import { settingAnchor } from '../settings-ui/setting-anchor';
import React from 'react';
import type { Settings } from '../../shared/contracts';
import type { SettingsPageModel } from '../../shared/settings-page';
import { defaultShellId, shellRegions, shellView } from '../../shared/shell';
import { useSettingsControls } from '../settings-ui/api';
import { Toggle } from '../settings-ui/Toggle';
import { AboutSettings } from './AboutSettings';
import { AppletManagementSettings } from './AppletManagementSettings';
import { AppletUpdateSource } from './UpdateSettings';

import { ShortcutsEditor } from './ShortcutsEditor';
import { GesturesEditor } from './GesturesEditor';
import { RibbonSettings } from './RibbonSettings';
import { TraySettings } from './TraySettings';
import { TtsSettingsForm } from './TtsSettings';
import { AiSettingsForm } from './AiSettings';
import { CustomCommandsSettings } from './CustomCommandsSettings';
import { WebAccountSettings } from './WebAccountSettings';
import { ApiPermissionsSettings } from './ApiPermissionsSettings';
import { CodexSettings } from './CodexSettings';
import { NotificationSettings } from './NotificationSettings';
import { AppletSettingsForm } from '../settings-ui/AppletSettingsForm';
import { SettingsSection, SettingsField } from '../settings-ui/SettingsSections';
import { SettingsHint } from '../settings-ui/SettingsHint';
import { ImageLibrarySettings } from './ImageLibrarySettings';
export interface FormEditor {
  value: Settings;
  edit(value: Settings): void;
}
export function SettingsForm({
  model,
  editor,
  select,
  invoke,
}: {
  model: SettingsPageModel;
  editor: FormEditor;
  select(id: string): void;
  invoke(name: string, args?: unknown[]): Promise<any>;
}) {
  const settingsControls = useSettingsControls();
  const { page, auxiliary: aux, editing } = model.content;
  const category = page.id,
    settings = editor.value,
    edit = editor.edit,
    busy = editing.pending;
  const extensions = aux.applets ?? [],
    commands = aux.commands ?? [],
    globalHotKeys = aux.statuses ?? [];
  const launch = aux.launch!,
    runtime = aux.runtime!,
    version = aux.version ?? '';
  const setCategory = select;
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
          onListCommit={(key, value, before) => invoke('replaceAppletList', [key, value, before])}
          onListOpen={(key, id) => invoke('openAppletListItem', [key, id])}
        />
        {!page.collection && (
          <AppletUpdateSource
            extension={extensions.find((a) => a.id === page.owner)!}
            settings={settings}
            edit={edit}
          />
        )}
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
    return (
      <AboutSettings
        settings={settings}
        edit={edit}
        extensions={extensions}
        runtime={runtime}
        version={version}
        busy={busy}
        openApplets={() => select('applets')}
      />
    );
  if (category === 'tray')
    return (
      <TraySettings
        settings={settings}
        extensions={extensions}
        commands={commands}
        onChange={edit}
      />
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
      <CustomCommandsSettings
        settings={settings}
        auxiliary={aux.customCommands}
        invoke={invoke}
        busy={busy}
      />
    );
  if (category === 'ribbon')
    return (
      <RibbonSettings
        settings={settings}
        extensions={extensions}
        commands={commands}
        onEdit={(operation, before) => invoke('editRibbon', [operation, before])}
      />
    );
  if (category === 'image-library') return <ImageLibrarySettings />;
  if (category === 'notifications')
    return (
      <NotificationSettings
        editor={editor}
        types={aux.notificationTypes ?? []}
        auxiliary={aux.notificationSpeech}
        invoke={invoke}
        busy={busy}
        select={select}
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
        onOpenCodex={() => select('codex')}
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
        className={`settings-form${['general', 'appearance', 'gestures'].includes(category) ? ' settings-sections' : ''}`}
      >
        {category === 'gestures' && (
          <GesturesEditor
            provider={aux.provider}
            clearProvider={() => void invoke('clearProvider')}
            settings={settings}
            onChange={edit}
            commands={commands}
            applets={extensions}
          />
        )}
        {category === 'shortcuts' && (
          <ShortcutsEditor
            provider={aux.provider}
            clearProvider={() => void invoke('clearProvider')}
            key={category}
            commands={commands}
            settings={settings}
            onChange={edit}
            applets={extensions.map((e) => ({ id: e.id, title: e.displayName }))}
            statuses={globalHotKeys}
          />
        )}
        {category === 'appearance' && (
          <>
            <SettingsSection title="共通">
              <SettingRow pageId={category} itemKey="theme">
                <select
                  aria-label="テーマ"
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
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                  <option value="system">System</option>
                </select>
              </SettingRow>
              <SettingRow pageId={category} itemKey="showHints">
                <Toggle
                  label="ヒントの表示"
                  checked={settings.host.showHints}
                  onChange={(showHints) =>
                    edit({ ...settings, host: { ...settings.host, showHints } })
                  }
                />
              </SettingRow>
            </SettingsSection>
            <SettingsSection title="Shellの変更">
              {shellRegions.map(({ id, title }) => {
                const configured = settings.host.shellProviders?.[id] ?? defaultShellId;
                const candidates = extensions.filter(
                  (e) => e.id !== defaultShellId && shellView(e.shell, id),
                );
                const state = aux.shellRegions?.regions.find((r) => r.region === id);
                const name = (provider: string | null | undefined) =>
                  provider === defaultShellId
                    ? 'Default Shell'
                    : (extensions.find((e) => e.id === provider)?.displayName ??
                      provider ??
                      '未生成');
                return (
                  <SettingRow key={id} pageId={category} itemKey={'shellProviders.' + id}>
                    <div className="shell-region-controls">
                      <select
                        aria-label={title + 'のShell'}
                        value={configured}
                        disabled={busy}
                        onChange={(e) =>
                          edit({
                            ...settings,
                            host: {
                              ...settings.host,
                              shellProviders: {
                                ...settings.host.shellProviders,
                                [id]: e.target.value,
                              },
                            },
                          })
                        }
                      >
                        <option value={defaultShellId}>Default Shell（常時有効）</option>
                        {configured !== defaultShellId &&
                          !candidates.some((e) => e.id === configured) && (
                            <option value={configured}>{configured}（未導入・領域未提供）</option>
                          )}
                        {candidates.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.displayName}
                            {!e.enabled ? '（無効）' : ''}
                          </option>
                        ))}
                      </select>
                      <p className="muted">
                        使用先: {name(state?.boundProvider ?? state?.resolvedProvider)}
                        {state?.pendingProvider
                          ? ' ／適用待ち: ' + name(state.pendingProvider)
                          : ''}
                      </p>
                      {state?.reason && (
                        <>
                          <p role="status">{state.reason}</p>
                          <button
                            disabled={busy}
                            onClick={() => void invoke('retryShellRegion', [id])}
                          >
                            この領域を再試行
                          </button>
                          <SettingsHint>
                            workerの再起動が必要な場合は、このAppletの他の領域も再接続します。
                          </SettingsHint>
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
                  label="音の再生"
                  checked={settings.host.soundEnabled}
                  onChange={(v) =>
                    edit({ ...settings, host: { ...settings.host, soundEnabled: v } })
                  }
                />
              </SettingRow>
            </SettingsSection>
            <SettingsSection title="ウィンドウ">
              {(['closeToTray', 'startMinimized', 'hardwareAcceleration'] as const).map((key) => (
                <SettingRow key={key} pageId={category} itemKey={key}>
                  <Toggle
                    label={hostSettingItem(category, key).title}
                    checked={settings.host[key]}
                    onChange={(v) => edit({ ...settings, host: { ...settings.host, [key]: v } })}
                  />
                </SettingRow>
              ))}
            </SettingsSection>
            <SettingsSection
              title="スタートアップ"
              hint="Windowsへのサインイン時や、AppDockを起動したときの動作を設定します。"
            >
              <SettingRow pageId={category} itemKey="startAtLogon">
                <Toggle
                  label="スタートアップに登録"
                  checked={settings.host.startAtLogon}
                  disabled={!launch.supported}
                  onChange={(v) =>
                    edit({ ...settings, host: { ...settings.host, startAtLogon: v } })
                  }
                />
              </SettingRow>
              <SettingRow pageId={category} itemKey="runAsAdministrator">
                <Toggle
                  label="常に管理者として起動"
                  checked={settings.host.runAsAdministrator}
                  disabled={!launch.supported}
                  onChange={(v) =>
                    edit({ ...settings, host: { ...settings.host, runAsAdministrator: v } })
                  }
                />
              </SettingRow>
              <SettingRow
                pageId={category}
                itemKey="launch"
                description={
                  launch.supported
                    ? `${launch.elevated ? '管理者権限で動作中' : '通常権限で動作中'}。スタートアップ: ${launch.registered ? (launch.taskElevated ? '登録済み（管理者）' : '登録済み（通常権限）') : '未登録'}。`
                    : '起動設定はWindowsの発行版AppDockで使用できます。'
                }
              >
                <div className="button-row">
                  <button
                    disabled={!launch.supported || busy}
                    onClick={() => void run(() => invoke('refreshLaunchState'))}
                  >
                    状態を確認
                  </button>
                  <button
                    disabled={!launch.supported || launch.elevated || busy}
                    onClick={() => void run(() => invoke('restartAsAdministrator'))}
                  >
                    管理者として再起動
                  </button>
                </div>
              </SettingRow>
              {launch.error && <p role="alert">{launch.error}</p>}
              {launch.supported && (
                <p className="muted">
                  起動設定はこのEXEの配置先ごとに登録します。移動する前に登録を解除してください。管理者設定をOFFにした場合は、AppDockを完全終了し、通常の方法で起動し直してください。設定は変更時に保存されます。
                </p>
              )}
            </SettingsSection>
            <SettingsSection
              title="Applet・MCPからの操作"
              hint={hostSettingItem(category, 'permissions').description}
              {...settingAnchor(category, 'permissions')}
            >
              <div className="settings-actions">
                <button onClick={() => setCategory('permissions')}>操作の許可を開く</button>
              </div>
            </SettingsSection>
            <SettingsSection
              title="設定ファイル"
              hint="通知を閉じた後も、設定の状態と復旧操作を確認できます。"
            >
              <div {...settingAnchor(category, 'settingsFile')}>
                {!aux.settingsHealth?.errors.length && !aux.settingsHealth?.restartRequired && (
                  <p>設定は正常です。</p>
                )}
                {aux.settingsHealth?.recovered && (
                  <p>最後の正常な設定で動作しています。問題のあるファイルは保持しています。</p>
                )}
                {aux.settingsHealth?.reasons.map((reason) => (
                  <p key={reason}>{reason}</p>
                ))}
                {[...new Set(aux.settingsHealth?.errors)].map((reason) => (
                  <p role="alert" key={reason}>
                    {reason}
                  </p>
                ))}
                {!!aux.settingsHealth?.errors.length && <p>原因を確認して再起動してください。</p>}
                {aux.settingsHealth?.launchRecovery && (
                  <button
                    disabled={busy}
                    onClick={() => void run(() => invoke('recoverLaunchSettings'))}
                  >
                    中断したWindows起動設定を復旧
                  </button>
                )}
                {aux.settingsFiles?.map((file) => (
                  <div className="settings-file-diagnostic" key={file.scope}>
                    <strong>{file.scope === 'device' ? 'このPCの設定' : '共有設定'}</strong>
                    <code>{file.path}</code>
                    <p>
                      {file.recovered
                        ? '正常な設定で継続中です。ファイルを確認してください。'
                        : '正常'}
                    </p>
                    {file.canRestore && (
                      <button
                        disabled={busy || aux.settingsHealth?.busy}
                        onClick={() =>
                          void run(() => invoke('restoreScopedSettings', [file.scope]))
                        }
                      >
                        このファイルをバックアップで復元
                      </button>
                    )}
                  </div>
                ))}
                <div className="button-row">
                  <button
                    disabled={busy || aux.settingsHealth?.busy}
                    onClick={() => void run(() => invoke('restart'))}
                  >
                    再起動
                  </button>
                  <button
                    disabled={busy || aux.settingsHealth?.busy || !aux.settingsHealth?.canRestore}
                    onClick={() => void run(() => invoke('restoreSettingsBackup'))}
                  >
                    バックアップで復元
                  </button>
                  <button onClick={() => void run(() => invoke('openSettingsDirectory'))}>
                    保存先を開く
                  </button>
                </div>
              </div>
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
  children,
}: {
  pageId: string;
  itemKey: string;
  description?: string;
  children: React.ReactNode;
}) {
  const item = hostSettingItem(pageId, itemKey);
  const requiredDescription =
    pageId === 'general' && ['runAsAdministrator', 'hardwareAcceleration'].includes(itemKey);
  return (
    <SettingsField
      title={item.title}
      hint={description === undefined && !requiredDescription ? item.description : undefined}
      description={description ?? (requiredDescription ? item.description : undefined)}
      {...settingAnchor(pageId, itemKey)}
    >
      {children}
    </SettingsField>
  );
}

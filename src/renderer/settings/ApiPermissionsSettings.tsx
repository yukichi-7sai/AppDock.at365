import { useSettingsFeedback } from '../settings-ui/SettingsStatus';
import { hostSettingItem } from '../../shared/settings-catalog';
import { settingAnchor } from '../settings-ui/setting-anchor';
import { useSettingsControls } from '../settings-ui/api';
import { useEffect, useRef, useState } from 'react';
import { Toggle } from '../settings-ui/Toggle';
import { SettingsSection, SettingsField } from '../settings-ui/SettingsSections';
import {
  appletApiPermissionLabels,
  type AppletApiPermission,
  type AppletApiPermissions,
} from '../../shared/appdock-api';
import type { AutomationAction, AutomationState } from '../../shared/automation';

const rows: {
  key: AppletApiPermission;
  description: string;
  mcp?: keyof AutomationState;
  action?: string;
  label?: string;
  mcpWarning?: string;
}[] = [
  { key: 'read', description: hostSettingItem('permissions', 'read').description },
  {
    key: 'write',
    description: hostSettingItem('permissions', 'write').description,
    mcp: 'allowWrite',
    label: '設定変更',
  },
  {
    key: 'manageApplets',
    description: hostSettingItem('permissions', 'manageApplets').description,
    mcp: 'allowManageApplets',
    action: 'setAppletManagement',
    label: 'Applet管理',
  },
  {
    key: 'execute',
    description: hostSettingItem('permissions', 'execute').description,
    mcp: 'allowExecute',
    action: 'setExecution',
    label: 'コマンド実行',
    mcpWarning: '公開されたコマンドを実行します。操作内容によってPCや外部サービスへ影響します。',
  },
  {
    key: 'editShortcuts',
    description: hostSettingItem('permissions', 'editShortcuts').description,
    mcp: 'allowEditShortcuts',
    action: 'setShortcutEditing',
    label: 'ショートカット編集',
  },
  {
    key: 'editGestures',
    description: hostSettingItem('permissions', 'editGestures').description,
    mcp: 'allowEditGestures',
    action: 'setGestureEditing',
    label: 'ジェスチャー編集',
  },
  {
    key: 'editRibbon',
    description: hostSettingItem('permissions', 'editRibbon').description,
    mcp: 'allowEditRibbon',
    action: 'setRibbonEditing',
    label: 'リボン編集',
  },
  {
    key: 'editTray',
    description: hostSettingItem('permissions', 'editTray').description,
    mcp: 'allowEditTray',
    action: 'setTrayEditing',
    label: 'タスクトレイ編集',
  },
  {
    key: 'manageCustomCommands',
    description: hostSettingItem('permissions', 'manageCustomCommands').description,
    mcp: 'allowManageCustomCommands',
    action: 'setCustomCommandManagement',
    label: 'カスタムコマンド管理',
  },
  {
    key: 'sendInput',
    description: hostSettingItem('permissions', 'sendInput').description,
    mcp: 'allowSendInput',
    action: 'setInputSending',
    label: 'Windowsへのキー・操作メッセージ送信',
    mcpWarning:
      '他のアプリへキーや操作メッセージを送信します。意図しない操作につながる場合があります。',
  },
  {
    key: 'runProcesses',
    description: hostSettingItem('permissions', 'runProcesses').description,
    mcp: 'allowRunProcesses',
    action: 'setProcessLaunching',
    label: 'コマンド・プロセスの起動',
    mcpWarning:
      'このPCでコマンドやプログラムを起動します。ファイルやシステムへ影響する場合があります。',
  },
  {
    key: 'manageMcpServers',
    description: hostSettingItem('permissions', 'manageMcpServers').description,
    mcp: 'allowManageMcpServers',
    action: 'setMcpServerManagement',
    label: 'MCP接続先の管理',
  },
  {
    key: 'useMcp',
    description: hostSettingItem('permissions', 'useMcp').description,
    mcp: 'allowUseMcp',
    action: 'setMcpClient',
    label: 'MCP接続先の利用',
    mcpWarning:
      '接続先のMCPツールを利用します。ツールによって外部サービスやPC上の操作を実行します。',
  },
  {
    key: 'useAi',
    description: hostSettingItem('permissions', 'useAi').description,
    mcp: 'allowUseAi',
    action: 'setAi',
    label: 'AI文章生成',
    mcpWarning: '設定したAIサーバーへ入力した文章を送信します。',
  },
  {
    key: 'useTts',
    description: hostSettingItem('permissions', 'useTts').description,
    mcp: 'allowUseTts',
    action: 'setTts',
    label: '読み上げ',
    mcpWarning: '設定したTTSサーバーへ読み上げる文章を送信します。',
  },
];

function needs(key: AppletApiPermission, permissions: AppletApiPermissions, applet: boolean) {
  if (key === 'read' || (key === 'sendInput' && applet)) return [];
  const required: AppletApiPermission[] = applet ? ['read'] : [];
  if (
    key !== 'execute' &&
    key !== 'useTts' &&
    key !== 'useAi' &&
    key !== 'useMcp' &&
    key !== 'manageCustomCommands' &&
    key !== 'manageMcpServers'
  )
    required.push('execute');
  if (key.startsWith('edit')) required.push('write');
  return required.filter((k) => !permissions[k]).map((k) => appletApiPermissionLabels[k]);
}

export function ApiPermissionsSettings({
  grants,
  error: appletError,
  busy: hostBusy,
}: {
  grants: AppletApiPermissions;
  error?: string;
  busy: boolean;
}) {
  const settingsControls = useSettingsControls();
  const [state, setState] = useState<AutomationState>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const operation = useRef(false);
  useEffect(() => {
    let active = true;
    const refresh = () =>
      void settingsControls
        .automation({ kind: 'status' })
        .then((r) => {
          if (active) setState(r.state);
        })
        .catch((e) => {
          if (active) setError(String(e));
        });
    refresh();
    const unsubscribe = settingsControls.onChanged(refresh);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  async function save(action: () => Promise<unknown>) {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(String(e));
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  const mcpPermissions: AppletApiPermissions = {
    execute: state?.allowExecute,
    write: state?.allowWrite,
  };
  function reason(key: AppletApiPermission, applet: boolean) {
    if (!applet && !state?.running) return '連携が停止中です';
    const missing = needs(key, applet ? grants : mcpPermissions, applet);
    return missing.length ? `未有効：${missing.join('・')}の許可が必要です` : '';
  }
  useSettingsFeedback({
    busy,
    error: [error || appletError || state?.error ? error || appletError || state?.error : '']
      .filter(Boolean)
      .join('\n'),
  });
  return (
    <section className="api-permissions settings-sections" aria-label="操作の許可">
      <SettingsSection variant="card" title="APIの公開">
        <table className="permission-table">
          <thead>
            <tr>
              <th scope="col">操作</th>
              <th scope="col">Applet</th>
              <th scope="col">MCP</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const appletOn = grants[row.key] === true;
              const mcpOn = row.mcp && state?.[row.mcp] === true;
              return (
                <tr key={row.key} {...settingAnchor('permissions', row.key)}>
                  <th scope="row">
                    <strong>{appletApiPermissionLabels[row.key]}</strong>
                    <p>{row.description}</p>
                  </th>
                  <td data-caller="Applet">
                    <Toggle
                      label={`Applet：${appletApiPermissionLabels[row.key]}`}
                      checked={appletOn}
                      disabled={hostBusy || busy || !!appletError}
                      onChange={(value) =>
                        void save(() =>
                          settingsControls.setAppletApiPermissions({ ...grants, [row.key]: value }),
                        )
                      }
                    />
                    {appletOn && reason(row.key, true) && (
                      <small className="permission-pending">{reason(row.key, true)}</small>
                    )}
                  </td>
                  <td data-caller="MCP">
                    {row.key === 'read' ? (
                      <span className="permission-fixed" title="MCP連携中は常に許可">
                        <Toggle
                          label="Codexからの情報取得を許可する（MCP連携中は常に許可）"
                          checked
                          disabled
                          onChange={() => {}}
                        />
                      </span>
                    ) : (
                      <>
                        <div className="permission-control">
                          <Toggle
                            label={`Codexからの${row.label}を許可する`}
                            checked={!!mcpOn}
                            disabled={hostBusy || busy || !state}
                            onChange={(allowed) =>
                              void save(async () => {
                                const action =
                                  row.key === 'write'
                                    ? ({
                                        kind: 'configure',
                                        enabled: state!.enabled,
                                        allowWrite: allowed,
                                        port: state!.port,
                                      } as const)
                                    : ({ kind: row.action, allowed } as AutomationAction);
                                setState((await settingsControls.automation(action)).state);
                              })
                            }
                          />
                          {row.mcpWarning && (
                            <span className="permission-warning">
                              <span
                                className="permission-warning-icon"
                                role="img"
                                tabIndex={0}
                                aria-label={`MCP：${appletApiPermissionLabels[row.key]}の注意点`}
                                aria-describedby={`permission-warning-${row.key}`}
                              >
                                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                  <path
                                    d="M10.3 3.9 2.2 18a2 2 0 0 0 1.7 3h16.2a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    strokeLinejoin="round"
                                  />
                                  <path
                                    d="M12 9v4"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                  />
                                  <circle cx="12" cy="17" r="1" fill="currentColor" />
                                </svg>
                              </span>
                              <span
                                id={`permission-warning-${row.key}`}
                                className="permission-tooltip"
                                role="tooltip"
                              >
                                {row.mcpWarning}
                              </span>
                            </span>
                          )}
                        </div>
                        {mcpOn && reason(row.key, false) && (
                          <small className="permission-pending">{reason(row.key, false)}</small>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </SettingsSection>
      <SettingsSection
        title="許可の適用とログについて"
        collapsible
        description="必要な許可が不足している操作は、ONでも有効になりません。連携がOFFの間も、MCPの許可を設定できます。"
      >
        <SettingsField
          title="操作時の確認"
          description="MCPで公開されたAppletコマンドが共通APIを呼ぶ場合、Appletと元のMCPの両方の許可を確認します。キー送信やプロセス起動には、それぞれの操作許可も必要です。"
        />
        <SettingsField
          title="ログ"
          description="APIの呼出しと結果は、MCPはautomation、Appletは各Appletのログに記録します。引数の値や認証情報は記録しません。"
        />
      </SettingsSection>
    </section>
  );
}

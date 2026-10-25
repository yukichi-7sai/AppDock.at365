import { hostText } from '../../shared/i18n';
import { useHostTranslation } from '../HostTranslation';
import { useSettingsFeedback } from '../settings-ui/SettingsStatus';
import { hostSettingItem } from '../../shared/settings-catalog';
import { settingAnchor } from '../settings-ui/setting-anchor';
import { useSettingsControls } from '../settings-ui/api';
import { useEffect, useRef, useState } from 'react';
import { Toggle } from '../settings-ui/Toggle';
import { SettingsTable } from '../settings-ui/SettingsTable';
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
    label: hostText('settings.apiPermissionsSettings.settings'),
  },
  {
    key: 'manageApplets',
    description: hostSettingItem('permissions', 'manageApplets').description,
    mcp: 'allowManageApplets',
    action: 'setAppletManagement',
    label: hostText('settings.apiPermissionsSettings.applets'),
  },
  {
    key: 'execute',
    description: hostSettingItem('permissions', 'execute').description,
    mcp: 'allowExecute',
    action: 'setExecution',
    label: hostText('settings.apiPermissionsSettings.commands'),
    mcpWarning: hostText('settings.apiPermissionsSettings.commandsWarning'),
  },
  {
    key: 'editShortcuts',
    description: hostSettingItem('permissions', 'editShortcuts').description,
    mcp: 'allowEditShortcuts',
    action: 'setShortcutEditing',
    label: hostText('settings.apiPermissionsSettings.shortcuts'),
  },
  {
    key: 'editGestures',
    description: hostSettingItem('permissions', 'editGestures').description,
    mcp: 'allowEditGestures',
    action: 'setGestureEditing',
    label: hostText('settings.apiPermissionsSettings.gestures'),
  },
  {
    key: 'editTouchpadGestures',
    description: hostSettingItem('permissions', 'editTouchpadGestures').description,
    mcp: 'allowEditTouchpadGestures',
    action: 'setTouchpadGestureEditing',
    label: hostText('settings.apiPermissionsSettings.touchpad'),
  },
  {
    key: 'editRibbon',
    description: hostSettingItem('permissions', 'editRibbon').description,
    mcp: 'allowEditRibbon',
    action: 'setRibbonEditing',
    label: hostText('settings.apiPermissionsSettings.ribbon'),
  },
  {
    key: 'editTray',
    description: hostSettingItem('permissions', 'editTray').description,
    mcp: 'allowEditTray',
    action: 'setTrayEditing',
    label: hostText('settings.apiPermissionsSettings.tray'),
  },
  {
    key: 'manageCustomCommands',
    description: hostSettingItem('permissions', 'manageCustomCommands').description,
    mcp: 'allowManageCustomCommands',
    action: 'setCustomCommandManagement',
    label: hostText('settings.apiPermissionsSettings.customCommands'),
  },
  {
    key: 'sendInput',
    description: hostSettingItem('permissions', 'sendInput').description,
    mcp: 'allowSendInput',
    action: 'setInputSending',
    label: hostText('settings.apiPermissionsSettings.input'),
    mcpWarning: hostText('settings.apiPermissionsSettings.inputWarning'),
  },
  {
    key: 'runProcesses',
    description: hostSettingItem('permissions', 'runProcesses').description,
    mcp: 'allowRunProcesses',
    action: 'setProcessLaunching',
    label: hostText('settings.apiPermissionsSettings.process'),
    mcpWarning: hostText('settings.apiPermissionsSettings.processWarning'),
  },
  {
    key: 'manageMcpServers',
    description: hostSettingItem('permissions', 'manageMcpServers').description,
    mcp: 'allowManageMcpServers',
    action: 'setMcpServerManagement',
    label: hostText('settings.apiPermissionsSettings.mcpManage'),
  },
  {
    key: 'useMcp',
    description: hostSettingItem('permissions', 'useMcp').description,
    mcp: 'allowUseMcp',
    action: 'setMcpClient',
    label: hostText('settings.apiPermissionsSettings.mcpUse'),
    mcpWarning: hostText('settings.apiPermissionsSettings.mcpWarning'),
  },
  {
    key: 'useAi',
    description: hostSettingItem('permissions', 'useAi').description,
    mcp: 'allowUseAi',
    action: 'setAi',
    label: hostText('settings.apiPermissionsSettings.ai'),
    mcpWarning: hostText('settings.apiPermissionsSettings.aiWarning'),
  },
  {
    key: 'useTts',
    description: hostSettingItem('permissions', 'useTts').description,
    mcp: 'allowUseTts',
    action: 'setTts',
    label: hostText('settings.apiPermissionsSettings.tts'),
    mcpWarning: hostText('settings.apiPermissionsSettings.ttsWarning'),
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
  const { t: translate } = useHostTranslation();
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
    if (!applet && !state?.running) return translate('settings.apiPermissionsSettings.stopped');
    const missing = needs(key, applet ? grants : mcpPermissions, applet);
    return missing.length
      ? translate('settings.apiPermissionsSettings.prerequisites', { value: missing.join('・') })
      : '';
  }
  useSettingsFeedback({
    busy,
    error: [error || appletError || state?.error ? error || appletError || state?.error : '']
      .filter(Boolean)
      .join('\n'),
  });
  return (
    <section
      className="api-permissions settings-sections"
      aria-label={translate('settings.apiPermissionsSettings.title')}
    >
      <SettingsTable
        framed
        className="permission-table"
        aria-label={translate('settings.apiPermissionsSettings.api')}
      >
        <thead>
          <tr>
            <th scope="col">{translate('settings.apiPermissionsSettings.actions')}</th>
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
                    <span
                      className="permission-fixed"
                      title={translate('settings.apiPermissionsSettings.alwaysAllowed')}
                    >
                      <Toggle
                        label={translate('settings.apiPermissionsSettings.infoAllowed')}
                        checked
                        disabled
                        onChange={() => {}}
                      />
                    </span>
                  ) : (
                    <>
                      <div className="permission-control">
                        <Toggle
                          label={translate('settings.apiPermissionsSettings.allow', {
                            label: row.label ?? appletApiPermissionLabels[row.key],
                          })}
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
                              aria-label={translate('settings.apiPermissionsSettings.warning', {
                                value: appletApiPermissionLabels[row.key] ?? row.key,
                              })}
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
      </SettingsTable>
      <SettingsSection
        title={translate('settings.apiPermissionsSettings.details')}
        data-testid="permissions-help"
        collapsible
        description={translate('settings.apiPermissionsSettings.prerequisiteHint')}
      >
        <SettingsField
          title={translate('settings.apiPermissionsSettings.operationCheck')}
          description={translate('settings.apiPermissionsSettings.operationHint')}
        />
        <SettingsField
          title={translate('settings.apiPermissionsSettings.logs')}
          description={translate('settings.apiPermissionsSettings.logsHint')}
        />
      </SettingsSection>
    </section>
  );
}

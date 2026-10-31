import { HostMessage, useHostTranslation } from '../HostTranslation';
import { settingAnchor } from '../settings-ui/setting-anchor';
import { SettingsInput, SettingsTextarea } from '../settings-ui/SettingsInput';
import { useSettingsControls } from '../settings-ui/api';
import { useEffect, useRef, useState } from 'react';
import { Toggle } from '../settings-ui/Toggle';
import type { AutomationAction, AutomationState, AutomationReply } from '../../shared/automation';
import { SettingsSection, SettingsField, SettingsActions } from '../settings-ui/SettingsSections';
import { useSettingsFeedback } from '../settings-ui/SettingsStatus';
import { SettingsDialog } from '../settings-ui/SettingsModal';

export function CodexSettings({ onOpenPermissions }: { onOpenPermissions(): void }) {
  const { t: translate } = useHostTranslation();
  const settingsControls = useSettingsControls();
  const [state, setState] = useState<AutomationState>();
  const [showReload, setShowReload] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [file, setFile] = useState('');
  const [port, setPort] = useState('0');
  const [name, setName] = useState('AppDock');
  const [hostnames, setHostnames] = useState('');
  const operation = useRef(false);
  const [confirmation, setConfirmation] = useState<AutomationReply['registrationConfirmation']>();
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    setShowReload(false);
    if (state) return;
    const timer = window.setTimeout(() => setShowReload(true), 1000);
    return () => window.clearTimeout(timer);
  }, [state]);
  useEffect(() => {
    let active = true;
    const refresh = () =>
      void settingsControls
        .automation({ kind: 'status' })
        .then((r) => {
          if (!active) return;
          setState(r.state);
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
  useEffect(() => {
    if (state) setFile(state.configFile);
  }, [state?.configFile]);
  useEffect(() => {
    if (state) setPort(String(state.port));
  }, [state?.port]);
  useEffect(() => {
    if (state) setName(state.serverId);
  }, [state?.serverId]);
  const savedHostnames = state?.networkHostnames.join('\n');
  useEffect(() => {
    setHostnames(savedHostnames ?? '');
  }, [savedHostnames]);
  function saveHostnames(value: string) {
    const names = value
      .split(/\r?\n/)
      .map((name) => name.trim())
      .filter(Boolean);
    if (JSON.stringify(names) !== JSON.stringify(state?.networkHostnames))
      void run({ kind: 'setNetworkHostnames', hostnames: names });
  }
  async function run(action: AutomationAction) {
    if (operation.current) return;
    if (action.kind === 'register' || action.kind === 'unregister')
      returnFocus.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
    operation.current = true;
    setBusy(true);
    setError('');
    try {
      const r = await settingsControls.automation(action);
      setState(r.state);
      setConfirmation(r.registrationConfirmation);
    } catch (e) {
      setError(String(e));
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  useSettingsFeedback({
    error: error || state?.error || state?.registrationError,
    busy,
    target: translate('settings.codexSettings.title'),
    message: !state && !error ? translate('settings.codexSettings.loading') : '',
  });
  if (!state)
    return showReload || error || busy ? (
      <div className="settings-sections">
        <button disabled={busy} onClick={() => void run({ kind: 'status' })}>
          {translate('settings.codexSettings.reload')}
        </button>
      </div>
    ) : null;
  const configure = (
    enabled = state.enabled,
    allowWrite = state.allowWrite,
    nextPort = state.port,
  ) => void run({ kind: 'configure', enabled, allowWrite, port: nextPort });
  const registration =
    state.registration === 'registered'
      ? translate('settings.codexSettings.registered')
      : state.registration === 'conflict'
        ? translate('settings.codexSettings.attention')
        : translate('settings.codexSettings.unregistered');
  const networkStatus =
    state.connectionScope !== 'network'
      ? translate('settings.codexSettings.networkDisabled')
      : !state.running
        ? translate('settings.codexSettings.serverStopped')
        : state.networkEndpoints.length === 0
          ? translate('settings.codexSettings.noEndpoints')
          : undefined;
  return (
    <section
      className="settings-sections codex-settings"
      aria-label={translate('settings.codexSettings.integration')}
    >
      <SettingsSection
        title={translate('settings.codexSettings.connection')}
        hint={translate('settings.codexSettings.connectionHint')}
      >
        <SettingsField
          title={translate('settings.codexSettings.registration')}
          description={registration}
        />
        <SettingsField
          title={translate('settings.codexSettings.lastLocal')}
          description={
            state.lastLocalClientAt
              ? new Date(state.lastLocalClientAt).toLocaleString()
              : translate('settings.codexSettings.never')
          }
        />
        <SettingsField
          title={translate('settings.codexSettings.lastNetwork')}
          description={
            state.lastNetworkClientAt
              ? new Date(state.lastNetworkClientAt).toLocaleString()
              : translate('settings.codexSettings.never')
          }
        />
        <SettingsField
          title={translate('settings.codexSettings.enable')}
          description={translate('settings.codexSettings.serverState', {
            value: state.running
              ? translate('settings.codexSettings.running')
              : state.enabled
                ? translate('settings.codexSettings.startFailed')
                : translate('settings.codexSettings.stopped'),
          })}
          hint={translate('settings.codexSettings.runningHint')}
          {...settingAnchor('codex', 'automation')}
        >
          <Toggle
            label={translate('settings.codexSettings.enableLabel')}
            checked={state.enabled}
            disabled={busy}
            onChange={(v) => configure(v)}
          />
        </SettingsField>
        <SettingsField
          title={translate('settings.codexSettings.scope')}
          description={
            translate('settings.codexSettings.scopeHint') +
            (state.connectionScope === 'network'
              ? translate('settings.codexSettings.networkWarning')
              : '')
          }
          {...settingAnchor('codex', 'connectionScope')}
        >
          <select
            aria-label={translate('settings.codexSettings.scope')}
            value={state.connectionScope}
            disabled={busy}
            onChange={(e) =>
              void run({ kind: 'setConnectionScope', scope: e.target.value as 'local' | 'network' })
            }
          >
            <option value="local">{translate('settings.codexSettings.localOnly')}</option>
            <option value="network">{translate('settings.codexSettings.network')}</option>
          </select>
        </SettingsField>
        {state.enabled && !state.running && (
          <SettingsActions>
            <button disabled={busy} onClick={() => void run({ kind: 'retryStart' })}>
              {translate('settings.codexSettings.retry')}
            </button>
          </SettingsActions>
        )}
        <SettingsField
          title={translate('settings.codexSettings.permissions')}
          hint={translate('settings.codexSettings.permissionsHint')}
          {...settingAnchor('codex', 'permissions')}
        >
          <SettingsActions>
            <button onClick={onOpenPermissions}>
              {translate('settings.codexSettings.openPermissions')}
            </button>
          </SettingsActions>
        </SettingsField>
      </SettingsSection>
      <SettingsSection
        title={translate('settings.codexSettings.registrationSection')}
        data-testid="codex-integration-settings"
        description={[
          !state.running ? translate('settings.codexSettings.enableFirst') : '',
          file !== state.configFile ? translate('settings.codexSettings.savePathFirst') : '',
          translate('settings.codexSettings.afterRegistration'),
          translate('settings.codexSettings.testHint'),
        ]
          .filter(Boolean)
          .join(' ')}
        hint={translate('settings.codexSettings.registerHint')}
      >
        <SettingsField
          title={translate('settings.codexSettings.register')}
          {...settingAnchor('codex', 'registration')}
        >
          <SettingsActions>
            <button
              className="primary"
              disabled={busy || !state.running || file !== state.configFile}
              onClick={() => void run({ kind: 'register' })}
            >
              {state.registration !== 'absent'
                ? translate('settings.codexSettings.repair')
                : translate('settings.codexSettings.register')}
            </button>
            <button disabled={busy || !state.running} onClick={() => void run({ kind: 'test' })}>
              {translate('settings.codexSettings.testLocal')}
            </button>
            <button
              disabled={busy || state.registration === 'absent'}
              onClick={() => void run({ kind: 'unregister' })}
            >
              {translate('settings.codexSettings.unregister')}
            </button>
          </SettingsActions>
        </SettingsField>
        <SettingsField
          title={translate('settings.codexSettings.configFile')}
          hint={translate('settings.codexSettings.configFileHint')}
          description={translate('settings.codexSettings.unsupportedTarget')}
        >
          <SettingsInput
            aria-label={translate('settings.codexSettings.configFile')}
            commitOn="input"
            value={file}
            disabled={busy}
            spellCheck={false}
            onChange={(e) => setFile(e.target.value)}
          />
          <SettingsActions>
            <button
              disabled={busy || !file.trim() || file === state.configFile}
              onClick={() => void run({ kind: 'selectConfig', file })}
            >
              {translate('settings.codexSettings.changePath')}
            </button>
          </SettingsActions>
        </SettingsField>
        <SettingsField
          title={translate('settings.codexSettings.registrationName')}
          hint={translate('settings.codexSettings.registrationNameHint')}
          description={translate('settings.codexSettings.unregisterFirst')}
        >
          <SettingsInput
            aria-label={translate('settings.codexSettings.registrationName')}
            commitOn="input"
            value={name}
            maxLength={64}
            disabled={busy}
            spellCheck={false}
            onChange={(e) => setName(e.target.value)}
          />
          <SettingsActions>
            <button
              disabled={busy || !name.trim() || name === state.serverId}
              onClick={() => void run({ kind: 'selectName', name })}
            >
              {translate('settings.codexSettings.saveName')}
            </button>
          </SettingsActions>
        </SettingsField>
      </SettingsSection>
      <SettingsSection
        title={translate('settings.codexSettings.networkConnection')}
        description={
          networkStatus &&
          translate('settings.codexSettings.networkStatus', { value: networkStatus })
        }
        hint={translate('settings.codexSettings.networkSetup')}
        data-testid="mcp-connection-settings"
        {...settingAnchor('codex', 'network')}
      >
        <SettingsField
          {...settingAnchor('codex', 'connection')}
          title={translate('settings.codexSettings.port')}
          hint={translate('settings.codexSettings.portHint')}
          description={translate('settings.codexSettings.portEndpoint', {
            value: state.endpoint || translate('settings.codexSettings.endpointPending'),
          })}
        >
          <SettingsInput
            type="number"
            min={0}
            max={65535}
            step={1}
            aria-label={translate('settings.codexSettings.port')}
            commitOn="input"
            value={port}
            disabled={busy}
            onChange={(e) => setPort(e.target.value)}
          />
          <SettingsActions>
            <button
              disabled={
                busy || !/^\d+$/.test(port) || Number(port) > 65535 || Number(port) === state.port
              }
              onClick={() => configure(state.enabled, state.allowWrite, Number(port))}
            >
              {translate('settings.codexSettings.applyPort')}
            </button>
          </SettingsActions>
        </SettingsField>
        <SettingsField
          title={translate('settings.codexSettings.hosts')}
          hint={translate('settings.codexSettings.hostsHint')}
        >
          <SettingsTextarea
            aria-label={translate('settings.codexSettings.hosts')}
            value={hostnames}
            rows={3}
            disabled={busy}
            spellCheck={false}
            onChange={(e) => {
              setHostnames(e.target.value);
              saveHostnames(e.target.value);
            }}
          />
        </SettingsField>
        {state.connectionScope === 'network' &&
          state.running &&
          state.networkEndpoints.length > 0 && (
            <SettingsField
              title={translate('settings.codexSettings.endpoints')}
              hint={translate('settings.codexSettings.endpointsHint')}
            >
              {state.networkEndpoints.map((endpoint) => (
                <SettingsActions key={endpoint} className="codex-network-endpoint">
                  <SettingsInput
                    aria-label={translate('settings.codexSettings.endpoint', {
                      endpoint: endpoint,
                    })}
                    readOnly
                    value={endpoint}
                  />
                  <button
                    disabled={busy}
                    onClick={() => void run({ kind: 'copyEndpoint', endpoint })}
                  >
                    {translate('settings.codexSettings.copyEndpoint')}
                  </button>
                </SettingsActions>
              ))}
            </SettingsField>
          )}
        <SettingsField
          title={translate('settings.codexSettings.token')}
          description={[
            translate('settings.codexSettings.tokenHint'),
            translate('settings.codexSettings.authManagementHint'),
          ].join(' ')}
        >
          <SettingsActions>
            <button disabled={busy} onClick={() => void run({ kind: 'status' })}>
              {translate('settings.codexSettings.reloadConnection')}
            </button>
            <button
              disabled={busy || !state.canCopyToken}
              onClick={() => void run({ kind: 'copyToken' })}
            >
              {translate('settings.codexSettings.copyToken')}
            </button>
            <button
              disabled={busy || !state.port}
              onClick={() => void run({ kind: 'rotateToken' })}
            >
              {translate('settings.codexSettings.rotateToken')}
            </button>
          </SettingsActions>
        </SettingsField>
        <SettingsSection
          variant="group"
          title={translate('settings.codexSettings.authExamples')}
          description={translate('settings.codexSettings.authExamplesHint')}
          hint={translate('settings.codexSettings.tokenSetup')}
        >
          <SettingsField
            title={translate('settings.codexSettings.environment')}
            description={
              <HostMessage
                message="settings.codexSettings.environmentInstructions"
                values={{
                  variable: <code>MCP_BEARER_TOKEN</code>,
                  break: <br />,
                  scheme: <code>Bearer </code>,
                }}
              />
            }
          />
          <SettingsField
            title={translate('settings.codexSettings.header')}
            description={
              <>
                {translate('settings.codexSettings.headerKey')}
                <code>Authorization</code>
                <br />
                {translate('settings.codexSettings.headerValue')}
                <code>{translate('settings.codexSettings.bearerExample')}</code>
                <br />
                <HostMessage
                  message="settings.codexSettings.headerInstructions"
                  values={{
                    scheme: <code>Bearer</code>,
                    token: <code>{translate('settings.codexSettings.tokenPlaceholder')}</code>,
                  }}
                />
              </>
            }
          />
        </SettingsSection>
      </SettingsSection>
      {confirmation && (
        <SettingsDialog
          title={translate(
            confirmation.kind === 'register'
              ? 'settings.codexSettings.confirmRepairTitle'
              : 'settings.codexSettings.confirmRemovalTitle',
          )}
          description={translate(
            confirmation.kind === 'register'
              ? 'settings.codexSettings.confirmRepairDescription'
              : 'settings.codexSettings.confirmRemovalDescription',
          )}
          applyLabel={translate(
            confirmation.kind === 'register'
              ? 'settings.codexSettings.repair'
              : 'settings.codexSettings.unregister',
          )}
          returnFocus={returnFocus.current}
          onClose={() => setConfirmation(undefined)}
          onApply={async () => {
            const reply = await settingsControls.automation({
              kind: confirmation.kind,
              confirmationId: confirmation.id,
            });
            setState(reply.state);
          }}
        >
          <SettingsField
            title={translate('settings.codexSettings.registrationName')}
            description={confirmation.name}
          />
          <SettingsField
            title={translate('settings.codexSettings.configFile')}
            description={confirmation.configFile}
          />
        </SettingsDialog>
      )}
    </section>
  );
}

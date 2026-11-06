import { useEffect, useRef, useState } from 'react';
import { useHostTranslation } from '../HostTranslation';
import { settingAnchor } from '../settings-ui/setting-anchor';
import { SettingsInput } from '../settings-ui/SettingsInput';
import { useSettingsControls } from '../settings-ui/api';
import { Toggle } from '../settings-ui/Toggle';
import type {
  AutomationAction,
  AutomationReceiver,
  AutomationState,
} from '../../shared/automation';
import { SettingsSection, SettingsField, SettingsActions } from '../settings-ui/SettingsSections';
import { useSettingsFeedback } from '../settings-ui/SettingsStatus';
import { CodexSettings } from './CodexSettings';
import { McpServerSettings } from './McpServerSettings';

export function McpReceiverSettings({
  state,
  receiver,
  onOpenPermissions,
}: {
  state?: AutomationState;
  receiver: AutomationReceiver;
  onOpenPermissions(): void;
}) {
  const { t: translate } = useHostTranslation();
  const settingsControls = useSettingsControls();
  const codex = receiver === 'codex';
  const page = codex ? 'codex' : 'mcp-server';
  const listener = codex ? state?.codex : state;
  const [showReload, setShowReload] = useState(false);
  const [operating, setOperating] = useState(false);
  const busy = operating || listener?.starting === true;
  const [error, setError] = useState('');
  const [port, setPort] = useState(String(listener?.port ?? 0));
  const operation = useRef(false);
  useEffect(() => {
    setShowReload(false);
    if (listener) return;
    const timer = window.setTimeout(() => setShowReload(true), 1000);
    return () => window.clearTimeout(timer);
  }, [!!listener]);
  useEffect(() => setPort(String(listener?.port ?? 0)), [listener?.port]);
  async function run(action: AutomationAction) {
    if (operation.current) return;
    operation.current = true;
    setOperating(true);
    setError('');
    try {
      return await settingsControls.automation(action);
    } catch (error) {
      setError(String(error));
    } finally {
      operation.current = false;
      setOperating(false);
    }
  }
  const title = translate(
    codex ? 'settings.codexSettings.title' : 'settings.mcpServerSettings.title',
  );
  useSettingsFeedback({
    error: error || listener?.error || (codex ? state?.codex.registrationError : undefined),
    busy,
    target: title,
    message: !listener && !error ? translate('settings.codexSettings.loading') : '',
  });
  if (!state || !listener)
    return showReload || error || busy ? (
      <div className="settings-sections">
        <button disabled={busy} onClick={() => void run({ kind: 'status' })}>
          {translate('settings.codexSettings.reload')}
        </button>
      </div>
    ) : null;
  const configure = (enabled: boolean, nextPort: number) =>
    void run({ kind: 'configure', enabled, port: nextPort });
  const lastConnection = (value?: string) =>
    value ? new Date(value).toLocaleString() : translate('settings.codexSettings.never');
  const portField = (
    <SettingsField
      {...settingAnchor(page, 'connection')}
      title={translate('settings.codexSettings.port')}
      hint={translate('settings.codexSettings.portHint')}
      description={translate(
        codex ? 'settings.codexSettings.portEndpoint' : 'settings.mcpServerSettings.portEndpoint',
        { value: listener.endpoint || translate('settings.codexSettings.endpointPending') },
      )}
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
            busy || !/^\d+$/.test(port) || Number(port) > 65535 || Number(port) === listener.port
          }
          onClick={() => configure(listener.enabled, Number(port))}
        >
          {translate('settings.codexSettings.applyPort')}
        </button>
      </SettingsActions>
    </SettingsField>
  );
  return (
    <section className="settings-sections codex-settings" aria-label={title}>
      <SettingsSection
        title={translate(
          codex ? 'settings.codexSettings.inbound' : 'settings.codexSettings.connection',
        )}
        hint={translate(
          codex
            ? 'settings.codexSettings.connectionHint'
            : 'settings.mcpServerSettings.connectionHint',
        )}
      >
        {codex ? (
          <>
            <SettingsField
              title={translate('settings.codexSettings.registration')}
              description={translate(
                state.codex.registration === 'registered'
                  ? 'settings.codexSettings.registered'
                  : state.codex.registration === 'conflict'
                    ? 'settings.codexSettings.attention'
                    : 'settings.codexSettings.unregistered',
              )}
            />
            <SettingsField
              title={translate('settings.codexSettings.lastLocal')}
              description={lastConnection(listener.lastClientAt)}
            />
          </>
        ) : (
          <>
            <SettingsField
              title={translate('settings.codexSettings.lastLocal')}
              description={lastConnection(state.lastLocalClientAt)}
            />
            <SettingsField
              title={translate('settings.codexSettings.lastNetwork')}
              description={lastConnection(state.lastNetworkClientAt)}
            />
          </>
        )}
        <SettingsField
          title={translate('settings.codexSettings.enable')}
          description={translate('settings.codexSettings.serverState', {
            value: translate(
              listener.running
                ? 'settings.codexSettings.running'
                : listener.starting
                  ? 'settings.codexSettings.starting'
                  : listener.enabled
                    ? 'settings.codexSettings.startFailed'
                    : 'settings.codexSettings.stopped',
            ),
          })}
          hint={translate('settings.codexSettings.runningHint')}
          {...settingAnchor(page, 'automation')}
        >
          <Toggle
            label={translate(
              codex
                ? 'settings.codexSettings.enableLabel'
                : 'settings.mcpServerSettings.enableLabel',
            )}
            checked={listener.enabled}
            disabled={busy}
            onChange={(enabled) => configure(enabled, listener.port)}
          />
        </SettingsField>
        {listener.enabled && !listener.running && !listener.starting && (
          <SettingsField
            title={translate('settings.codexSettings.retryTitle')}
            description={translate('settings.codexSettings.retryDescription')}
          >
            <SettingsActions>
              <button disabled={busy} onClick={() => void run({ kind: 'retryStart' })}>
                {translate('settings.codexSettings.retry')}
              </button>
            </SettingsActions>
          </SettingsField>
        )}
        <SettingsField
          title={translate('settings.codexSettings.permissions')}
          hint={translate('settings.codexSettings.permissionsHint')}
          {...settingAnchor(page, 'permissions')}
        >
          <SettingsActions>
            <button onClick={onOpenPermissions}>
              {translate('settings.codexSettings.openPermissions')}
            </button>
          </SettingsActions>
        </SettingsField>
      </SettingsSection>
      {codex ? (
        <>
          <CodexSettings state={state.codex} busy={busy} run={run} />
          <SettingsSection title={translate('settings.codexSettings.networkConnection')}>
            {portField}
            <SettingsField
              title={translate('settings.codexSettings.token')}
              description={translate('settings.codexSettings.localTokenHint')}
            >
              <SettingsActions>
                <button disabled={busy} onClick={() => void run({ kind: 'status' })}>
                  {translate('settings.codexSettings.reloadConnection')}
                </button>
                <button
                  disabled={busy || !listener.hasToken}
                  onClick={() => void run({ kind: 'rotateToken' })}
                >
                  {translate('settings.codexSettings.rotateToken')}
                </button>
              </SettingsActions>
            </SettingsField>
          </SettingsSection>
        </>
      ) : (
        <McpServerSettings state={state} busy={busy} run={run}>
          {portField}
        </McpServerSettings>
      )}
    </section>
  );
}

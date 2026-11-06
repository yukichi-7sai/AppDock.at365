import { useEffect, useState, type ReactNode } from 'react';
import { HostMessage, useHostTranslation } from '../HostTranslation';
import { settingAnchor } from '../settings-ui/setting-anchor';
import { SettingsInput, SettingsTextarea } from '../settings-ui/SettingsInput';
import { SettingsSection, SettingsField, SettingsActions } from '../settings-ui/SettingsSections';
import type { AutomationAction, AutomationState } from '../../shared/automation';

export function McpServerSettings({
  state,
  busy,
  run,
  children,
}: {
  state: AutomationState;
  busy: boolean;
  run(action: AutomationAction): Promise<unknown>;
  children: ReactNode;
}) {
  const { t: translate } = useHostTranslation();
  const savedHostnames = state.networkHostnames.join('\n');
  const [hostnames, setHostnames] = useState(savedHostnames);
  useEffect(() => setHostnames(savedHostnames), [savedHostnames]);
  function saveHostnames(value: string) {
    const names = value
      .split(/\r?\n/)
      .map((name) => name.trim())
      .filter(Boolean);
    if (JSON.stringify(names) !== JSON.stringify(state.networkHostnames))
      void run({ kind: 'setNetworkHostnames', hostnames: names });
  }
  const networkStatus =
    state.connectionScope !== 'network'
      ? translate('settings.codexSettings.networkDisabled')
      : state.starting
        ? translate('settings.codexSettings.starting')
        : !state.running
          ? translate('settings.codexSettings.serverStopped')
          : state.networkEndpoints.length === 0
            ? translate('settings.codexSettings.noEndpoints')
            : undefined;
  return (
    <SettingsSection
      title={translate('settings.codexSettings.networkConnection')}
      description={
        networkStatus && translate('settings.codexSettings.networkStatus', { value: networkStatus })
      }
      hint={translate('settings.codexSettings.networkSetup')}
      data-testid="mcp-connection-settings"
      {...settingAnchor('mcp-server', 'network')}
    >
      <SettingsField
        title={translate('settings.codexSettings.scope')}
        description={
          translate('settings.codexSettings.scopeHint') +
          (state.connectionScope === 'network'
            ? translate('settings.codexSettings.networkWarning')
            : '')
        }
        {...settingAnchor('mcp-server', 'connectionScope')}
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
      {children}
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
          <button disabled={busy || !state.running} onClick={() => void run({ kind: 'test' })}>
            {translate('settings.codexSettings.testLocal')}
          </button>
          <button
            disabled={busy || !state.canCopyToken}
            onClick={() => void run({ kind: 'copyToken' })}
          >
            {translate('settings.codexSettings.copyToken')}
          </button>
          <button
            disabled={busy || !state.hasToken}
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
  );
}

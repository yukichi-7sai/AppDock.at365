import { useEffect, useRef, useState } from 'react';
import { useHostTranslation } from '../HostTranslation';
import { settingAnchor } from '../settings-ui/setting-anchor';
import { SettingsInput } from '../settings-ui/SettingsInput';
import { useSettingsControls } from '../settings-ui/api';
import { SettingsSection, SettingsField, SettingsActions } from '../settings-ui/SettingsSections';
import { SettingsDialog } from '../settings-ui/SettingsModal';
import type {
  AutomationAction,
  AutomationReply,
  CodexIntegrationState,
} from '../../shared/automation';

export function CodexSettings({
  state,
  busy,
  run,
}: {
  state: CodexIntegrationState;
  busy: boolean;
  run(action: AutomationAction): Promise<AutomationReply | undefined>;
}) {
  const { t: translate } = useHostTranslation();
  const settingsControls = useSettingsControls();
  const [file, setFile] = useState(state.configFile);
  const [name, setName] = useState(state.serverId);
  const [confirmation, setConfirmation] = useState<AutomationReply['registrationConfirmation']>();
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => setFile(state.configFile), [state.configFile]);
  useEffect(() => setName(state.serverId), [state.serverId]);
  async function registrationAction(kind: 'register' | 'unregister') {
    returnFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setConfirmation((await run({ kind }))?.registrationConfirmation);
  }
  return (
    <>
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
              onClick={() => void registrationAction('register')}
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
              onClick={() => void registrationAction('unregister')}
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
            await settingsControls.automation({
              kind: confirmation.kind,
              confirmationId: confirmation.id,
            });
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
    </>
  );
}

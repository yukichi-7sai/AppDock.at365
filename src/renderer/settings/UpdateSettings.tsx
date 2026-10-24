import { useHostTranslation } from '../HostTranslation';
import { useSettingsFeedback } from '../settings-ui/SettingsStatus';
import { hostSettingItem } from '../../shared/settings-catalog';
import { settingAnchor } from '../settings-ui/setting-anchor';
import { SettingsInput, SettingsUrlInput, numberInput } from '../settings-ui/SettingsInput';
import { useSettingsControls } from '../settings-ui/api';
import { useEffect, useState } from 'react';
import type { Settings, ExtensionSnapshot, UpdateState } from '../../shared/contracts';
import { createDefaultSettings } from '../../shared/settings-schema';
import { UpdateCheckTime } from '../settings-ui/VersionCheck';
import {
  SettingsSection,
  SettingsField,
  SettingsActions,
  SettingsContent,
} from '../settings-ui/SettingsSections';
import { Toggle } from '../settings-ui/Toggle';
import { SettingsButton } from '../settings-ui/SettingsButton';
import { SettingsInputActions } from '../settings-ui/SettingsSections';
import { Icon } from '../../shared/ui-icons';

export function UpdateActions({
  appletCount,
  embedded = false,
}: {
  appletCount: number;
  embedded?: boolean;
}) {
  const { t: translate } = useHostTranslation();
  const settingsControls = useSettingsControls();
  const [state, setState] = useState<UpdateState>({ busy: false, phase: '', results: [] });
  const [error, setError] = useState('');
  const checkedAt = state.results
    .map((result) => result.checkedAt)
    .sort()
    .at(-1);
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      void settingsControls.snapshot().then((snapshot) => {
        if (alive) setState(snapshot.updates);
      });
    };
    refresh();
    const unsubscribe = settingsControls.onChanged(refresh);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);
  const action = (callback: () => Promise<unknown>) => {
    setError('');
    void callback()
      .then(() => settingsControls.snapshot())
      .then((snapshot) => setState(snapshot.updates))
      .catch((error) => setError(String(error).replace(/^Error: /, '')));
  };
  useSettingsFeedback({ error });
  const content = (
    <>
      <SettingsActions className="update-actions">
        <button
          className="update-primary"
          disabled={state.busy}
          onClick={() =>
            action(() => settingsControls.executeCommand('appdock.updates.installAll'))
          }
        >
          {translate('settings.updateSettings.updateAll')}
        </button>
        {!embedded && (
          <button
            className="text-button"
            disabled={state.busy || appletCount === 0}
            onClick={() => action(() => settingsControls.installUpdates('applets'))}
          >
            {translate('settings.updateSettings.updateApplets')}
          </button>
        )}
      </SettingsActions>
      {!embedded && (
        <SettingsContent className="update-last-checked">
          <UpdateCheckTime checkedAt={checkedAt} />
        </SettingsContent>
      )}
    </>
  );
  return embedded ? (
    <div className="about-update-group" {...settingAnchor('about', 'updateActions')}>
      {content}
    </div>
  ) : (
    <SettingsSection
      {...settingAnchor('about', 'updateActions')}
      title={translate('settings.updateSettings.batch')}
      hint={translate('settings.updateSettings.batchHint')}
    >
      {content}
    </SettingsSection>
  );
}

export function UpdateSettings({
  settings,
  edit: onChange,
}: {
  settings: Settings;
  edit(next: Settings): void;
}) {
  const { t: translate } = useHostTranslation();
  const settingsControls = useSettingsControls();
  const edit = (change: (next: Settings) => void) => {
    const next = structuredClone(settings);
    change(next);
    onChange(next);
  };
  return (
    <SettingsSection
      title={translate('settings.updateSettings.settings')}
      hint={translate('settings.updateSettings.settingsHint')}
      collapsible
      {...settingAnchor('about', 'updates')}
    >
      <SettingsField
        title={translate('settings.updateSettings.hostSource')}
        hint={hostSettingItem('about', 'hostSource').description}
        {...settingAnchor('about', 'hostSource')}
      >
        <SettingsInputActions>
          <SettingsUrlInput
            aria-label={translate('settings.updateSettings.hostSource')}
            value={settings.updates.hostSource}
            onChange={(event) =>
              edit((next) => {
                next.updates.hostSource = event.target.value;
              })
            }
            placeholder={translate('settings.updateSettings.sourcePlaceholder')}
          />
          <SettingsButton
            icon
            className="settings-list-icon"
            title={translate('settings.updateSettings.resetSource')}
            aria-label={translate('settings.updateSettings.resetSource')}
            disabled={settings.updates.hostSource === createDefaultSettings().updates.hostSource}
            onClick={() =>
              edit((next) => {
                next.updates.hostSource = createDefaultSettings().updates.hostSource;
              })
            }
          >
            <Icon name="refresh" size={16} />
          </SettingsButton>
        </SettingsInputActions>
      </SettingsField>
      {(
        [
          'checkHostOnAboutOpen',
          'checkHostOnStartup',
          'checkAppletsOnStartup',
          'notifyOnStartup',
          'allowSameVersion',
        ] as const
      ).map((key) => (
        <SettingsField
          key={key}
          title={hostSettingItem('about', key).title}
          hint={
            key === 'checkHostOnAboutOpen' ? hostSettingItem('about', key).description : undefined
          }
          {...settingAnchor('about', key)}
        >
          <Toggle
            label={hostSettingItem('about', key).title}
            checked={settings.updates[key]}
            onChange={(checked) =>
              edit((next) => {
                next.updates[key] = checked;
              })
            }
          />
        </SettingsField>
      ))}
      <SettingsField
        title={hostSettingItem('about', 'startupDelaySeconds').title}
        hint={translate('settings.updateSettings.delayHint')}
        {...settingAnchor('about', 'startupDelaySeconds')}
      >
        <SettingsInput
          aria-label={translate('settings.updateSettings.delay')}
          type="number"
          min={0}
          max={3600}
          value={settings.updates.startupDelaySeconds}
          onChange={(event) =>
            edit((next) => {
              next.updates.startupDelaySeconds = numberInput(event.target.value);
            })
          }
        />
      </SettingsField>
    </SettingsSection>
  );
}

export function AppletUpdateSource({
  extension,
  settings,
  edit,
}: {
  extension: ExtensionSnapshot;
  settings: Settings;
  edit(next: Settings): void;
}) {
  const { t: translate } = useHostTranslation();
  const settingsControls = useSettingsControls();
  const source = settings.extensions[extension.id]?.updateSource;
  const defaultSource = extension.updateRepository ? `github:${extension.updateRepository}` : '';
  const change = (value: string | undefined) => {
    const next = structuredClone(settings);
    const entry = next.extensions[extension.id] ?? { enabled: extension.enabled, settings: {} };
    if (value === undefined) delete entry.updateSource;
    else entry.updateSource = value;
    next.extensions[extension.id] = entry;
    edit(next);
  };
  return (
    <SettingsField
      title={translate('settings.updateSettings.sources')}
      className="applet-update-source"
      description={[
        source === undefined
          ? translate('settings.updateSettings.default')
          : source === ''
            ? translate('settings.updateSettings.disabled')
            : translate('settings.updateSettings.custom'),
        defaultSource
          ? translate('settings.updateSettings.defaultSource', { defaultSource })
          : translate('settings.updateSettings.noDefaultSource'),
        translate('settings.updateSettings.disableHint'),
      ].join(' ')}
      {...settingAnchor(`applet:${extension.id}`, 'updateSource')}
    >
      <SettingsInputActions>
        <SettingsUrlInput
          aria-label={translate('settings.updateSettings.sourceLabel', {
            displayName: extension.displayName,
          })}
          value={source ?? defaultSource}
          placeholder={translate('settings.updateSettings.sourcePlaceholder')}
          onChange={(event) => change(event.target.value)}
        />
        <SettingsButton
          icon
          className="settings-list-icon"
          aria-label={translate('settings.updateSettings.reset')}
          title={translate('settings.updateSettings.reset')}
          disabled={source === undefined}
          onClick={() => change(undefined)}
        >
          <Icon name="refresh" size={16} />
        </SettingsButton>
      </SettingsInputActions>
    </SettingsField>
  );
}

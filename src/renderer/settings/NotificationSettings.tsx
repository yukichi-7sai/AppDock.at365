import { hostText } from '../../shared/i18n';
import { useHostTranslation } from '../HostTranslation';
import { useSettingsFeedback } from '../settings-ui/SettingsStatus';
import { useEffect, useState, useRef } from 'react';
import type { SettingsPageAuxiliary } from '../../shared/settings-page';
import type { TtsVoice } from '../../shared/tts';
import { resolveNotificationSpeech } from '../../shared/notification-types';
import type { FormEditor } from './SettingsForm';
import type {
  NotificationPreference,
  NotificationTypeEntry,
} from '../../shared/notification-types';
import {
  notificationTypeKey,
  notificationSettingKey,
  resolveNotificationPolicy,
} from '../../shared/notification-types';
import { settingAnchor } from '../settings-ui/setting-anchor';
import { SettingsMcpScope, SettingsMcpLock } from '../settings-ui/SettingsMcpAccess';
import { settingsItemId } from '../../shared/settings-catalog';
import { NotificationTypeDialog } from './NotificationTypeDialog';
import { SettingsHintIcon } from '../settings-ui/SettingsHintIcon';
import { SettingsListLayout, ListIcon } from '../settings-ui/SettingsListTable';
import { SettingsInput } from '../settings-ui/SettingsInput';
import { SettingsCombobox } from '../settings-ui/SettingsCombobox';
import { Toggle } from '../settings-ui/Toggle';
import {
  SettingsSection,
  SettingsField,
  SettingsContent,
  SettingsActions,
} from '../settings-ui/SettingsSections';
const targetTitles = {
  banner: hostText('settings.notificationSettings.banner'),
  desktop: hostText('settings.notificationSettings.desktop'),
  windows: hostText('settings.notificationSettings.windows'),
};
const reasonTitles: Record<string, string> = {
  'type-definition-changed': hostText('settings.notificationSettings.changed'),
};
export function NotificationSettings({
  editor,
  types,
  auxiliary,
  invoke,
  busy,
  select,
}: {
  editor: FormEditor;
  types: NotificationTypeEntry[];
  auxiliary?: SettingsPageAuxiliary['notificationSpeech'];
  invoke(name: string, args?: unknown[]): Promise<any>;
  busy: boolean;
  select(id: string): void;
}) {
  const { t: translate } = useHostTranslation();
  const settings = editor.value;
  const speech = settings.notificationPreferences?.speech ?? {};
  const effective = resolveNotificationSpeech(settings, auxiliary?.defaults);
  const voiceListRevision = useRef(auxiliary?.voiceListRevision);
  voiceListRevision.current = auxiliary?.voiceListRevision;
  const [voices, setVoices] = useState<TtsVoice[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [voiceOverride, setVoiceOverride] = useState(false);
  useEffect(() => {
    setVoices([]);
  }, [auxiliary?.voiceListRevision]);
  useEffect(() => {
    setVoiceOverride(false);
  }, [speech.voice]);
  const changeSpeech = (key: 'voice' | 'speed', value?: string | number) => {
    const next = { ...speech };
    if (value === undefined) delete next[key];
    else (next as any)[key] = value;
    editor.edit({
      ...settings,
      notificationPreferences: {
        ...settings.notificationPreferences,
        overrides: settings.notificationPreferences?.overrides ?? [],
        speech: next,
      },
    });
  };
  const run = async (name: string, args?: unknown[]) => {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      return await invoke(name, args);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };
  const previewActive = auxiliary?.jobs.some((j) =>
    ['queued', 'generating', 'waitingPlayback', 'playing'].includes(j.state),
  );
  const overrides = settings.notificationPreferences?.overrides ?? [];
  const [editing, setEditing] = useState<{
    type: NotificationTypeEntry;
    original: NotificationPreference | null;
  } | null>(null);
  const unknown = overrides.filter(
    (r) => !types.some((t) => notificationTypeKey(t) === notificationTypeKey(r)),
  );
  const previewJob = auxiliary?.jobs.at(-1);
  const previewState =
    previewJob &&
    {
      queued: translate('settings.notificationSettings.queued'),
      generating: translate('settings.notificationSettings.generating'),
      waitingPlayback: translate('settings.notificationSettings.waitingPlayback'),
      playing: translate('settings.notificationSettings.playing'),
      completed: translate('settings.notificationSettings.completed'),
      failed: translate('settings.notificationSettings.failed'),
      canceled: translate('settings.notificationSettings.canceled'),
    }[previewJob.state];
  useSettingsFeedback({ busy: pending, error });
  return (
    <div className="settings-sections notification-settings">
      <SettingsContent>
        <SettingsListLayout title={translate('settings.notificationSettings.list')} toolbar={null}>
          <thead>
            <tr>
              <th scope="col">{translate('settings.notificationSettings.name')}</th>
              <th scope="col">{translate('settings.notificationSettings.targets')}</th>
              <th scope="col">{translate('settings.notificationSettings.durationTitle')}</th>
              <th scope="col">{translate('settings.notificationSettings.speech')}</th>
              <th scope="col">MCP Events</th>
              <th scope="col" className="settings-list-actions-heading">
                {translate('settings.notificationSettings.editColumn')}
              </th>
            </tr>
          </thead>
          <tbody>
            {types.map((type) => {
              const policy = resolveNotificationPolicy(type, settings);
              const row = overrides.find(
                (item) => notificationTypeKey(item) === notificationTypeKey(type),
              );
              const duration =
                type.lifetimePolicy === 'condition'
                  ? translate('settings.notificationSettings.untilResolved')
                  : policy.durationSeconds === null
                    ? translate('settings.notificationSettings.untilClosed')
                    : translate('settings.notificationSettings.durationValue', {
                        durationSeconds: policy.durationSeconds,
                      });
              const owner =
                type.ownerKind === 'applet' && type.ownerId.startsWith('at365.')
                  ? type.ownerTitle
                      .replace(/^Applet\./, '')
                      .replace(/\.at365$/, '')
                      .trim() || type.ownerTitle
                  : type.ownerTitle;
              return (
                <tr
                  key={notificationTypeKey(type)}
                  {...settingAnchor('notifications', notificationSettingKey(type))}
                >
                  <td className="settings-list-wrap">
                    <span className="command-provider-badge" title={type.ownerTitle}>
                      {owner}
                    </span>
                    <div className="settings-list-title">
                      <strong>{type.title}</strong>
                      <SettingsHintIcon title={type.title} hint={type.description} />
                      <SettingsMcpLock
                        title={type.title}
                        itemId={settingsItemId('notifications', notificationSettingKey(type))}
                      />
                    </div>
                    {type.ownerKind === 'applet' &&
                      !['starting', 'running'].includes(type.ownerState) && (
                        <small>{translate('settings.notificationSettings.appletStopped')}</small>
                      )}
                    {policy.reason && <small>{reasonTitles[policy.reason] ?? policy.reason}</small>}
                  </td>
                  <td className="settings-list-wrap">
                    {policy.selectedTargets.length
                      ? policy.selectedTargets.map((target) => (
                          <div key={target}>
                            {targetTitles[target]}
                            {type.requiredTargets.includes(target) &&
                              `（${translate('settings.notificationSettings.requiredMark')}）`}
                          </div>
                        ))
                      : translate('settings.notificationSettings.center')}
                  </td>
                  <td className="settings-list-wrap">
                    {duration}
                    {type.lifetimePolicy !== 'userDuration' && (
                      <small>{translate('settings.notificationSettings.fixed')}</small>
                    )}
                  </td>
                  <td className="settings-list-wrap">
                    {row?.speak === true ? 'ON' : 'OFF'}
                    {row?.speak === true && (!auxiliary?.configured || !effective.voice) && (
                      <small>
                        {translate('settings.notificationSettings.speechSettingsRequirements')}
                      </small>
                    )}
                  </td>
                  <td>{row?.mcpEvents === true ? 'ON' : 'OFF'}</td>
                  <td className="settings-list-actions-cell">
                    <div className="settings-list-actions">
                      <button
                        type="button"
                        className="settings-list-icon"
                        disabled={busy}
                        aria-label={translate('settings.notificationSettings.edit', {
                          title: type.title,
                          owner: type.ownerTitle,
                        })}
                        onClick={() =>
                          setEditing({
                            type: structuredClone(type),
                            original: row ? structuredClone(row) : null,
                          })
                        }
                      >
                        <ListIcon kind="pencil" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </SettingsListLayout>
      </SettingsContent>
      {editing && (
        <SettingsMcpScope
          itemId={settingsItemId('notifications', notificationSettingKey(editing.type))}
        >
          <NotificationTypeDialog
            type={editing.type}
            original={editing.original}
            settings={settings}
            speechConfigured={!!auxiliary?.configured && !!effective.voice}
            invoke={invoke}
            onClose={() => setEditing(null)}
            select={select}
          />
        </SettingsMcpScope>
      )}
      {!!unknown.length && (
        <SettingsSection
          title={translate('settings.notificationSettings.unavailable')}
          description={translate('settings.notificationSettings.unavailableHint')}
          aria-label={translate('settings.notificationSettings.unavailableType')}
          collapsible
        >
          {unknown.map((row) => (
            <SettingsField key={notificationTypeKey(row)} title={row.ownerId + ' / ' + row.typeId}>
              <SettingsActions>
                <button
                  onClick={() =>
                    editor.edit({
                      ...settings,
                      notificationPreferences: {
                        ...settings.notificationPreferences,
                        overrides: overrides.filter(
                          (r) => notificationTypeKey(r) !== notificationTypeKey(row),
                        ),
                      },
                    })
                  }
                >
                  {translate('settings.notificationSettings.deleteType')}
                </button>
              </SettingsActions>
            </SettingsField>
          ))}
        </SettingsSection>
      )}
      <SettingsSection
        title={translate('settings.notificationSettings.speech')}
        data-testid="notification-speech"
        description={translate('settings.notificationSettings.currentVoiceAndSpeed', {
          value: effective.voice || translate('settings.notificationSettings.unset'),
          speed: effective.speed,
        })}
        collapsible
      >
        <SettingsField
          title={translate('settings.notificationSettings.ttsSettings')}
          description={translate('settings.notificationSettings.ttsHint')}
        >
          <SettingsActions>
            <button onClick={() => select('tts')}>
              {translate('settings.notificationSettings.openSettings')}
            </button>
          </SettingsActions>
        </SettingsField>
        <SettingsField
          title={translate('settings.notificationSettings.voice')}
          description={translate('settings.notificationSettings.currentVoice', {
            value: effective.voice || translate('settings.notificationSettings.unset'),
          })}
          hint={translate('settings.notificationSettings.voiceHint')}
          {...settingAnchor('notifications', 'speech.voice')}
        >
          <SettingsActions>
            <Toggle
              label={translate('settings.notificationSettings.inheritVoice')}
              checked={speech.voice === undefined && !voiceOverride}
              onChange={(inherit) => {
                setVoiceOverride(!inherit);
                if (inherit) changeSpeech('voice');
                else if (effective.voice) changeSpeech('voice', effective.voice);
              }}
            />
            <span>{translate('settings.notificationSettings.inherit')}</span>
          </SettingsActions>
          {(speech.voice !== undefined || voiceOverride) && (
            <>
              <SettingsCombobox
                label={translate('settings.notificationSettings.voiceId')}
                value={speech.voice ?? ''}
                onChange={(value) => changeSpeech('voice', value)}
                options={voices}
              />
              <SettingsActions>
                <button
                  disabled={busy || pending}
                  onClick={() => {
                    const revision = auxiliary?.voiceListRevision;
                    void run('notificationVoices').then((v) => {
                      if (v && revision === voiceListRevision.current) setVoices(v.voices);
                    });
                  }}
                >
                  {translate('settings.notificationSettings.refreshVoices')}
                </button>
              </SettingsActions>
            </>
          )}
        </SettingsField>
        <SettingsField
          title={translate('settings.notificationSettings.speed')}
          description={translate('settings.notificationSettings.currentSpeed', {
            speed: effective.speed,
          })}
          hint={translate('settings.notificationSettings.speedHint')}
          {...settingAnchor('notifications', 'speech.speed')}
        >
          <SettingsActions>
            <Toggle
              label={translate('settings.notificationSettings.inheritSpeed')}
              checked={speech.speed === undefined}
              onChange={(inherit) => changeSpeech('speed', inherit ? undefined : effective.speed)}
            />
            <span>{translate('settings.notificationSettings.inherit')}</span>
          </SettingsActions>
          {speech.speed !== undefined && (
            <SettingsInput
              type="number"
              min={0.25}
              max={4}
              step={0.05}
              aria-label={translate('settings.notificationSettings.speechSpeed')}
              value={speech.speed}
              onChange={(e) =>
                changeSpeech('speed', e.target.value.trim() ? Number(e.target.value) : NaN)
              }
            />
          )}
        </SettingsField>
        <SettingsField
          title={translate('settings.notificationSettings.preview')}
          description={
            !auxiliary?.configured || !effective.voice
              ? translate('settings.notificationSettings.previewRequirements')
              : (previewState ?? translate('settings.notificationSettings.previewHint'))
          }
          error={previewJob?.error?.message}
        >
          <SettingsActions {...settingAnchor('notifications', 'speech.preview')}>
            <button
              className="primary"
              disabled={
                busy || pending || previewActive || !auxiliary?.configured || !effective.voice
              }
              onClick={() => void run('notificationPreview', [crypto.randomUUID()])}
            >
              {translate('settings.notificationSettings.previewAction')}
            </button>
            <button
              disabled={pending || !previewActive}
              onClick={() => void run('notificationPreviewStop')}
            >
              {translate('settings.notificationSettings.stopPreview')}
            </button>
          </SettingsActions>
        </SettingsField>
      </SettingsSection>
      <SettingsSection
        title={translate('settings.notificationSettings.delivery')}
        data-testid="notification-delivery"
        hint={translate('settings.notificationSettings.deliveryHint')}
        collapsible
      >
        <SettingsField
          title={translate('settings.notificationSettings.center')}
          description={translate('settings.notificationSettings.centerHint')}
        />
        <SettingsField
          title={translate('settings.notificationSettings.banner')}
          description={translate('settings.notificationSettings.bannerHint')}
        />
        <SettingsField
          title={translate('settings.notificationSettings.desktop')}
          description={translate('settings.notificationSettings.desktopHint')}
        />
        <SettingsField
          title={translate('settings.notificationSettings.windows')}
          description={translate('settings.notificationSettings.windowsDurationHint')}
        />
        <SettingsField
          title={translate('settings.notificationSettings.speech')}
          description={translate('settings.notificationSettings.speechRequirements')}
        />
        <SettingsField
          title={translate('settings.notificationSettings.mcpSettings')}
          description={translate('settings.notificationSettings.mcpHint')}
        >
          <SettingsActions>
            <button onClick={() => select('codex')}>
              {translate('settings.notificationSettings.openSettings')}
            </button>
          </SettingsActions>
        </SettingsField>
        <SettingsField
          title={translate('settings.notificationSettings.changes')}
          description={translate('settings.notificationSettings.changesHint')}
        />
      </SettingsSection>
    </div>
  );
}

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
import { SettingsInput } from '../settings-ui/SettingsInput';
import { SettingsCombobox } from '../settings-ui/SettingsCombobox';
import { Toggle } from '../settings-ui/Toggle';
import {
  SettingsSection,
  SettingsField,
  SettingsChoice,
  SettingsActions,
} from '../settings-ui/SettingsSections';
const targetTitles = {
  banner: hostText('settings.notificationSettings.banner'),
  desktop: hostText('settings.notificationSettings.desktop'),
  windows: hostText('settings.notificationSettings.windows'),
};
const ownerGroup = (type: NotificationTypeEntry) =>
  type.ownerKind === 'host' ? 'host' : JSON.stringify([type.ownerKind, type.ownerId]);
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
  const change = (type: NotificationTypeEntry, patch: Partial<NotificationPreference>) => {
    const key = notificationTypeKey(type),
      current = overrides.find((r) => notificationTypeKey(r) === key);
    const next = overrides.filter((r) => notificationTypeKey(r) !== key);
    const updated: NotificationPreference = {
      ownerKind: type.ownerKind,
      ownerId: type.ownerId,
      typeId: type.typeId,
      ...current,
      ...patch,
    };
    // Keep edits valid when an older saved preference lacks newly required controls.
    if (updated.targets && type.requiredTargets.length)
      updated.targets = [...new Set([...updated.targets, ...type.requiredTargets])];
    next.push(updated);
    editor.edit({
      ...settings,
      notificationPreferences: { ...settings.notificationPreferences, overrides: next },
    });
  };
  const owners = [...new Set(types.map(ownerGroup))];
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
      {owners.map((owner) => {
        const rows = types.filter((t) => ownerGroup(t) === owner);
        return (
          <SettingsSection
            key={owner}
            variant="card"
            title={rows[0].ownerTitle}
            aria-label={translate('settings.notificationSettings.ownerLabel', {
              owner: rows[0].ownerTitle,
            })}
          >
            {rows.map((type) => {
              const policy = resolveNotificationPolicy(type, settings);
              const row = overrides.find(
                (r) => notificationTypeKey(r) === notificationTypeKey(type),
              );
              const speaking = row?.speak === true;
              const eventSending = row?.mcpEvents === true;
              const delivery = policy.selectedTargets.map((target) => targetTitles[target]);
              const deliverySummary = delivery.length
                ? delivery.join('・')
                : eventSending
                  ? speaking
                    ? translate('settings.notificationSettings.speechAndEvents')
                    : translate('settings.notificationSettings.eventsOnly')
                  : speaking
                    ? translate('settings.notificationSettings.speechOnly')
                    : translate('settings.notificationSettings.centerOnly');
              const duration =
                type.lifetimePolicy === 'condition'
                  ? translate('settings.notificationSettings.untilResolved')
                  : policy.durationSeconds === null
                    ? translate('settings.notificationSettings.untilClosed')
                    : translate('settings.notificationSettings.duration', {
                        durationSeconds: policy.durationSeconds,
                      });
              const summary = [
                deliverySummary,
                duration,
                translate('settings.notificationSettings.speechState', {
                  value: speaking ? 'ON' : 'OFF',
                }),
                `MCP Events: ${eventSending ? 'ON' : 'OFF'}`,
              ].join(' ／ ');
              return (
                <SettingsSection
                  variant="row"
                  title={type.title}
                  hint={type.description}
                  description={[
                    summary,
                    type.ownerKind === 'applet' &&
                    !['starting', 'running'].includes(type.ownerState)
                      ? translate('settings.notificationSettings.appletStopped')
                      : '',
                    policy.reason ? (reasonTitles[policy.reason] ?? policy.reason) : '',
                  ]
                    .filter(Boolean)
                    .join(' ／ ')}
                  collapsible
                  className="notification-setting-card"
                  key={notificationTypeKey(type)}
                  {...settingAnchor('notifications', notificationSettingKey(type))}
                >
                  <SettingsField
                    title={translate('settings.notificationSettings.targets')}
                    className="settings-field-wide"
                  >
                    <div className="settings-choice-grid">
                      {type.allowedTargets.map((target) => (
                        <SettingsChoice
                          key={target}
                          label={targetTitles[target]}
                          ariaLabel={translate('settings.notificationSettings.targetLabel', {
                            title: type.title,
                            target: targetTitles[target],
                          })}
                          checked={policy.selectedTargets.includes(target)}
                          disabled={type.requiredTargets.includes(target)}
                          description={
                            type.requiredTargets.includes(target)
                              ? translate('settings.notificationSettings.required')
                              : undefined
                          }
                          onChange={(on) =>
                            change(type, {
                              targets: on
                                ? [...policy.selectedTargets, target]
                                : policy.selectedTargets.filter((t) => t !== target),
                            })
                          }
                        />
                      ))}
                      <SettingsChoice
                        label={translate('settings.notificationSettings.speech')}
                        description={translate('settings.notificationSettings.speechDescription')}
                        ariaLabel={translate('settings.notificationSettings.speechLabel', {
                          title: type.title,
                        })}
                        checked={speaking}
                        onChange={(speak) => change(type, { speak })}
                      />
                      <SettingsChoice
                        label="MCP Events"
                        description={translate('settings.notificationSettings.eventDescription')}
                        ariaLabel={translate('settings.notificationSettings.eventLabel', {
                          title: type.title,
                        })}
                        checked={eventSending}
                        onChange={(mcpEvents) => change(type, { mcpEvents })}
                      />
                    </div>
                    <SettingsChoice
                      label={translate('settings.notificationSettings.centerOnly')}
                      ariaLabel={translate('settings.notificationSettings.centerLabel', {
                        title: type.title,
                      })}
                      checked={!policy.selectedTargets.length && !speaking && !eventSending}
                      disabled={!!type.requiredTargets.length}
                      onChange={(on) => {
                        if (on) change(type, { targets: [], speak: false, mcpEvents: false });
                      }}
                    />
                  </SettingsField>
                  {speaking && (!auxiliary?.configured || !effective.voice) && (
                    <SettingsField
                      title={translate('settings.notificationSettings.speechSettings')}
                      description={translate(
                        'settings.notificationSettings.speechSettingsRequirements',
                      )}
                    >
                      <button onClick={() => select('tts')}>
                        {translate('settings.notificationSettings.openSpeech')}
                      </button>
                    </SettingsField>
                  )}
                  {type.lifetimePolicy === 'userDuration' ? (
                    <SettingsField
                      title={translate('settings.notificationSettings.durationSeconds')}
                      hint={translate('settings.notificationSettings.durationHint')}
                    >
                      <SettingsInput
                        type="text"
                        inputMode="numeric"
                        aria-label={translate('settings.notificationSettings.durationLabel', {
                          title: type.title,
                        })}
                        placeholder={translate('settings.notificationSettings.untilClosed')}
                        value={
                          row?.durationSeconds === undefined
                            ? (type.defaultDurationSeconds ?? '')
                            : (row.durationSeconds ?? '')
                        }
                        onChange={(e) => {
                          const value = e.target.value;
                          change(type, {
                            durationSeconds: (value === ''
                              ? null
                              : /^\d+$/.test(value)
                                ? Number(value)
                                : value) as number | null,
                          });
                        }}
                      />
                    </SettingsField>
                  ) : (
                    <SettingsField
                      title={translate('settings.notificationSettings.durationTitle')}
                      description={
                        type.lifetimePolicy === 'condition'
                          ? translate('settings.notificationSettings.unresolvedHint')
                          : translate('settings.notificationSettings.closedHint')
                      }
                    />
                  )}
                </SettingsSection>
              );
            })}
          </SettingsSection>
        );
      })}
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

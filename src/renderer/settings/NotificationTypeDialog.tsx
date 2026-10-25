import { useState } from 'react';
import { useHostTranslation } from '../HostTranslation';
import type { Settings } from '../../shared/contracts';
import type {
  NotificationPreference,
  NotificationTypeEntry,
} from '../../shared/notification-types';
import { resolveNotificationPolicy } from '../../shared/notification-types';
import { SettingsDialog } from '../settings-ui/SettingsModal';
import { SettingsField, SettingsChoice } from '../settings-ui/SettingsSections';
import { SettingsInput } from '../settings-ui/SettingsInput';

/** A notification's related delivery choices are committed together. */
export function NotificationTypeDialog({
  type,
  original,
  settings,
  speechConfigured,
  invoke,
  onClose,
  select,
}: {
  type: NotificationTypeEntry;
  original: NotificationPreference | null;
  settings: Settings;
  speechConfigured: boolean;
  invoke(name: string, args?: unknown[]): Promise<unknown>;
  onClose(): void;
  select(id: string): void;
}) {
  const { t: translate } = useHostTranslation();
  const targetTitles = {
    banner: translate('settings.notificationSettings.banner'),
    desktop: translate('settings.notificationSettings.desktop'),
    windows: translate('settings.notificationSettings.windows'),
  };
  const [row, setRow] = useState<NotificationPreference>(() =>
    structuredClone(
      original ?? {
        ownerKind: type.ownerKind,
        ownerId: type.ownerId,
        typeId: type.typeId,
      },
    ),
  );
  const change = (patch: Partial<NotificationPreference>) =>
    setRow((current) => {
      const next = { ...current, ...patch };
      if (next.targets) next.targets = [...new Set([...next.targets, ...type.requiredTargets])];
      return next;
    });
  const policy = resolveNotificationPolicy(type, {
    ...settings,
    notificationPreferences: {
      ...settings.notificationPreferences,
      overrides: [row],
    },
  });
  const speaking = row.speak === true;
  const eventSending = row.mcpEvents === true;
  return (
    <SettingsDialog
      title={type.title}
      description={type.ownerTitle}
      hint={type.description}
      onClose={onClose}
      onApply={() => invoke('notificationSavePreference', [type, original, row])}
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
                change({
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
            onChange={(speak) => change({ speak })}
          />
          <SettingsChoice
            label="MCP Events"
            description={translate('settings.notificationSettings.eventDescription')}
            ariaLabel={translate('settings.notificationSettings.eventLabel', {
              title: type.title,
            })}
            checked={eventSending}
            onChange={(mcpEvents) => change({ mcpEvents })}
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
            if (on) change({ targets: [], speak: false, mcpEvents: false });
          }}
        />
      </SettingsField>
      {speaking && !speechConfigured && (
        <SettingsField
          title={translate('settings.notificationSettings.speechSettings')}
          description={translate('settings.notificationSettings.speechSettingsRequirements')}
        >
          <button
            onClick={() => {
              onClose();
              select('tts');
            }}
          >
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
              change({
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
    </SettingsDialog>
  );
}

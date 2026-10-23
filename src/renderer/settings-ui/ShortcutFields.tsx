import { useHostTranslation } from '../HostTranslation';
import { useSettingsFeedback } from './SettingsStatus';
import { SettingsInput } from './SettingsInput';
import { useSettingsControls } from './api';
import { useState } from 'react';
import { shortcutFromEvent } from '../../shared/commands';
import { shortcutScopes, type Keybinding, type ShortcutScope } from '../../shared/keybindings';
import { shortcutTargetTitle } from '../../shared/shortcut-pages';

export type ShortcutCondition = Keybinding['when'] | { scope: 'default'; appletIds: string[] };

export function ShortcutKeyField({
  value,
  label,
  onChange,
  onError,
  finishOnChange = false,
}: {
  value: string;
  label: string;
  onChange(key: string): void;
  onError(error: unknown): void;
  finishOnChange?: boolean;
}) {
  const { t: translate } = useHostTranslation();
  const settingsControls = useSettingsControls();
  const [recording, setRecording] = useState(false);
  return (
    <div className="shortcut-key-field">
      <SettingsInput
        readOnly
        data-shortcut-recorder="true"
        aria-label={label}
        value={value}
        placeholder={
          recording
            ? translate('settings.shortcutFields.recording')
            : translate('settings.shortcutFields.enter')
        }
        onFocus={() => {
          setRecording(true);
          void settingsControls.setShortcutRecording(true).catch(onError);
        }}
        onBlur={() => {
          setRecording(false);
          void settingsControls.setShortcutRecording(false).catch(onError);
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Tab' && !event.ctrlKey && !event.altKey) return;
          event.preventDefault();
          if (event.key === 'Escape') {
            event.currentTarget.blur();
            return;
          }
          const key = shortcutFromEvent(event.nativeEvent);
          if (key) {
            if (finishOnChange) event.currentTarget.blur();
            onChange(key);
          }
        }}
      />
      <select
        aria-label={translate('settings.shortcutFields.special', { label: label })}
        value=""
        onChange={(event) => {
          if (event.target.value) onChange(event.target.value);
        }}
      >
        <option value="">{translate('settings.shortcutFields.specialSelect')}</option>
        {['Tab', 'Ctrl+Tab', 'Ctrl+Shift+Tab', 'Escape', 'Enter', 'Space', 'Pause'].map((key) => (
          <option key={key}>{key}</option>
        ))}
      </select>
    </div>
  );
}

export function ShortcutConditionField({
  value,
  label,
  ownerTitle,
  applets,
  allowDefault = false,
  extraScopes = [],
  selectedScope,
  onExtraScope,
  onChange,
}: {
  value: ShortcutCondition;
  label: string;
  ownerTitle?: string;
  applets: { id: string; title: string }[];
  allowDefault?: boolean;
  extraScopes?: { id: string; title: string; after?: ShortcutScope }[];
  selectedScope?: string;
  onExtraScope?(scope: string): void;
  onChange(value: ShortcutCondition): void;
}) {
  const { t: translate } = useHostTranslation();
  const settingsControls = useSettingsControls();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const choices = [
    ...applets,
    ...value.appletIds
      .filter((id) => !applets.some((applet) => applet.id === id))
      .map((id) => ({ id, title: shortcutTargetTitle(id, applets) })),
  ];
  useSettingsFeedback({
    error: [
      value.scope === 'applets' && !value.appletIds.length
        ? translate('settings.shortcutFields.required')
        : '',
    ]
      .filter(Boolean)
      .join('\n'),
  });
  return (
    <div className="shortcut-condition-field">
      <select
        aria-label={label}
        value={selectedScope ?? value.scope}
        onChange={(event) => {
          if (extraScopes.some((scope) => scope.id === event.target.value)) {
            onExtraScope?.(event.target.value);
            setOpen(false);
            return;
          }
          const scope = event.target.value as ShortcutScope | 'default';
          onChange({ scope, appletIds: scope === 'applets' ? value.appletIds : [] });
          setOpen(scope === 'applets');
          setFilter('');
        }}
      >
        {allowDefault && (
          <option value="default">{translate('settings.shortcutFields.default')}</option>
        )}
        {extraScopes
          .filter((scope) => !scope.after)
          .map((scope) => (
            <option key={scope.id} value={scope.id}>
              {scope.title}
            </option>
          ))}
        {shortcutScopes
          .filter((scope) => scope.id !== 'owner' || ownerTitle || value.scope === 'owner')
          .flatMap((scope) => [scope, ...extraScopes.filter((extra) => extra.after === scope.id)])
          .map((scope) => (
            <option key={scope.id} value={scope.id} disabled={scope.id === 'owner' && !ownerTitle}>
              {scope.id === 'owner'
                ? (ownerTitle ?? translate('settings.shortcutFields.unknownOwner'))
                : scope.title}
            </option>
          ))}
      </select>
      {value.scope === 'applets' && (
        <>
          <button
            className="keybinding-targets"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {value.appletIds.length
              ? value.appletIds
                  .map((id) => choices.find((a) => a.id === id)?.title ?? id)
                  .join(' / ')
              : translate('settings.shortcutFields.selectPages')}
          </button>
          {open && (
            <div
              className="keybinding-picker"
              role="group"
              aria-label={translate('settings.shortcutFields.targetPages', { label: label })}
            >
              <SettingsInput
                aria-label={translate('settings.shortcutFields.searchPages')}
                placeholder={translate('settings.shortcutFields.searchPlaceholder')}
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              />
              {choices
                .filter((a) => `${a.title} ${a.id}`.toLowerCase().includes(filter.toLowerCase()))
                .map((a) => (
                  <label key={a.id}>
                    <SettingsInput
                      type="checkbox"
                      checked={value.appletIds.includes(a.id)}
                      onChange={(event) =>
                        onChange({
                          scope: 'applets',
                          appletIds: event.target.checked
                            ? [...value.appletIds, a.id]
                            : value.appletIds.filter((id) => id !== a.id),
                        })
                      }
                    />
                    {a.title}
                  </label>
                ))}
              {!choices.length && <small>{translate('settings.shortcutFields.noPages')}</small>}
              <button onClick={() => setOpen(false)}>
                {translate('settings.shortcutFields.close')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

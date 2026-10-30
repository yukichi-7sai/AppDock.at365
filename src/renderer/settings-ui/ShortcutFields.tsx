import { useHostTranslation } from '../HostTranslation';
import { useSettingsFeedback } from './SettingsStatus';
import { SettingsInput } from './SettingsInput';
import { useSettingsControls } from './api';
import { useState, type ReactNode } from 'react';
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
  presentation = 'select',
  afterScope,
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
  presentation?: 'select' | 'buttons';
  afterScope?: ReactNode;
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
  const scopes = [
    ...(allowDefault
      ? [{ id: 'default', title: translate('settings.shortcutFields.default') }]
      : []),
    ...extraScopes.filter((scope) => !scope.after),
    ...shortcutScopes
      .filter((scope) => scope.id !== 'owner' || ownerTitle || value.scope === 'owner')
      .flatMap((scope) => [scope, ...extraScopes.filter((extra) => extra.after === scope.id)]),
  ];
  const changeScope = (id: string) => {
    if (extraScopes.some((scope) => scope.id === id)) {
      onExtraScope?.(id);
      setOpen(false);
    } else {
      const scope = id as ShortcutScope | 'default';
      onChange({ scope, appletIds: scope === 'applets' ? value.appletIds : [] });
      setOpen(scope === 'applets');
    }
    setFilter('');
  };
  const scopeTitle = (scope: { id: string; title: string }) =>
    scope.id === 'owner'
      ? (ownerTitle ?? translate('settings.shortcutFields.unknownOwner'))
      : scope.title;
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
      {presentation === 'buttons' ? (
        <div className="binding-scope-picker" role="group" aria-label={label}>
          {scopes.map((scope) => (
            <button
              key={scope.id}
              type="button"
              data-testid={`binding-scope:${scope.id}`}
              aria-pressed={(selectedScope ?? value.scope) === scope.id}
              disabled={scope.id === 'owner' && !ownerTitle}
              onClick={() => changeScope(scope.id)}
            >
              {scopeTitle(scope)}
            </button>
          ))}
        </div>
      ) : (
        <select
          aria-label={label}
          value={selectedScope ?? value.scope}
          onChange={(event) => changeScope(event.target.value)}
        >
          {scopes.map((scope) => (
            <option key={scope.id} value={scope.id} disabled={scope.id === 'owner' && !ownerTitle}>
              {scopeTitle(scope)}
            </option>
          ))}
        </select>
      )}
      {afterScope}
      {value.scope === 'applets' && (
        <>
          {presentation === 'select' && (
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
          )}
          {(open || presentation === 'buttons') && (
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
                      data-testid={`binding-page:${a.id}`}
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
              {presentation === 'select' && (
                <button onClick={() => setOpen(false)}>
                  {translate('settings.shortcutFields.close')}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

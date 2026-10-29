import { useHostTranslation } from '../HostTranslation';
import { CommandText } from './CommandText';
import { Fragment, useRef, useState, type ReactNode } from 'react';
import { defaultAppletEnabled } from '../../shared/applet-state';
import { appletCommonDefinitions } from '../../shared/applet-common-settings';
import { Toggle } from './Toggle';
import type {
  ExtensionSnapshot,
  Settings,
  SettingDefinition,
  SettingAction,
} from '../../shared/contracts';
import {
  appletSettingsPageId,
  appletCommonDescriptions,
  settingsItemId,
} from '../../shared/settings-catalog';
import { resolveSettingSections } from '../../shared/setting-sections';
import { settingAnchor } from './setting-anchor';
import { SettingsInput, SettingsUrlInput, SettingsTextarea, numberInput } from './SettingsInput';
import {
  SettingsSection,
  SettingsField,
  SettingsActions,
  SettingsInputActions,
} from './SettingsSections';
import { SettingsMcpLock } from './SettingsMcpAccess';
import { SettingsButton } from './SettingsButton';
import { useSettingsFeedback } from './SettingsStatus';
import { ShortcutListSetting } from './ShortcutListSetting';
import { ObjectListSetting } from './ObjectListSetting';
import { ObjectListDialogSetting } from './ObjectListDialogSetting';
import { useSettingsControls } from './api';
import { RegisteredImageInput } from './RegisteredImagePicker';
import { AppletStartupTimingPanel } from './AppletStartupTimingPanel';

/** Shared manifest-driven body for the settings index and Applet detail tab. */
export function AppletSettingsForm({
  applet,
  settings,
  onChange,
  onListCommit,
  onListOpen,
  onListDraftAction,
  onListDraftImage,
  accounts = [],
  commonFields,
}: {
  applet: ExtensionSnapshot;
  settings: Settings;
  onChange(value: Settings): void;
  onListOpen?(key: string, id: unknown): Promise<unknown>;
  onListDraftAction?(
    key: string,
    input: string,
  ): Promise<import('../../shared/setting-list-draft').SettingListDraftResult>;
  onListDraftImage?(
    key: string,
    base64: string,
  ): Promise<import('../../shared/registered-images').RegisteredImageRef>;
  onListCommit?(
    key: string,
    value: Record<string, unknown>[],
    before: Record<string, unknown>[],
  ): Promise<unknown>;
  accounts?: { id: string; name: string }[];
  commonFields?: ReactNode;
}) {
  const { t: translate } = useHostTranslation();
  const settingsControls = useSettingsControls();
  const pageId = appletSettingsPageId(applet.id);
  const executing = useRef(false);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [result, setResult] = useState<{ command: string; message: string; error: boolean } | null>(
    null,
  );
  const current = settings.extensions[applet.id] ?? { enabled: defaultAppletEnabled, settings: {} };
  const update = (next: typeof current) =>
    onChange({ ...settings, extensions: { ...settings.extensions, [applet.id]: next } });
  const sections = resolveSettingSections(
    applet.settings ?? [],
    applet.settingActions ?? [],
    applet.settingSections,
  );
  const executeAction = async (item: SettingAction) => {
    if (executing.current) return;
    executing.current = true;
    setRunningAction(item.command);
    setResult(null);
    try {
      await settingsControls.executeCommand(item.command);
      setResult({
        command: item.command,
        message: item.successMessage ?? translate('settings.appletSettingsForm.completed'),
        error: false,
      });
    } catch (error) {
      setResult({ command: item.command, message: String(error), error: true });
    } finally {
      executing.current = false;
      setRunningAction(null);
    }
  };
  useSettingsFeedback({
    message: result && !result.error ? result.message : undefined,
    busy: runningAction !== null,
  });
  const actionAvailable = (item: SettingAction) =>
    applet.enabled &&
    applet.state === 'running' &&
    applet.commands.some((c) => c.id === item.command && c.available);
  const actionDescription = (item: SettingAction) => (
    <span id={`setting-action-help-${item.command}`}>
      {item.description && <CommandText text={item.description} />}
      {!actionAvailable(item) && ` ${translate('settings.appletSettingsForm.startRequired')}`}
    </span>
  );
  const actionButton = (item: SettingAction) => (
    <SettingsButton
      type="button"
      className="secondary"
      aria-describedby={`setting-action-help-${item.command}`}
      disabled={!actionAvailable(item) || runningAction !== null}
      pending={runningAction === item.command}
      onClick={() => void executeAction(item)}
    >
      {item.title}
    </SettingsButton>
  );
  const action = (item: SettingAction) => {
    return (
      <SettingsField
        key={item.command}
        title={item.title}
        description={actionDescription(item)}
        error={result?.command === item.command && result.error ? result.message : undefined}
        {...settingAnchor(pageId, `action:${item.command}`)}
      >
        <SettingsActions>{actionButton(item)}</SettingsActions>
      </SettingsField>
    );
  };
  const field = (item: SettingDefinition) => {
    const stored = current.settings[item.key];
    const value =
      item.type === 'registered-image' && stored === null ? null : (stored ?? item.default);
    const set = (next: unknown) =>
      update({ ...current, settings: { ...current.settings, [item.key]: next } });
    const options = applet.settingOptions[item.key] ?? item.options ?? [];
    const help = `setting-help-${applet.id}-${item.key}`;
    const wide = ['object-list', 'shortcut-list', 'json'].includes(item.type);
    const attached = (applet.settingActions ?? []).filter(
      (action) => action.settingKey === item.key,
    );
    const control =
      item.type === 'object-list' && item.list && onListCommit ? (
        <ObjectListDialogSetting
          testId={`setting:${settingsItemId(pageId, `setting:${item.key}`)}`}
          definition={item}
          value={value}
          onOpen={
            applet.pageCollections?.some((c) => c.key === item.key) && onListOpen
              ? (entry) => onListOpen(item.key, entry.id)
              : undefined
          }
          options={Object.fromEntries(
            (item.fields ?? [])
              .filter((field) => field.optionSource === 'web-profiles')
              .map((field) => [
                field.key,
                accounts.map((account) => ({ value: account.id, label: account.name })),
              ]),
          )}
          onCommit={(next, before) => onListCommit(item.key, next, before)}
          onDraftAction={
            item.list.draftAction && onListDraftAction
              ? (input) => onListDraftAction(item.key, input)
              : undefined
          }
          onDraftImage={
            item.list.draftAction && onListDraftImage
              ? (base64) => onListDraftImage(item.key, base64)
              : undefined
          }
        />
      ) : item.type === 'object-list' ? (
        <ObjectListSetting definition={item} value={value} onChange={set} />
      ) : item.type === 'shortcut-list' ? (
        <ShortcutListSetting title={item.title} value={value} onChange={set} />
      ) : item.type === 'registered-image' ? (
        <RegisteredImageInput value={value} onChange={set} label={item.title} />
      ) : item.type === 'json' ? (
        <SettingsTextarea
          aria-label={item.title}
          aria-describedby={item.description ? help : undefined}
          rows={10}
          value={String(value ?? '')}
          onChange={(e) => set(e.target.value)}
        />
      ) : item.type === 'string' && item.format === 'url' ? (
        <SettingsUrlInput
          aria-label={item.title}
          aria-describedby={item.description ? help : undefined}
          value={String(value ?? '')}
          onChange={(e) => set(e.target.value)}
        />
      ) : item.type === 'boolean' ? (
        <button
          type="button"
          className="toggle"
          role="switch"
          aria-label={item.title}
          aria-describedby={item.description ? help : undefined}
          aria-checked={Boolean(value)}
          onClick={() => set(!value)}
        >
          <span />
        </button>
      ) : item.type === 'select' ? (
        <select
          aria-label={item.title}
          aria-describedby={item.description ? help : undefined}
          value={String(value ?? '')}
          onChange={(e) => set(e.target.value)}
        >
          {!options.some((o) => o.value === value) && value !== undefined && (
            <option value={String(value)}>
              {translate('settings.appletSettingsForm.savedUnavailable')}
              {String(value)}
            </option>
          )}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <SettingsInput
          aria-label={item.title}
          aria-describedby={item.description ? help : undefined}
          type={item.type === 'number' ? 'number' : 'text'}
          min={item.minimum}
          maxLength={item.maxLength}
          max={item.maximum}
          step={item.step ?? 'any'}
          value={String(value ?? '')}
          onChange={(e) =>
            set(
              item.type === 'number'
                ? e.target.value === ''
                  ? ''
                  : numberInput(e.target.value)
                : e.target.value,
            )
          }
        />
      );
    return (
      <SettingsField
        key={item.key}
        title={item.title}
        description={
          (item.description || attached.length > 0) && (
            <>
              {item.description && (
                <span id={help}>
                  <CommandText text={item.description} />
                </span>
              )}
              {attached.map((action, index) => (
                <Fragment key={action.command}>
                  {(item.description || index > 0) && <br />}
                  {actionDescription(action)}
                </Fragment>
              ))}
            </>
          )
        }
        error={
          result?.error && attached.some((a) => a.command === result.command)
            ? result.message
            : undefined
        }
        className={wide ? 'settings-field-wide' : ''}
        {...settingAnchor(pageId, `setting:${item.key}`)}
      >
        {attached.length ? (
          <SettingsInputActions wrap>
            <div>{control}</div>
            {attached.map((action) => (
              <SettingsActions
                key={action.command}
                {...settingAnchor(pageId, `action:${action.command}`)}
              >
                {actionButton(action)}
                <SettingsMcpLock
                  title={action.title}
                  itemId={settingsItemId(pageId, `action:${action.command}`)}
                />
              </SettingsActions>
            ))}
          </SettingsInputActions>
        ) : (
          control
        )}
      </SettingsField>
    );
  };
  return (
    <div className="applet-settings settings-sections">
      {sections.map((section) => (
        <SettingsSection
          key={section.id}
          title={section.title}
          description={section.description && <CommandText text={section.description} />}
          collapsible={section.collapsible}
        >
          {section.settings.map(field)}
          {section.actions.map(action)}
        </SettingsSection>
      ))}
      {!sections.length && (
        <SettingsSection title={translate('settings.appletSettingsForm.settings')}>
          <p>{translate('settings.appletSettingsForm.noSettings')}</p>
        </SettingsSection>
      )}
      {!applet.collection && !!applet.pages?.length && (
        <SettingsSection
          title={translate('settings.appletSettingsForm.display')}
          hint={translate('settings.appletSettingsForm.displayHint')}
        >
          {applet.pages.map((page) => (
            <SettingsField
              key={page.id}
              title={translate('settings.appletSettingsForm.displayLabel', { title: page.title })}
              hint={appletCommonDescriptions.display}
              {...settingAnchor(pageId, `page:${page.id}`)}
            >
              <select
                data-testid={'applet-page-display-' + applet.id + ':' + page.id}
                aria-label={translate('settings.appletSettingsForm.displayLabel', {
                  title: page.title,
                })}
                value={current.pages?.[page.id]?.display ?? page.defaultDisplay ?? 'page'}
                onChange={(e) =>
                  update({
                    ...current,
                    pages: {
                      ...current.pages,
                      [page.id]: { display: e.target.value as 'page' | 'window' },
                    },
                  })
                }
              >
                <option value="page">{translate('settings.appletSettingsForm.hostPage')}</option>
                <option value="window">{translate('settings.appletSettingsForm.window')}</option>
              </select>
            </SettingsField>
          ))}
        </SettingsSection>
      )}
      {!applet.collection && (
        <SettingsSection
          title={translate('settings.appletSettingsForm.common')}
          key={`common:${applet.id}`}
          collapsible
          data-testid="applet-common-settings"
        >
          {appletCommonDefinitions(applet)
            .filter((field) => !field.secret)
            .map((field) => {
              const value =
                (current as unknown as Record<string, unknown>)[field.key] ?? field.default;
              const set = (next: unknown) => update({ ...current, [field.key]: next });
              const testId = 'applet-common-' + applet.id + ':' + field.key;
              return (
                <SettingsField
                  key={field.key}
                  title={field.title}
                  hint={field.description}
                  {...settingAnchor(pageId, field.key)}
                >
                  {field.type === 'boolean' ? (
                    <Toggle label={field.title} checked={Boolean(value)} onChange={set} />
                  ) : field.type === 'select' ? (
                    <select
                      data-testid={testId}
                      aria-label={field.title}
                      value={String(value ?? '')}
                      onChange={(event) => set(event.target.value)}
                    >
                      {(field.options ?? []).map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <SettingsInput
                      data-testid={testId}
                      aria-label={field.title}
                      type={field.type === 'number' ? 'number' : 'text'}
                      min={field.minimum}
                      max={field.maximum}
                      step={field.step}
                      minLength={field.minLength}
                      maxLength={field.maxLength}
                      value={(value as string | number) ?? ''}
                      onChange={(event) =>
                        set(
                          field.type === 'number' && event.target.value !== ''
                            ? numberInput(event.target.value)
                            : event.target.value,
                        )
                      }
                    />
                  )}
                </SettingsField>
              );
            })}
          {commonFields}
        </SettingsSection>
      )}
      {!applet.collection && <AppletStartupTimingPanel applet={applet} />}
    </div>
  );
}

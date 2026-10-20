import { useRef, useState } from 'react';
import type {
  ExtensionSnapshot,
  Settings,
  SettingDefinition,
  SettingAction,
} from '../../shared/contracts';
import { appletSettingsPageId, appletCommonDescriptions } from '../../shared/settings-catalog';
import { resolveSettingSections } from '../../shared/setting-sections';
import { settingAnchor } from './setting-anchor';
import { SettingsInput, SettingsUrlInput, SettingsTextarea, numberInput } from './SettingsInput';
import { SettingsSection, SettingsField } from './SettingsSections';
import { ShortcutListSetting } from './ShortcutListSetting';
import { ObjectListSetting } from './ObjectListSetting';
import { ObjectListDialogSetting } from './ObjectListDialogSetting';
import { useSettingsControls } from './api';
import { RegisteredImageInput } from './RegisteredImagePicker';

/** Shared manifest-driven body for the settings index and Applet detail tab. */
export function AppletSettingsForm({
  applet,
  settings,
  onChange,
  onListCommit,
  onListOpen,
  accounts = [],
}: {
  applet: ExtensionSnapshot;
  settings: Settings;
  onChange(value: Settings): void;
  onListOpen?(key: string, id: unknown): Promise<unknown>;
  onListCommit?(
    key: string,
    value: Record<string, unknown>[],
    before: Record<string, unknown>[],
  ): Promise<unknown>;
  accounts?: { id: string; name: string }[];
}) {
  const settingsControls = useSettingsControls();
  const pageId = appletSettingsPageId(applet.id);
  const executing = useRef(false);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [result, setResult] = useState<{ command: string; message: string; error: boolean } | null>(
    null,
  );
  const current = settings.extensions[applet.id] ?? { enabled: false, settings: {} };
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
        message: item.successMessage ?? '実行しました。',
        error: false,
      });
    } catch (error) {
      setResult({ command: item.command, message: String(error), error: true });
    } finally {
      executing.current = false;
      setRunningAction(null);
    }
  };
  const action = (item: SettingAction) => {
    const available =
      applet.enabled &&
      applet.state === 'running' &&
      applet.commands.some((c) => c.id === item.command && c.available);
    const help = `setting-action-help-${item.command}`;
    return (
      <SettingsField
        key={item.command}
        title={item.title}
        description={<span id={help}>{item.description}</span>}
        {...settingAnchor(pageId, `action:${item.command}`)}
      >
        <div className="settings-actions">
          <button
            type="button"
            className="secondary"
            aria-describedby={help}
            disabled={!available || runningAction !== null}
            aria-busy={runningAction === item.command}
            onClick={() => void executeAction(item)}
          >
            {runningAction === item.command ? '実行中…' : item.title}
          </button>
        </div>
        {!available && <p>Appletを開始してから操作できます。</p>}
        {result?.command === item.command && (
          <p role={result.error ? 'alert' : 'status'}>{result.message}</p>
        )}
      </SettingsField>
    );
  };
  const field = (item: SettingDefinition) => {
    const value = current.settings[item.key] ?? item.default;
    const set = (next: unknown) =>
      update({ ...current, settings: { ...current.settings, [item.key]: next } });
    const options = applet.settingOptions[item.key] ?? item.options ?? [];
    const help = `setting-help-${applet.id}-${item.key}`;
    const wide = ['object-list', 'shortcut-list', 'json'].includes(item.type);
    return (
      <SettingsField
        key={item.key}
        title={item.title}
        description={item.description && <span id={help}>{item.description}</span>}
        className={wide ? 'settings-field-wide' : ''}
        {...settingAnchor(pageId, `setting:${item.key}`)}
      >
        {item.type === 'object-list' && item.list && onListCommit ? (
          <ObjectListDialogSetting
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
                保存された選択（現在利用できません）: {String(value)}
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
          description={section.description}
          collapsible={section.collapsible}
        >
          {section.settings.map(field)}
          {section.actions.map(action)}
        </SettingsSection>
      ))}
      {!sections.length && (
        <SettingsSection title="このAppletの設定">
          <p>個別の設定項目はありません。操作キーは本体の「ショートカット」で設定できます。</p>
        </SettingsSection>
      )}
      {!applet.collection && !!applet.pages?.length && (
        <SettingsSection
          title="ページの表示"
          description="Appletのページをどこに表示するか選びます。"
        >
          {applet.pages.map((page) => (
            <SettingsField
              key={page.id}
              title={`${page.title}の表示方法`}
              description={appletCommonDescriptions.display}
              {...settingAnchor(pageId, `page:${page.id}`)}
            >
              <select
                aria-label={`${page.title}の表示方法`}
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
                <option value="page">AppDock本体のページ</option>
                <option value="window">別ウィンドウ</option>
              </select>
            </SettingsField>
          ))}
        </SettingsSection>
      )}
      {!applet.collection && (
        <SettingsSection title="起動" description="AppDockを起動したときの動作です。">
          <SettingsField
            title="開始までの秒数"
            description={appletCommonDescriptions.startupDelaySeconds}
            {...settingAnchor(pageId, 'startupDelaySeconds')}
          >
            <SettingsInput
              aria-label="開始までの秒数"
              type="number"
              min={0}
              max={86400}
              step={1}
              value={current.startupDelaySeconds ?? applet.startupDelaySeconds ?? 0}
              onChange={(e) =>
                update({
                  ...current,
                  startupDelaySeconds:
                    e.target.value === '' ? ('' as unknown as number) : numberInput(e.target.value),
                })
              }
            />
          </SettingsField>
        </SettingsSection>
      )}
    </div>
  );
}

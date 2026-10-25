import type { HostTextKey } from '../../shared/i18n';
import { useHostTranslation } from '../HostTranslation';
import type { ReactNode } from 'react';
import { SettingsHintIcon } from '../settings-ui/SettingsHintIcon';
import { SettingsStatusProvider, SettingsStatusArea } from '../settings-ui/SettingsStatus';
import type { SettingsPageDefinition } from '../../shared/settings-catalog';
import type { SettingsPageAuxiliary } from '../../shared/settings-page';
import {
  CommandListPageCanvas,
  CommandListScrollProvider,
  CommandListScrollbar,
} from '../settings-ui/CommandListScroll';

const descriptions: Record<string, HostTextKey> = {
  'command-triggers': 'settings.commandTriggers.description',
  applets: 'settings.settingsPageLayout.applets',
  notifications: 'settings.settingsPageLayout.notifications',
  tts: 'settings.settingsPageLayout.tts',
  ribbon: 'settings.settingsPageLayout.ribbon',
  tray: 'settings.settingsPageLayout.tray',
  shortcuts: 'settings.settingsPageLayout.shortcuts',
  gestures: 'settings.settingsPageLayout.gestures',
  'custom-commands': 'settings.settingsPageLayout.customCommands',
  ai: 'settings.settingsPageLayout.ai',
  'mcp-client': 'settings.settingsPageLayout.mcpClient',
  'web-accounts': 'settings.settingsPageLayout.webAccounts',
  permissions: 'settings.settingsPageLayout.permissions',
  codex: 'settings.settingsPageLayout.codex',
  about: 'settings.settingsPageLayout.about',
};

/** One frame for host settings, Applets, and both form / JSON views. */
export function SettingsPageLayout({
  page,
  mode,
  pending,
  error,
  onMode,
  onOpenFile,
  storage,
  onLocalSettings,
  onReload,
  onReset,
  children,
  announcement,
}: {
  page: SettingsPageDefinition;
  mode: 'form' | 'json';
  pending: boolean;
  error: string;
  onMode(mode: 'form' | 'json'): void;
  onOpenFile(scope?: 'shared' | 'device'): void;
  storage?: SettingsPageAuxiliary['storage'];
  onLocalSettings?(enabled: boolean): void;
  onReload(): void;
  onReset?(): void;
  children: ReactNode;
  announcement: ReactNode;
}) {
  const { t } = useHostTranslation();
  const pageScroll = page.id === 'command-triggers' && mode === 'form';
  const modes: ('form' | 'json')[] = page.json ? ['form', 'json'] : ['form'];
  const description =
    page.kind === 'host'
      ? page.id === 'appearance' || page.id === 'general'
        ? t(`pages.${page.id}.description`)
        : descriptions[page.id]
          ? t(descriptions[page.id])
          : undefined
      : page.collection
        ? t('settings.collectionDescription')
        : t('settings.appletDescription');
  return (
    <SettingsStatusProvider key={page.id + mode} error={error} target={page.title} busy={pending}>
      <CommandListScrollProvider pageScroll={pageScroll}>
        <section
          className="settings-page-layout"
          data-testid={`settings-page:${page.id}`}
          aria-label={t('settings.body')}
        >
          <div
            className={`settings-body settings-page-scroll${pageScroll ? ' settings-page-shared-scroll' : ''}`}
          >
            <CommandListPageCanvas>
              <header className="settings-page-heading">
                <h1>{page.title}</h1>
                <p>{description ?? t('settings.defaultDescription')}</p>
              </header>
              <div className="settings-page-toolbar">
                <div className="tabs" role="group" aria-label={t('settings.mode')}>
                  {modes.map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={value === mode ? 'selected' : ''}
                      aria-pressed={value === mode}
                      onClick={() => onMode(value)}
                    >
                      {value === 'form' ? t('settings.form') : t('settings.json')}
                    </button>
                  ))}
                </div>
                {storage && (storage.canSwitch || ['appearance', 'general'].includes(page.id)) ? (
                  <label className="settings-storage-toggle">
                    <input
                      type="checkbox"
                      checked={storage.local}
                      disabled={!storage.canSwitch || pending}
                      onChange={(event) => onLocalSettings?.(event.target.checked)}
                    />
                    {t('settings.local.label')}
                    <SettingsHintIcon
                      title={t('settings.local.label')}
                      hint={storage.local ? t('settings.local.hint') : t('settings.shared.hint')}
                    />
                  </label>
                ) : null}
                <p className="settings-save-status" role="status">
                  {storage && page.json && (
                    <span className="settings-storage-status">
                      {t('settings.storage.json')}{' '}
                      {storage.files.length > 1
                        ? t('settings.storage.both')
                        : storage.local
                          ? t('settings.storage.deviceOnly')
                          : t('settings.storage.shared')}
                      　
                    </span>
                  )}
                  <span className="sr-only">{pending ? t('settings.saving') : ''}</span>
                </p>
                {page.json && !page.unavailableReason && (
                  <button type="button" disabled={pending} onClick={onReset}>
                    {t('settings.reset')}
                  </button>
                )}
                {page.json && storage && storage.files.length > 1 ? (
                  <details className="settings-file-menu">
                    <summary>{t('settings.openFile')}</summary>
                    <div>
                      {storage.files.map((file) => (
                        <button
                          type="button"
                          key={file.scope}
                          onClick={(event) => {
                            event.currentTarget.closest('details')!.open = false;
                            onOpenFile(file.scope);
                          }}
                        >
                          {file.scope === 'device'
                            ? t('settings.storage.device')
                            : t('settings.storage.shared')}
                          : {file.name}
                        </button>
                      ))}
                    </div>
                  </details>
                ) : (
                  page.json && (
                    <button
                      type="button"
                      className="settings-file-button"
                      onClick={() => onOpenFile(storage?.files[0]?.scope)}
                    >
                      {t('settings.openFile')}
                    </button>
                  )
                )}
              </div>
              <SettingsStatusArea
                action={
                  error ? (
                    <button type="button" className="secondary" onClick={onReload}>
                      {t('settings.reload')}
                    </button>
                  ) : undefined
                }
              />
              <div
                className={`settings-page-content settings-panel settings-panel-${mode}${mode === 'form' ? ' settings-panel-flat' : ''}`}
                key={page.id + mode}
              >
                {children}
              </div>
            </CommandListPageCanvas>
          </div>
          <CommandListScrollbar />
          {announcement}
        </section>
      </CommandListScrollProvider>
    </SettingsStatusProvider>
  );
}

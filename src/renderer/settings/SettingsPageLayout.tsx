import type { HostTextKey } from '../../shared/i18n';
import { useHostTranslation } from '../HostTranslation';
import { useLayoutEffect, useRef, type ReactNode } from 'react';
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
  'touchpad-gestures': 'settings.settingsPageLayout.touchpad',
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
  formTabs,
  formTabsId = 'command-trigger',
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
  formTabs?: { id: string; title: string; selected: boolean; select(): void }[];
  formTabsId?: string;
  onOpenFile(scope?: 'shared' | 'device'): void;
  storage?: SettingsPageAuxiliary['storage'];
  onLocalSettings?(enabled: boolean): void;
  onReload(): void;
  onReset?(): void;
  children: ReactNode;
  announcement: ReactNode;
}) {
  const { t } = useHostTranslation();
  const toolsRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = toolsRef.current;
    const body = element?.closest<HTMLElement>('.settings-body');
    if (!element || !body) return;
    const measure = () =>
      body.style.setProperty('--settings-toolbar-height', `${element.offsetHeight}px`);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => {
      observer.disconnect();
      body.style.removeProperty('--settings-toolbar-height');
    };
  }, [page.id, mode]);
  const pageScroll = page.id === 'command-triggers' && mode === 'form';
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
            className={`settings-body settings-page-scroll${pageScroll ? ' settings-page-shared-scroll' : ''}${mode === 'json' ? ' settings-page-json' : ''}`}
          >
            <CommandListPageCanvas>
              <header className="settings-page-heading">
                <h1>{page.title}</h1>
                <p>{description ?? t('settings.defaultDescription')}</p>
              </header>
              <div className="settings-page-tools" ref={toolsRef} data-testid="settings-page-tools">
                <div className="settings-page-toolbar">
                  <div className="settings-page-view-tools">
                    <div
                      className="tabs"
                      role="group"
                      aria-label={t('settings.mode')}
                      data-testid={formTabs ? `${formTabsId}-tabs` : 'settings-view-tabs'}
                    >
                      {formTabs ? (
                        formTabs.map((tab) => (
                          <button
                            key={tab.id}
                            type="button"
                            data-testid={`${formTabsId}-tab:${tab.id}`}
                            className={mode === 'form' && tab.selected ? 'selected' : ''}
                            aria-pressed={mode === 'form' && tab.selected}
                            onClick={tab.select}
                          >
                            {tab.title}
                          </button>
                        ))
                      ) : (
                        <button
                          type="button"
                          className={mode === 'form' ? 'selected' : ''}
                          aria-pressed={mode === 'form'}
                          onClick={() => onMode('form')}
                        >
                          {t('settings.form')}
                        </button>
                      )}
                      {page.json && (
                        <button
                          type="button"
                          className={mode === 'json' ? 'selected' : ''}
                          aria-pressed={mode === 'json'}
                          onClick={() => onMode('json')}
                        >
                          {t('settings.json')}
                        </button>
                      )}
                    </div>
                    {mode === 'json' &&
                      page.json &&
                      (storage && storage.files.length > 1 ? (
                        <details className="settings-file-menu">
                          <summary className="settings-file-button">
                            {t('settings.openFile')}
                          </summary>
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
                        <button
                          type="button"
                          className="settings-file-button"
                          onClick={() => onOpenFile(storage?.files[0]?.scope)}
                        >
                          {t('settings.openFile')}
                        </button>
                      ))}
                  </div>
                  {storage && (storage.canSwitch || ['appearance', 'general'].includes(page.id)) ? (
                    <label className="settings-storage-toggle">
                      <input
                        data-testid="settings-storage-local"
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
                  <span className="sr-only" role="status">
                    {pending ? t('settings.saving') : ''}
                  </span>
                  {page.json && !page.unavailableReason && (
                    <button
                      type="button"
                      className="settings-page-reset"
                      disabled={pending}
                      onClick={onReset}
                    >
                      {t('settings.reset')}
                    </button>
                  )}
                </div>
                <SettingsStatusArea
                  collapseWhenEmpty
                  action={
                    error ? (
                      <button type="button" className="secondary" onClick={onReload}>
                        {t('settings.reload')}
                      </button>
                    ) : undefined
                  }
                />
              </div>
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

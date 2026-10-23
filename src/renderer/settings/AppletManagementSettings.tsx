import { hostText } from '../../shared/i18n';
import { useHostTranslation } from '../HostTranslation';
import { useSettingsFeedback } from '../settings-ui/SettingsStatus';
import { useEffect, useId, useRef, useState } from 'react';
import type { ExtensionSnapshot, UpdateState } from '../../shared/contracts';
import type { AppletPackagePlan, AppletPackagePreviewResult } from '../../shared/applet-packages';
import { Icon, type IconName } from '../../shared/ui-icons';
import type { SettingsPageAuxiliary } from '../../shared/settings-page';
import { SettingsDialog } from '../settings-ui/SettingsModal';
import { SettingsOrderDialog } from '../settings-ui/SettingsOrderDialog';
import { SettingsInput } from '../settings-ui/SettingsInput';
import { SettingsField } from '../settings-ui/SettingsSections';
import { ListIcon } from '../settings-ui/SettingsListTable';
import { Toggle } from '../settings-ui/Toggle';
import { UpdateCheckTime, VersionDisplay } from '../settings-ui/VersionCheck';
import { settingAnchor } from '../settings-ui/setting-anchor';
import { CommandListToolbar } from '../settings-ui/CommandListScroll';

const states = {
  running: hostText('settings.appletManagementSettings.running'),
  stopped: hostText('settings.appletManagementSettings.stopped'),
  waiting: hostText('settings.appletManagementSettings.waiting'),
  starting: hostText('settings.appletManagementSettings.starting'),
  stopping: hostText('settings.appletManagementSettings.stopping'),
  error: hostText('settings.appletManagementSettings.error'),
};
type Invoke = (name: string, args?: unknown[]) => Promise<any>;
async function applyPackage(invoke: Invoke, id: string) {
  try {
    const result = await invoke('applyAppletPackage', [id]);
    if (result?.error) throw Error(result.error);
    return result;
  } catch (error) {
    const status = await invoke('appletPackageStatus', [id]).catch(() => undefined);
    if (status?.status === 'handed-off' || (status?.status === 'completed' && status.result?.ok))
      return status;
    throw error;
  }
}

function InstallDialog({ invoke, close }: { invoke: Invoke; close(): void }) {
  const { t: translate } = useHostTranslation();
  const errorId = useId();
  const [source, setSource] = useState('');
  const [choosing, setChoosing] = useState(false);
  const [checking, setChecking] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const active = useRef(true);
  const previewActive = useRef(false);
  const currentPlan = useRef<string | undefined>(undefined);
  const invokeRef = useRef(invoke);
  invokeRef.current = invoke;
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      if (previewActive.current)
        void invokeRef.current('cancelAppletPackagePreview').catch(() => {});
      if (currentPlan.current)
        void invokeRef.current('discardAppletPackage', [currentPlan.current]).catch(() => {});
    };
  }, []);
  return (
    <SettingsDialog
      title={translate('settings.appletManagementSettings.install')}
      className="applet-install-dialog"
      onClose={() => {
        if (!currentPlan.current) close();
      }}
      valid={!choosing}
      applyLabel={translate('settings.appletManagementSettings.installRestart')}
      message={checking ? translate('settings.appletManagementSettings.downloading') : ''}
      errorTarget={translate('settings.appletManagementSettings.source')}
      description={translate('settings.appletManagementSettings.sourceHint')}
      cancelWhilePending={checking}
      onApply={async () => {
        // Read the current field at the explicit action, including a pending blur commit.
        const location = input.current?.value ?? source;
        setSource(location);
        previewActive.current = true;
        setChecking(true);
        try {
          const result: AppletPackagePreviewResult = await invoke('prepareAppletInstall', [
            location,
          ]);
          previewActive.current = false;
          if (!result || 'cancelled' in result) return;
          if ('error' in result) throw Error(result.error);
          if (!active.current) {
            await invokeRef.current('discardAppletPackage', [result.planId]);
            return;
          }
          currentPlan.current = result.planId;
          setChecking(false);
          await applyPackage(invoke, result.planId);
          currentPlan.current = undefined;
        } finally {
          previewActive.current = false;
          if (active.current) setChecking(false);
          if (currentPlan.current) {
            void invokeRef.current('discardAppletPackage', [currentPlan.current]).catch(() => {});
            currentPlan.current = undefined;
          }
        }
      }}
    >
      {(_ready, setError, { error }) => (
        <>
          <SettingsField
            title={translate('settings.appletManagementSettings.source')}
            description={translate('settings.appletManagementSettings.location')}
            error={error}
            hint={translate('settings.appletManagementSettings.locationHint')}
          >
            <div className="applet-install-source">
              <SettingsInput
                ref={input}
                id={`${errorId}-source`}
                aria-label={translate('settings.appletManagementSettings.locationLabel')}
                aria-invalid={!!error}
                value={source}
                disabled={choosing}
                commitOn="blur-or-enter"
                data-initial-focus
                placeholder={translate('settings.appletManagementSettings.locationPlaceholder')}
                onChange={(event) => setSource(event.target.value)}
              />
              <button
                type="button"
                className="settings-list-icon"
                title={translate('settings.appletManagementSettings.selectFolder')}
                aria-label={translate('settings.appletManagementSettings.selectFolder')}
                disabled={choosing}
                onClick={() => {
                  setChoosing(true);
                  void invoke('chooseAppletInstallDirectory')
                    .then((result) => {
                      if (!active.current) return;
                      if (result.error) setError(result.error);
                      else if (result.path) setSource(result.path);
                    })
                    .catch((reason) => {
                      if (active.current)
                        setError(reason instanceof Error ? reason.message : String(reason));
                    })
                    .finally(() => {
                      if (active.current) setChoosing(false);
                    });
                }}
              >
                <Icon name="folder" />
              </button>
            </div>
          </SettingsField>
        </>
      )}
    </SettingsDialog>
  );
}
export function AppletManagementSettings({
  applets,
  management,
  updates,
  invoke,
}: {
  applets: ExtensionSnapshot[];
  management: SettingsPageAuxiliary['appletManagement'];
  updates?: UpdateState;
  invoke: Invoke;
}) {
  const { t: translate } = useHostTranslation();
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const [install, setInstall] = useState(false);
  const [order, setOrder] = useState(false);
  const [removal, setRemoval] = useState<AppletPackagePlan>();
  const running = useRef(false);
  const run = async (id: string, work: () => Promise<unknown>) => {
    if (running.current) return;
    running.current = true;
    setPending(id);
    setError('');
    try {
      await work();
    } catch (reason) {
      setError(String(reason));
    } finally {
      running.current = false;
      setPending('');
    }
  };
  const busy = !!pending || !!management?.busy || !!updates?.busy;
  const visible = applets.filter((a) =>
    `${a.displayName} ${a.name} ${a.id}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  const move = (id: string, destination: string) =>
    run(id, () => invoke('openAppletDestination', [id, destination]));
  const status = !updates?.busy ? (updates?.completion?.message ?? updates?.phase) : '';
  useSettingsFeedback({
    error,
    message: status,
    busy,
    target: translate('settings.appletManagementSettings.title'),
  });
  return (
    <section
      className="settings-list applet-management"
      {...settingAnchor('applets', 'management')}
    >
      {management && (!management.packagesAvailable || !!management.discoveryIssueCount) && (
        <SettingsField
          title={
            management.discoveryIssueCount
              ? translate('settings.appletManagementSettings.discovery')
              : translate('settings.appletManagementSettings.operations')
          }
          description={[
            !management?.packagesAvailable
              ? translate('settings.appletManagementSettings.portableOnly')
              : '',
            management?.discoveryIssueCount
              ? translate('settings.appletManagementSettings.discoveryIssues', {
                  discoveryIssueCount: management.discoveryIssueCount,
                })
              : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {!!management?.discoveryIssueCount && (
            <button
              className="text-button"
              onClick={() => void run('discovery', () => invoke('openAppletDiscoveryLogs'))}
            >
              {translate('settings.appletManagementSettings.openDiscoveryLog')}
            </button>
          )}
        </SettingsField>
      )}
      <CommandListToolbar>
        <div className="command-shortcut-tools">
          <div className="command-shortcut-search">
            <span aria-hidden="true">⌕</span>
            <SettingsInput
              type="search"
              aria-label={translate('settings.appletManagementSettings.search')}
              placeholder={translate('settings.appletManagementSettings.searchPlaceholder')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>
        <div className="command-shortcut-summary">
          <span role="status">
            {translate('settings.appletManagementSettings.visibleCount', {
              visible: visible.length,
              total: applets.length,
            })}
          </span>
          <button
            type="button"
            className="settings-list-icon shortcut-order-open"
            aria-label={translate('settings.appletManagementSettings.order')}
            title={translate('settings.appletManagementSettings.displayOrder')}
            disabled={busy || applets.length < 2}
            onClick={() => setOrder(true)}
          >
            <ListIcon kind="order" />
          </button>
        </div>
      </CommandListToolbar>
      <div className="settings-list-scroll">
        <table className="settings-list-table applet-management-table">
          <thead>
            <tr>
              <th>
                <span className="applet-management-column-title">
                  {translate('settings.appletManagementSettings.name')}
                  <button
                    type="button"
                    className="applet-shortcut-add"
                    data-dialog-focus-fallback
                    aria-label={translate('settings.appletManagementSettings.install')}
                    title={translate('settings.appletManagementSettings.install')}
                    disabled={busy || !management?.packagesAvailable}
                    onClick={() => setInstall(true)}
                  >
                    ＋
                  </button>
                </span>
              </th>
              <th>
                <span className="applet-management-column-title">
                  {translate('settings.appletManagementSettings.version')}
                  <button
                    type="button"
                    className="settings-list-icon applet-update-check"
                    title={translate('settings.appletManagementSettings.checkAll')}
                    aria-label={translate('settings.appletManagementSettings.checkAll')}
                    disabled={busy || !applets.length}
                    onClick={() => void run('updates', () => invoke('checkAppletUpdates'))}
                  >
                    <Icon name="refresh" size={16} />
                  </button>
                </span>
              </th>
              <th>{translate('settings.appletManagementSettings.enabled')}</th>
              <th>{translate('settings.appletManagementSettings.state')}</th>
              <th>{translate('settings.appletManagementSettings.actions')}</th>
              <th>{translate('settings.appletManagementSettings.navigation')}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((a) => {
              const result = updates?.results.find((r) => r.id === a.id);
              const changing = busy || ['starting', 'stopping'].includes(a.state);
              const mutable = management?.mutableIds.includes(a.id);
              return (
                <tr key={a.id} data-applet-id={a.id}>
                  <td>
                    <button
                      className="text-button applet-management-name"
                      onClick={() => void move(a.id, 'settings')}
                    >
                      <strong>{a.displayName}</strong>
                    </button>
                    <small>{a.id}</small>
                  </td>
                  <td>
                    <div className="applet-management-version">
                      <VersionDisplay version={a.version} result={result} />
                    </div>
                    <UpdateCheckTime checkedAt={result?.checkedAt} />
                    {result?.installable && (
                      <button
                        className="text-button applet-update-install"
                        disabled={busy || !mutable}
                        onClick={() => void run(a.id, () => invoke('installUpdates', [a.id]))}
                      >
                        {translate('settings.appletManagementSettings.update')}
                      </button>
                    )}
                    {result?.message && <small>{result.message}</small>}
                  </td>
                  <td>
                    <Toggle
                      label={translate('settings.appletManagementSettings.enable', {
                        displayName: a.displayName,
                      })}
                      checked={a.enabled}
                      disabled={changing}
                      onChange={(value) =>
                        void run(a.id, () =>
                          invoke('manageApplet', [a.id, value ? 'enable' : 'disable']),
                        )
                      }
                    />
                  </td>
                  <td>
                    <span className={`state ${a.state}`}>{states[a.state]}</span>
                    {a.error && (
                      <small>
                        {translate('settings.appletManagementSettings.lifecycleFailed')}
                      </small>
                    )}
                    {a.state === 'waiting' && (
                      <>
                        <small>
                          {a.scheduledStartAt && new Date(a.scheduledStartAt).toLocaleTimeString()}
                        </small>
                        <button
                          disabled={changing}
                          onClick={() => void run(a.id, () => invoke('startAppletNow', [a.id]))}
                        >
                          {translate('settings.appletManagementSettings.start')}
                        </button>
                      </>
                    )}
                  </td>
                  <td>
                    <div className="applet-management-actions">
                      <button
                        type="button"
                        className="settings-list-icon"
                        title={translate('settings.appletManagementSettings.restart')}
                        aria-label={translate('settings.appletManagementSettings.restartApplet', {
                          displayName: a.displayName,
                        })}
                        disabled={changing || !a.enabled}
                        onClick={() =>
                          void run(a.id, () => invoke('manageApplet', [a.id, 'restart']))
                        }
                      >
                        <Icon name="power" />
                      </button>
                      <button
                        type="button"
                        className="settings-list-icon settings-list-delete"
                        title={translate('settings.appletManagementSettings.uninstall')}
                        aria-label={translate('settings.appletManagementSettings.uninstallApplet', {
                          displayName: a.displayName,
                        })}
                        disabled={changing || !mutable}
                        onClick={() =>
                          void run(a.id, async () =>
                            setRemoval(await invoke('prepareAppletUninstall', [a.id])),
                          )
                        }
                      >
                        <ListIcon kind="delete" />
                      </button>
                    </div>
                    {management?.packagesAvailable && !mutable && (
                      <small>
                        {translate('settings.appletManagementSettings.fileOperationsUnavailable')}
                      </small>
                    )}
                  </td>
                  <td>
                    <div
                      className="applet-management-links"
                      role="group"
                      aria-label={translate('settings.appletManagementSettings.settingsAndLogs', {
                        displayName: a.displayName,
                      })}
                    >
                      {(
                        [
                          [
                            'settings',
                            translate('settings.appletManagementSettings.settings'),
                            'settings',
                          ],
                          [
                            'shortcuts',
                            translate('settings.appletManagementSettings.shortcuts'),
                            'keyboard',
                          ],
                          [
                            'gestures',
                            translate('settings.appletManagementSettings.gestures'),
                            'mouse',
                          ],
                          ['logs', translate('settings.appletManagementSettings.logs'), 'logs'],
                        ] satisfies [string, string, IconName][]
                      ).map(([id, title, icon]) => {
                        const assigned =
                          (id === 'shortcuts' || id === 'gestures') &&
                          !!management?.assignments[id].includes(a.id);
                        return (
                          <button
                            key={id}
                            type="button"
                            className={`settings-list-icon${assigned ? ' accent-action' : ''}`}
                            title={`${title}${assigned ? translate('settings.appletManagementSettings.assigned') : ''}`}
                            aria-label={translate('settings.appletManagementSettings.open', {
                              displayName: a.displayName,
                              title: title,
                            })}
                            aria-description={
                              assigned
                                ? translate('settings.appletManagementSettings.assignedHint')
                                : undefined
                            }
                            data-assigned={assigned}
                            onClick={() => void move(a.id, id)}
                          >
                            <Icon name={icon} />
                          </button>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!visible.length && (
        <p>
          {applets.length
            ? translate('settings.appletManagementSettings.noMatches')
            : translate('settings.appletManagementSettings.empty')}
        </p>
      )}
      {install && <InstallDialog invoke={invoke} close={() => setInstall(false)} />}
      {order && (
        <SettingsOrderDialog
          title={translate('settings.appletManagementSettings.displayOrder')}
          listLabel={translate('settings.appletManagementSettings.displayOrder')}
          items={applets.map((a) => ({ id: a.id, title: a.displayName }))}
          onClose={() => setOrder(false)}
          onApply={(ordered, original) => invoke('reorderApplets', [ordered, original])}
        />
      )}
      {removal && (
        <SettingsDialog
          title={translate('settings.appletManagementSettings.uninstallTitle')}
          applyLabel={translate('settings.appletManagementSettings.uninstallRestart')}
          onClose={() => {
            void invoke('discardAppletPackage', [removal.planId]).catch(() => {});
            setRemoval(undefined);
          }}
          onApply={() => applyPackage(invoke, removal.planId)}
        >
          <p>
            {translate('settings.appletManagementSettings.uninstallConfirm', {
              name: removal.name,
              version: removal.version,
            })}
          </p>
          <p>{translate('settings.appletManagementSettings.uninstallHint')}</p>
          {!!removal.siteCount && (
            <p>
              {translate('settings.appletManagementSettings.sitesHint', {
                count: removal.siteCount,
              })}
            </p>
          )}
          {removal.shell && <p>{translate('settings.appletManagementSettings.shellFallback')}</p>}
        </SettingsDialog>
      )}
    </section>
  );
}

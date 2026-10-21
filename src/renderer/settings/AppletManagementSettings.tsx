import { useEffect, useId, useRef, useState } from 'react';
import type { ExtensionSnapshot, UpdateState } from '../../shared/contracts';
import type { AppletPackagePlan, AppletPackagePreviewResult } from '../../shared/applet-packages';
import { Icon, type IconName } from '../../shared/ui-icons';
import type { SettingsPageAuxiliary } from '../../shared/settings-page';
import { SettingsDialog } from '../settings-ui/SettingsModal';
import { SettingsOrderDialog } from '../settings-ui/SettingsOrderDialog';
import { SettingsInput } from '../settings-ui/SettingsInput';
import { SettingsError } from '../settings-ui/SettingsError';
import { ListIcon } from '../settings-ui/SettingsListTable';
import { Toggle } from '../settings-ui/Toggle';
import { UpdateCheckTime, VersionDisplay } from '../settings-ui/VersionCheck';
import { settingAnchor } from '../settings-ui/setting-anchor';

const states = {
  running: '実行中',
  stopped: '停止中',
  waiting: '開始待ち',
  starting: '起動中',
  stopping: '停止処理中',
  error: 'エラー',
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
      title="Appletをインストール"
      className="applet-install-dialog"
      onClose={() => {
        if (!currentPlan.current) close();
      }}
      valid={!choosing}
      applyLabel="インストールして再起動"
      errorLayout="custom"
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
          <div className="applet-install-field">
            <div className="applet-install-label">
              <label htmlFor={`${errorId}-source`}>配布元（URLまたはフォルダー）</label>
              <SettingsError error={error} id={errorId} />
            </div>
            <div className="applet-install-source">
              <SettingsInput
                ref={input}
                id={`${errorId}-source`}
                aria-label="Appletの配布元"
                aria-invalid={!!error}
                aria-describedby={error ? errorId : undefined}
                value={source}
                disabled={choosing}
                commitOn="blur-or-enter"
                data-initial-focus
                placeholder="https://github.com/owner/repository または C:\Applets\Sample"
                onChange={(event) => setSource(event.target.value)}
              />
              <button
                type="button"
                className="settings-list-icon"
                title="配布フォルダーを選ぶ"
                aria-label="配布フォルダーを選ぶ"
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
            <p>URL、配布フォルダー、または展開済みAppletのフォルダーを指定できます。</p>
          </div>
          <p className="applet-install-notice">
            AppletはこのPCでコードを実行します。信頼できる配布元を指定してください。
            インストール時に内容を検証し、問題がなければ導入してAppDockを再起動します。
          </p>
          <span className="sr-only" role="status">
            {checking ? '配布物を取得・検証しています…' : ''}
          </span>
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
  return (
    <section
      className="settings-list applet-management"
      {...settingAnchor('applets', 'management')}
    >
      <div className="command-shortcut-tools">
        <div className="command-shortcut-search">
          <span aria-hidden="true">⌕</span>
          <SettingsInput
            type="search"
            aria-label="Appletを検索"
            placeholder="Appletを検索…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>
      {!management?.packagesAvailable && (
        <p className="muted">
          インストール・更新の適用・アンインストールは配布版のAppDockで利用できます。
        </p>
      )}
      {!!management?.discoveryIssueCount && (
        <p role="status">
          読み込めなかったAppletがあります（{management.discoveryIssueCount}件）。
          <button
            className="text-button"
            onClick={() => void run('discovery', () => invoke('openAppletDiscoveryLogs'))}
          >
            検出ログを開く
          </button>
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {status && status !== '適用できる更新はありません。' && (
        <p className="applet-package-status" role="status">
          {status}
        </p>
      )}
      <div className="command-shortcut-summary">
        <span role="status">
          {visible.length} / {applets.length} Appletを表示
        </span>
        <button
          type="button"
          className="settings-list-icon shortcut-order-open accent-action"
          aria-label="Appletを並べ替え"
          title="Appletの表示順"
          disabled={busy || applets.length < 2}
          onClick={() => setOrder(true)}
        >
          <ListIcon kind="order" />
        </button>
      </div>
      <div className="settings-list-scroll">
        <table className="settings-list-table applet-management-table">
          <thead>
            <tr>
              <th>
                <span className="applet-management-column-title">
                  Applet名
                  <button
                    type="button"
                    className="applet-shortcut-add"
                    data-dialog-focus-fallback
                    aria-label="Appletをインストール"
                    title="Appletをインストール"
                    disabled={busy || !management?.packagesAvailable}
                    onClick={() => setInstall(true)}
                  >
                    ＋
                  </button>
                </span>
              </th>
              <th>
                <span className="applet-management-column-title">
                  バージョン
                  <button
                    type="button"
                    className="settings-list-icon applet-update-check"
                    title="すべてのAppletの更新を確認"
                    aria-label="すべてのAppletの更新を確認"
                    disabled={busy || !applets.length}
                    onClick={() => void run('updates', () => invoke('checkAppletUpdates'))}
                  >
                    <Icon name="refresh" size={16} />
                  </button>
                </span>
              </th>
              <th>有効</th>
              <th>状態</th>
              <th>設定</th>
              <th>操作</th>
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
                        更新
                      </button>
                    )}
                    {result?.message && <small>{result.message}</small>}
                  </td>
                  <td>
                    <Toggle
                      label={`${a.displayName}を有効にする`}
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
                    {a.error && <small>起動・停止に失敗しました。ログを確認してください。</small>}
                    {a.state === 'waiting' && (
                      <>
                        <small>
                          {a.scheduledStartAt && new Date(a.scheduledStartAt).toLocaleTimeString()}
                        </small>
                        <button
                          disabled={changing}
                          onClick={() => void run(a.id, () => invoke('startAppletNow', [a.id]))}
                        >
                          今すぐ開始
                        </button>
                      </>
                    )}
                  </td>
                  <td>
                    <div
                      className="applet-management-links"
                      role="group"
                      aria-label={`${a.displayName}の設定とログ`}
                    >
                      {(
                        [
                          ['settings', '設定', 'settings'],
                          ['shortcuts', 'ショートカット', 'keyboard'],
                          ['gestures', 'マウスジェスチャー', 'mouse'],
                          ['logs', 'ログ', 'logs'],
                        ] satisfies [string, string, IconName][]
                      ).map(([id, title, icon]) => (
                        <button
                          key={id}
                          type="button"
                          className="settings-list-icon"
                          title={title}
                          aria-label={`${a.displayName}の${title}を開く`}
                          onClick={() => void move(a.id, id)}
                        >
                          <Icon name={icon} />
                        </button>
                      ))}
                    </div>
                  </td>
                  <td>
                    <div className="applet-management-actions">
                      <button
                        type="button"
                        className="settings-list-icon"
                        title="再起動"
                        aria-label={`${a.displayName}を再起動`}
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
                        title="アンインストール"
                        aria-label={`${a.displayName}をアンインストール`}
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
                      <small>この配置のファイル操作は利用できません。</small>
                    )}
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
            ? '該当するAppletはありません。'
            : 'インストール済みのAppletはありません。'}
        </p>
      )}
      {install && <InstallDialog invoke={invoke} close={() => setInstall(false)} />}
      {order && (
        <SettingsOrderDialog
          title="Appletの表示順"
          listLabel="Appletの表示順"
          items={applets.map((a) => ({ id: a.id, title: a.displayName }))}
          onClose={() => setOrder(false)}
          onApply={(ordered, original) => invoke('reorderApplets', [ordered, original])}
        />
      )}
      {removal && (
        <SettingsDialog
          title="Appletをアンインストール"
          applyLabel="アンインストールして再起動"
          onClose={() => {
            void invoke('discardAppletPackage', [removal.planId]).catch(() => {});
            setRemoval(undefined);
          }}
          onApply={() => applyPackage(invoke, removal.planId)}
        >
          <p>
            {removal.name}（v{removal.version}）をアンインストールします。
          </p>
          <p>
            このAppletの配置フォルダー内のファイルを削除します。設定と保存データは残ります。AppDockを再起動します。
          </p>
          {!!removal.siteCount && (
            <p>
              登録された{removal.siteCount}
              件のサイトを利用できなくなります。登録内容・アカウント・sessionは保持します。
            </p>
          )}
          {removal.shell && (
            <p>使用中のShellは再起動後にDefault Shellへ戻ります。保存された指定は保持します。</p>
          )}
        </SettingsDialog>
      )}
    </section>
  );
}

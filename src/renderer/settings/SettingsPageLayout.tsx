import type { ReactNode } from 'react';
import { SettingsHint } from '../settings-ui/SettingsHint';
import type { SettingsPageDefinition } from '../../shared/settings-catalog';
import type { SettingsPageAuxiliary } from '../../shared/settings-page';

const descriptions: Record<string, string> = {
  applets: 'インストール済みAppletの状態・更新・表示順を管理します。',
  appearance: 'テーマ・表示倍率・アクセントカラー・ヒントの表示と、各領域のShellを設定します。',
  general: '音の再生や、起動時・ウィンドウを閉じたときの動作を設定します。',
  notifications: '通知の種類ごとに、表示先・表示時間・読み上げを設定します。',
  tts: 'OpenAI互換のTTSサーバーで生成した音声を、このPCで再生します。',
  ribbon:
    '右クリックの動作と、ボタン・グループ・区切り線の表示や配置を設定します。確定した変更は自動保存します。',
  tray: 'トレイアイコンのクリック操作と、メニューに表示するコマンドを設定します。',
  shortcuts: 'コマンドを見つけて、キーと使う場面を設定できます。',
  gestures: 'コマンドを見つけて、操作と使う場面を設定できます。',
  'web-accounts':
    'WebApplet専用のアカウント枠を管理します。同じ枠を選んだWebAppletはログイン状態を共有し、Gmailのアカウントとは別管理です。',
  permissions:
    'AppletとMCPの許可を、それぞれ設定します。Applet側はすべてのAppletに共通です。変更はすぐに反映されます。',
  codex:
    '同じPCのCodexやネットワーク上のMCPクライアントから、AppDockの状態確認・設定変更・公開コマンドの実行ができます。連携の設定はこのPCへ即時反映されます。',
  about: 'AppDockとインストール済みAppletのバージョンを確認し、更新を管理します。',
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
  const modes: ('form' | 'json')[] = page.json ? ['form', 'json'] : ['form'];
  const description =
    page.kind === 'host'
      ? descriptions[page.id]
      : page.collection
        ? '表示方法・アカウント・サイトの動作を設定します。'
        : 'Appletの表示方法・起動時の動作と、個別の設定を変更します。';
  return (
    <section className="settings-page-layout" aria-label="設定本文">
      <header className="settings-page-heading">
        <h1>{page.title}</h1>
        <p>{description ?? 'このページの設定を変更します。'}</p>
      </header>
      <div className="settings-page-toolbar">
        <div className="tabs" role="group" aria-label="設定の表示形式">
          {modes.map((value) => (
            <button
              key={value}
              type="button"
              className={value === mode ? 'selected' : ''}
              aria-pressed={value === mode}
              onClick={() => onMode(value)}
            >
              {value === 'form' ? 'フォーム' : 'JSON'}
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
            このPCで設定を保持する
          </label>
        ) : null}
        <p className="settings-save-status" role="status">
          {storage && page.json && (
            <span className="settings-storage-status">
              設定JSON:{' '}
              {storage.files.length > 1 ? '共有＋このPC' : storage.local ? 'このPC専用' : '共有'}　
            </span>
          )}
          <span className="sr-only">{pending ? '保存中…' : ''}</span>
        </p>
        {page.json && !page.unavailableReason && (
          <button type="button" disabled={pending} onClick={onReset}>
            このページを既定値に戻す
          </button>
        )}
        {page.json && storage && storage.files.length > 1 ? (
          <details className="settings-file-menu">
            <summary>ファイルを開く</summary>
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
                  {file.scope === 'device' ? 'このPC' : '共有'}: {file.name}
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
              ファイルを開く
            </button>
          )
        )}
      </div>
      {storage?.canSwitch && (
        <SettingsHint className="settings-storage-description">
          {storage.local
            ? 'このPC専用の設定を使います。OFFにするときに、共有への反映・このPCの設定の削除・保持を選べます。'
            : '共有設定を使います。初めてONにすると現在の設定をコピーし、保存済みの端末設定があれば再開します。'}
        </SettingsHint>
      )}
      {error && (
        <div className="settings-page-error">
          <p className="error-text" role="alert">
            {error}
          </p>
          <button type="button" className="secondary" onClick={onReload}>
            設定を再読み込み
          </button>
        </div>
      )}
      <div
        className={`settings-body settings-panel settings-panel-${mode}${page.id === 'shortcuts' && mode === 'form' ? ' settings-panel-flat' : ''}`}
        key={page.id + mode}
      >
        {children}
      </div>
      {announcement}
    </section>
  );
}

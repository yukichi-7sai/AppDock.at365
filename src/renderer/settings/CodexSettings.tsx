import { settingAnchor } from '../settings-ui/setting-anchor';
import { SettingsInput, SettingsTextarea } from '../settings-ui/SettingsInput';
import { useSettingsControls } from '../settings-ui/api';
import { useEffect, useRef, useState } from 'react';
import { Toggle } from '../settings-ui/Toggle';
import type { AutomationAction, AutomationState } from '../../shared/automation';
import { SettingsSection, SettingsField } from '../settings-ui/SettingsSections';
import { useSettingsFeedback } from '../settings-ui/SettingsStatus';

export function CodexSettings({ onOpenPermissions }: { onOpenPermissions(): void }) {
  const settingsControls = useSettingsControls();
  const [state, setState] = useState<AutomationState>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [file, setFile] = useState('');
  const [port, setPort] = useState('0');
  const [name, setName] = useState('AppDock');
  const [hostnames, setHostnames] = useState('');
  const operation = useRef(false);
  useEffect(() => {
    let active = true;
    const refresh = () =>
      void settingsControls
        .automation({ kind: 'status' })
        .then((r) => {
          if (!active) return;
          setState(r.state);
        })
        .catch((e) => {
          if (active) setError(String(e));
        });
    refresh();
    const unsubscribe = settingsControls.onChanged(refresh);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (state) setFile(state.configFile);
  }, [state?.configFile]);
  useEffect(() => {
    if (state) setPort(String(state.port));
  }, [state?.port]);
  useEffect(() => {
    if (state) setName(state.serverId);
  }, [state?.serverId]);
  const savedHostnames = state?.networkHostnames.join('\n');
  useEffect(() => {
    setHostnames(savedHostnames ?? '');
  }, [savedHostnames]);
  function saveHostnames(value: string) {
    const names = value
      .split(/\r?\n/)
      .map((name) => name.trim())
      .filter(Boolean);
    if (JSON.stringify(names) !== JSON.stringify(state?.networkHostnames))
      void run({ kind: 'setNetworkHostnames', hostnames: names });
  }
  async function run(action: AutomationAction) {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    setError('');
    try {
      const r = await settingsControls.automation(action);
      setState(r.state);
    } catch (e) {
      setError(String(e));
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  useSettingsFeedback({
    error: error || state?.error || state?.registrationError,
    busy,
    target: 'MCPサーバー',
    message: !state && !error ? '連携状態を読み込んでいます…' : '',
  });
  if (!state)
    return (
      <div className="settings-sections">
        <button disabled={busy} onClick={() => void run({ kind: 'status' })}>
          連携状態を再読み込み
        </button>
      </div>
    );
  const configure = (
    enabled = state.enabled,
    allowWrite = state.allowWrite,
    nextPort = state.port,
  ) => void run({ kind: 'configure', enabled, allowWrite, port: nextPort });
  const registration =
    state.registration === 'registered'
      ? '登録済み'
      : state.registration === 'conflict'
        ? '確認が必要'
        : '未登録';
  return (
    <section className="settings-sections codex-settings" aria-label="MCP・Codex連携">
      <SettingsSection
        title="接続の状態"
        hint="同じPCのCodexや、ネットワーク上のMCPクライアントからAppDockを操作できます。"
      >
        <SettingsField title="Codexへの登録" description={registration} />
        <SettingsField
          title="このPCからの最終接続"
          description={
            state.lastLocalClientAt
              ? new Date(state.lastLocalClientAt).toLocaleString()
              : 'まだ確認されていません'
          }
        />
        <SettingsField
          title="ネットワークからの最終接続"
          description={
            state.lastNetworkClientAt
              ? new Date(state.lastNetworkClientAt).toLocaleString()
              : 'まだ確認されていません'
          }
        />
        <SettingsField
          title="連携を有効にする"
          description={`サーバー: ${state.running ? '稼働中' : state.enabled ? '起動できません' : '停止中'}`}
          hint="AppDockの起動中に接続できます。"
          {...settingAnchor('codex', 'automation')}
        >
          <Toggle
            label="Codex連携を有効にする"
            checked={state.enabled}
            disabled={busy}
            onChange={(v) => configure(v)}
          />
        </SettingsField>
        <SettingsField
          title="接続範囲"
          description={
            '変更時に通信が一時切断されます。同じPCのCodexの再登録は不要です。' +
            (state.connectionScope === 'network'
              ? '到達可能な接続元に、認証トークンとMCPの操作許可を適用します。LAN直結は暗号化されないHTTP接続です。tailnet経由はTailscaleで保護されます。利用するネットワークとファイアウォールの設定を確認してください。'
              : '')
          }
          {...settingAnchor('codex', 'connectionScope')}
        >
          <select
            aria-label="接続範囲"
            value={state.connectionScope}
            disabled={busy}
            onChange={(e) =>
              void run({ kind: 'setConnectionScope', scope: e.target.value as 'local' | 'network' })
            }
          >
            <option value="local">このPCのみ</option>
            <option value="network">ネットワークからも接続可能（IPv4）</option>
          </select>
        </SettingsField>
        {state.enabled && !state.running && (
          <div className="settings-actions">
            <button disabled={busy} onClick={() => void run({ kind: 'retryStart' })}>
              接続を再試行
            </button>
          </div>
        )}
        <SettingsField
          title="操作できる範囲"
          hint="AppletとMCPの許可を別々に設定できます。"
          {...settingAnchor('codex', 'permissions')}
        >
          <div className="settings-actions">
            <button onClick={onOpenPermissions}>操作の許可を開く</button>
          </div>
        </SettingsField>
      </SettingsSection>
      <SettingsSection
        title="Codexへ登録"
        description={[
          !state.running ? '先に「連携を有効にする」をオンにしてください。' : '',
          file !== state.configFile
            ? '変更した設定ファイルの場所を保存してから登録してください。'
            : '',
          '登録後はCodexを再読み込みまたは再起動し、新しいチャットで「AppDockの状態を確認して」と依頼してください。',
          '接続テストはAppDock内の疎通確認です。最終接続日時はCodex以外のMCPクライアントも含みます。Codexでの操作や別端末からの疎通は、それぞれのクライアントで確認してください。',
        ]
          .filter(Boolean)
          .join(' ')}
        hint="このPCのCodexにMCPでのAppDockの接続情報を追加します。"
        {...settingAnchor('codex', 'registration')}
      >
        <div className="settings-actions">
          <button
            className="primary"
            disabled={busy || !state.running || file !== state.configFile}
            onClick={() => void run({ kind: 'register' })}
          >
            {state.registration === 'registered' ? '登録を修復' : 'Codexへ登録'}
          </button>
          <button disabled={busy || !state.running} onClick={() => void run({ kind: 'test' })}>
            このPC内の接続テスト
          </button>
        </div>
      </SettingsSection>
      <SettingsSection
        title="ネットワークからの接続"
        description={
          state.connectionScope !== 'network'
            ? '接続範囲を「ネットワークからも接続可能」にすると利用できます。'
            : !state.running
              ? 'MCPは停止中です。'
              : state.networkEndpoints.length === 0
                ? 'ネットワークの接続先候補がありません。ネットワーク接続を確認してください。'
                : undefined
        }
        hint="別端末のMCPクライアントへ、Streamable HTTPの接続先とBearerトークンを設定します。"
        {...settingAnchor('codex', 'network')}
      >
        {state.connectionScope === 'network' &&
          state.running &&
          state.networkEndpoints.length > 0 && (
            <SettingsField
              title="ネットワークの接続先候補"
              hint="接続できるかどうかは、利用する端末から確認してください。"
            >
              {state.networkEndpoints.map((endpoint) => (
                <div key={endpoint} className="settings-actions codex-network-endpoint">
                  <SettingsInput aria-label={`接続先 ${endpoint}`} readOnly value={endpoint} />
                  <button
                    disabled={busy}
                    onClick={() => void run({ kind: 'copyEndpoint', endpoint })}
                  >
                    接続先をコピー
                  </button>
                </div>
              ))}
            </SettingsField>
          )}
        <SettingsField
          title="接続トークン"
          description="接続トークンはOSのクリップボードへコピーします。同じトークンを使うクライアントは、操作許可とAI・読み上げのジョブ管理を共有します。"
        >
          <div className="settings-actions">
            <button disabled={busy} onClick={() => void run({ kind: 'status' })}>
              接続の状態を再読み込み
            </button>
            <button
              disabled={busy || !state.canCopyToken}
              onClick={() => void run({ kind: 'copyToken' })}
            >
              接続トークンをコピー
            </button>
          </div>
        </SettingsField>
        <SettingsSection
          variant="group"
          title="認証の設定例"
          description="通常はどちらか一方を設定します。環境変数名は接続元アプリの指定と一致させてください。ヘッダーの値にMCP_BEARER_TOKENと書くだけでは、トークンに置き換わりません。"
          hint="「接続トークンをコピー」で取得したトークンを、接続元アプリの方式に合わせて設定してください。"
        >
          <SettingsField
            title="環境変数を使う場合"
            description={
              <>
                Bearerトークンを設定する環境変数の名前：<code>MCP_BEARER_TOKEN</code>（例）
                <br />
                接続元アプリが参照できる環境変数に、コピーしたトークンだけを保存します。
                <code>Bearer </code>
                は付けません。環境変数を追加・変更したら、接続元アプリを再起動してください。
              </>
            }
          />
          <SettingsField
            title="ヘッダーを直接設定する場合"
            description={
              <>
                ヘッダーのキー：<code>Authorization</code>
                <br />
                ヘッダーの値：<code>{'Bearer <コピーしたトークン>'}</code>
                <br />
                <code>Bearer</code>の後に半角スペースを1つ入れ、
                <code>{'<コピーしたトークン>'}</code>を実際のトークンに置き換えます。
              </>
            }
          />
        </SettingsSection>
      </SettingsSection>
      <SettingsSection
        title="登録先や接続の詳細"
        hint="設定ファイル・登録名・ポートの変更や、登録の解除ができます。"
        collapsible
        {...settingAnchor('codex', 'connection')}
      >
        <SettingsField
          title="追加の接続先ホスト名"
          hint="IPアドレスで接続する場合は不要です。MagicDNSの完全名やDNS別名をShift+Enterで1行ずつ指定します。Enterか入力欄を離れる操作で保存します（16件まで）。"
        >
          <SettingsTextarea
            aria-label="追加の接続先ホスト名"
            value={hostnames}
            rows={3}
            disabled={busy}
            spellCheck={false}
            onChange={(e) => {
              setHostnames(e.target.value);
              saveHostnames(e.target.value);
            }}
          />
        </SettingsField>
        <SettingsField
          title="Codexの設定ファイル"
          hint="通常は初期表示の場所を使います。"
          description="別PCやWSLはこの画面の登録対象ではありません。"
        >
          <SettingsInput
            aria-label="Codexの設定ファイル"
            commitOn="input"
            value={file}
            disabled={busy}
            spellCheck={false}
            onChange={(e) => setFile(e.target.value)}
          />
          <div className="settings-actions">
            <button
              disabled={busy || !file.trim() || file === state.configFile}
              onClick={() => void run({ kind: 'selectConfig', file })}
            >
              設定先を変更
            </button>
          </div>
        </SettingsField>
        <SettingsField
          title="Codexへの登録名"
          hint="複数のAppDockを使う場合は別の名前にします。"
          description="登録済みの名前を変更する前に、登録を解除してください。"
        >
          <SettingsInput
            aria-label="Codexへの登録名"
            commitOn="input"
            value={name}
            maxLength={64}
            disabled={busy}
            spellCheck={false}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="settings-actions">
            <button
              disabled={busy || !name.trim() || name === state.serverId}
              onClick={() => void run({ kind: 'selectName', name })}
            >
              登録名を保存
            </button>
          </div>
        </SettingsField>
        <SettingsField
          title="接続ポート"
          hint="0を指定すると空きポートを選んで保存します。"
          description={`変更後は登録を修復してください。このPCの接続先: ${state.endpoint || '連携を有効にすると決まります'}`}
        >
          <SettingsInput
            type="number"
            min={0}
            max={65535}
            step={1}
            aria-label="接続ポート"
            commitOn="input"
            value={port}
            disabled={busy}
            onChange={(e) => setPort(e.target.value)}
          />
          <div className="settings-actions">
            <button
              disabled={
                busy || !/^\d+$/.test(port) || Number(port) > 65535 || Number(port) === state.port
              }
              onClick={() => configure(state.enabled, state.allowWrite, Number(port))}
            >
              ポートを適用
            </button>
          </div>
        </SettingsField>
        <SettingsField
          title="認証と登録の管理"
          description="認証情報の再発行後はCodexの登録を修復し、他のMCPクライアントのトークンも更新してください。接続トークンはCodexのローカル設定にも保存されます。"
        >
          <div className="settings-actions">
            <button
              disabled={busy || !state.port}
              onClick={() => void run({ kind: 'rotateToken' })}
            >
              認証情報を再発行
            </button>
            <button
              disabled={busy || state.registration === 'absent'}
              onClick={() => void run({ kind: 'unregister' })}
            >
              登録を解除
            </button>
          </div>
        </SettingsField>
      </SettingsSection>
    </section>
  );
}

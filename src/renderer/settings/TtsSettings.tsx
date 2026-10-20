import { useState, useEffect, useRef } from 'react';
import type { SettingsControlEditor } from '../settings-ui/api';
import type { SettingsPageAuxiliary } from '../../shared/settings-page';
import { defaultTtsSettings, type TtsSettings, type TtsVoice } from '../../shared/tts';
import { settingAnchor } from '../settings-ui/setting-anchor';
import { SettingsInput, SettingsTextarea, SettingsUrlInput } from '../settings-ui/SettingsInput';
import { SettingsSection, SettingsField, SettingsFeedback } from '../settings-ui/SettingsSections';

export function TtsSettingsForm({
  editor,
  auxiliary,
  invoke,
  busy,
}: {
  editor: SettingsControlEditor;
  auxiliary?: SettingsPageAuxiliary['tts'];
  invoke(name: string, args?: unknown[]): Promise<any>;
  busy: boolean;
}) {
  const value = editor.value.tts ?? defaultTtsSettings();
  const [key, setKey] = useState('');
  const [text, setText] = useState('');
  const [voices, setVoices] = useState<TtsVoice[]>([]);
  const [models, setModels] = useState<TtsVoice[]>([]);
  const [manual, setManual] = useState<string>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const operation = useRef(false);
  const signature = JSON.stringify([
    value.baseUrl,
    value.voicesSource,
    value.voicesPath,
    value.manualVoices,
    auxiliary?.apiKeyConfigured,
  ]);
  const current = useRef(signature);
  current.current = signature;
  useEffect(() => {
    setVoices([]);
    setModels([]);
  }, [signature]);
  useEffect(() => {
    setKey('');
  }, [value.baseUrl]);
  useEffect(() => {
    setManual(undefined);
  }, [JSON.stringify(value.manualVoices)]);
  const change = (patch: Partial<TtsSettings>) =>
    editor.edit({ ...editor.value, tts: { ...value, ...patch } });
  const run = async (action: () => Promise<void>) => {
    if (operation.current) return;
    operation.current = true;
    setPending(true);
    setError('');
    setMessage('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      operation.current = false;
      setPending(false);
    }
  };
  const load = (kind: 'models' | 'voices') =>
    void run(async () => {
      (kind === 'models' ? setModels : setVoices)([]);
      const started = current.current;
      const result = await invoke(kind === 'models' ? 'ttsModels' : 'ttsVoices');
      if (started !== current.current) return;
      const items = result[kind] as TtsVoice[];
      (kind === 'models' ? setModels : setVoices)(items);
      setMessage(
        items.length
          ? `${items.length}件の${kind === 'models' ? 'モデル' : 'ボイス'}を取得しました。候補から選ぶか、IDを直接入力できます。`
          : '一覧は空でした。IDを直接入力できます。',
      );
    });
  const active = auxiliary?.jobs.some((j) =>
    ['queued', 'generating', 'waitingPlayback', 'playing'].includes(j.state),
  );
  return (
    <div className="settings-sections tts-settings" aria-label="読み上げ">
      <SettingsSection
        title="TTS接続先"
        hint="使用するTTSサーバーを設定します。APIキーが不要なサーバーでは空欄のまま使えます。"
      >
        <SettingsField
          title="APIのURL"
          hint="サーバーのベースURLを入力します。"
          {...settingAnchor('tts', 'baseUrl')}
        >
          <SettingsUrlInput
            aria-label="APIのURL"
            value={value.baseUrl}
            placeholder="http://host:8080/v1"
            spellCheck={false}
            onChange={(e) => change({ baseUrl: e.target.value })}
          />
        </SettingsField>
        <SettingsField
          title="APIキー"
          description="このPCだけに暗号化保存します。接続先を変更したら再設定してください。"
          {...settingAnchor('tts', 'apiKey')}
        >
          <SettingsInput
            aria-label="APIキー"
            commitOn="input"
            type="password"
            autoComplete="off"
            value={key}
            placeholder={
              auxiliary?.apiKeyConfigured ? '設定済み・変更する場合だけ入力' : '未設定・認証なし'
            }
            onChange={(e) => setKey(e.target.value)}
          />
          <div className="settings-actions">
            <button
              disabled={busy || pending || !key || !value.baseUrl}
              onClick={() =>
                void run(async () => {
                  await invoke('ttsSetKey', [key]);
                  setKey('');
                  setModels([]);
                  setVoices([]);
                })
              }
            >
              APIキーを設定
            </button>
            <button
              disabled={busy || pending || (!auxiliary?.apiKeyConfigured && !auxiliary?.error)}
              onClick={() =>
                void run(async () => {
                  await invoke('ttsSetKey', ['']);
                  setKey('');
                  setModels([]);
                  setVoices([]);
                })
              }
            >
              APIキーを削除
            </button>
          </div>
        </SettingsField>
      </SettingsSection>
      <SettingsSection
        title="モデルと声"
        hint="候補を取得して選択するか、サーバーで使えるIDを直接入力します。"
      >
        <SettingsField
          title="TTSモデル"
          hint="一覧には音声生成以外のモデルも含まれる場合があります。TTS対応のモデルを選んでください。"
          {...settingAnchor('tts', 'model')}
        >
          <SettingsInput
            aria-label="TTSモデル"
            list="tts-models"
            value={value.model}
            placeholder="モデルID"
            onChange={(e) => change({ model: e.target.value })}
          />
          <datalist id="tts-models">
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </datalist>
          {models.length > 0 && (
            <select
              aria-label="取得したTTSモデル"
              value={models.some((m) => m.id === value.model) ? value.model : ''}
              onChange={(e) => {
                if (e.target.value) change({ model: e.target.value });
              }}
            >
              <option value="">一覧から選択…</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
          <div className="settings-actions">
            <button disabled={busy || pending || !value.baseUrl} onClick={() => load('models')}>
              モデル一覧を更新
            </button>
          </div>
        </SettingsField>
        <SettingsField
          title="既定のボイス"
          hint="通常の読み上げで使う声です。"
          {...settingAnchor('tts', 'defaultVoice')}
        >
          <SettingsInput
            aria-label="既定のボイス"
            list="tts-voices"
            value={value.defaultVoice}
            placeholder="ボイスID"
            onChange={(e) => change({ defaultVoice: e.target.value })}
          />
          <datalist id="tts-voices">
            {voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </datalist>
          {voices.length > 0 && (
            <select
              aria-label="取得したボイス"
              value={voices.some((v) => v.id === value.defaultVoice) ? value.defaultVoice : ''}
              onChange={(e) => {
                if (e.target.value) change({ defaultVoice: e.target.value });
              }}
            >
              <option value="">一覧から選択…</option>
              {voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          )}
          <div className="settings-actions">
            <button
              disabled={busy || pending || (value.voicesSource === 'endpoint' && !value.baseUrl)}
              onClick={() => load('voices')}
            >
              ボイス一覧を更新
            </button>
          </div>
        </SettingsField>
        <SettingsField
          title="読み上げ速度"
          hint="1が標準速度です。0.25〜4の範囲で調整できます。"
          {...settingAnchor('tts', 'defaultSpeed')}
        >
          <SettingsInput
            aria-label="読み上げ速度"
            type="number"
            min={0.25}
            max={4}
            step={0.05}
            value={value.defaultSpeed}
            onChange={(e) =>
              change({ defaultSpeed: e.target.value.trim() ? Number(e.target.value) : NaN })
            }
          />
        </SettingsField>
        <SettingsFeedback busy={pending} error={error || auxiliary?.error} message={message} />
      </SettingsSection>
      <SettingsSection
        title="試聴"
        description="保存済みのモデル・声・速度で確認します。入力した文章はサーバーへ送信されますが、保存されません。"
        {...settingAnchor('tts', 'preview')}
      >
        <SettingsField title="試聴するテキスト">
          <SettingsTextarea
            aria-label="試聴するテキスト"
            commitOn="input"
            value={text}
            placeholder="読み上げたい文章を入力…"
            onChange={(e) => setText(e.target.value)}
          />
          <div className="settings-actions">
            <button
              className="primary"
              disabled={
                busy ||
                pending ||
                active ||
                !text.trim() ||
                !value.baseUrl ||
                !value.model ||
                !value.defaultVoice
              }
              onClick={() =>
                void run(async () => {
                  await invoke('ttsPreview', [text, crypto.randomUUID()]);
                })
              }
            >
              試聴する
            </button>
            <button
              disabled={pending}
              onClick={() =>
                void run(async () => {
                  await invoke('ttsStop');
                })
              }
            >
              すべての読み上げを停止
            </button>
          </div>
          {(!value.baseUrl || !value.model || !value.defaultVoice) && (
            <p>接続先・モデル・声を設定すると試聴できます。</p>
          )}
          {auxiliary?.jobs.slice(-1).map((j) => (
            <p key={j.jobId} role="status">
              {
                {
                  queued: '待機中',
                  generating: '生成中',
                  waitingPlayback: '再生待ち',
                  playing: '再生中',
                  completed: '完了',
                  failed: '失敗',
                  canceled: '取消',
                }[j.state]
              }
              {j.error ? '：' + j.error.message : ''}
            </p>
          ))}
        </SettingsField>
      </SettingsSection>
      <SettingsSection
        title="サーバーに合わせた詳細設定"
        hint="速度の適用先や、ボイス一覧の取得方法を調整できます。"
        collapsible
      >
        <SettingsField title="速度の適用先" {...settingAnchor('tts', 'speedMode')}>
          <select
            aria-label="速度の適用先"
            value={value.speedMode}
            onChange={(e) => change({ speedMode: e.target.value as TtsSettings['speedMode'] })}
          >
            <option value="playback">AppDockで再生速度を変更</option>
            <option value="server">サーバーで生成速度を変更</option>
          </select>
        </SettingsField>
        <SettingsField title="ボイス一覧の取得方式" {...settingAnchor('tts', 'voicesSource')}>
          <select
            aria-label="ボイス一覧の取得方式"
            value={value.voicesSource}
            onChange={(e) =>
              change({ voicesSource: e.target.value as TtsSettings['voicesSource'] })
            }
          >
            <option value="endpoint">サーバーから取得</option>
            <option value="manual">手動一覧</option>
          </select>
        </SettingsField>
        <SettingsField
          title="ボイス一覧のパス"
          hint="サーバーから取得する場合に使う、ベースURL配下の相対パスです。"
          {...settingAnchor('tts', 'voicesPath')}
        >
          <SettingsInput
            aria-label="ボイス一覧のパス"
            value={value.voicesPath}
            onChange={(e) => change({ voicesPath: e.target.value })}
          />
        </SettingsField>
        <SettingsField
          title="手動ボイス一覧"
          hint="idとnameを持つJSON配列です。取得方式を「手動一覧」にすると使用します。"
          {...settingAnchor('tts', 'manualVoices')}
        >
          <SettingsTextarea
            aria-label="手動ボイス一覧"
            value={manual ?? JSON.stringify(value.manualVoices, null, 2)}
            onChange={(e) => {
              const v = e.target.value;
              setManual(v);
              try {
                change({ manualVoices: JSON.parse(v) });
                setError('');
              } catch {
                setError('手動ボイス一覧をJSON配列で入力してください。');
              }
            }}
          />
        </SettingsField>
      </SettingsSection>
    </div>
  );
}

import { useSettingsFeedback } from '../settings-ui/SettingsStatus';
import { useEffect, useState, useRef } from 'react';
import type { SettingsPageAuxiliary } from '../../shared/settings-page';
import type { TtsVoice } from '../../shared/tts';
import { resolveNotificationSpeech } from '../../shared/notification-types';
import type { FormEditor } from './SettingsForm';
import type {
  NotificationPreference,
  NotificationTypeEntry,
} from '../../shared/notification-types';
import {
  notificationTypeKey,
  notificationSettingKey,
  resolveNotificationPolicy,
} from '../../shared/notification-types';
import { settingAnchor } from '../settings-ui/setting-anchor';
import { SettingsInput } from '../settings-ui/SettingsInput';
import { SettingsCombobox } from '../settings-ui/SettingsCombobox';
import { Toggle } from '../settings-ui/Toggle';
import {
  SettingsSection,
  SettingsField,
  SettingsChoice,
  SettingsActions,
} from '../settings-ui/SettingsSections';
const targetTitles = { banner: 'バナー', desktop: 'デスクトップ通知', windows: 'Windows通知' };
const ownerGroup = (type: NotificationTypeEntry) =>
  type.ownerKind === 'host' ? 'host' : JSON.stringify([type.ownerKind, type.ownerId]);
const reasonTitles: Record<string, string> = {
  'type-definition-changed': '通知種類の仕様が変わりました。設定を確認してください。',
};
export function NotificationSettings({
  editor,
  types,
  auxiliary,
  invoke,
  busy,
  select,
}: {
  editor: FormEditor;
  types: NotificationTypeEntry[];
  auxiliary?: SettingsPageAuxiliary['notificationSpeech'];
  invoke(name: string, args?: unknown[]): Promise<any>;
  busy: boolean;
  select(id: string): void;
}) {
  const settings = editor.value;
  const speech = settings.notificationPreferences?.speech ?? {};
  const effective = resolveNotificationSpeech(settings, auxiliary?.defaults);
  const voiceListRevision = useRef(auxiliary?.voiceListRevision);
  voiceListRevision.current = auxiliary?.voiceListRevision;
  const [voices, setVoices] = useState<TtsVoice[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [voiceOverride, setVoiceOverride] = useState(false);
  useEffect(() => {
    setVoices([]);
  }, [auxiliary?.voiceListRevision]);
  useEffect(() => {
    setVoiceOverride(false);
  }, [speech.voice]);
  const changeSpeech = (key: 'voice' | 'speed', value?: string | number) => {
    const next = { ...speech };
    if (value === undefined) delete next[key];
    else (next as any)[key] = value;
    editor.edit({
      ...settings,
      notificationPreferences: {
        ...settings.notificationPreferences,
        overrides: settings.notificationPreferences?.overrides ?? [],
        speech: next,
      },
    });
  };
  const run = async (name: string, args?: unknown[]) => {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      return await invoke(name, args);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };
  const previewActive = auxiliary?.jobs.some((j) =>
    ['queued', 'generating', 'waitingPlayback', 'playing'].includes(j.state),
  );
  const overrides = settings.notificationPreferences?.overrides ?? [];
  const change = (type: NotificationTypeEntry, patch: Partial<NotificationPreference>) => {
    const key = notificationTypeKey(type),
      current = overrides.find((r) => notificationTypeKey(r) === key);
    const next = overrides.filter((r) => notificationTypeKey(r) !== key);
    const updated: NotificationPreference = {
      ownerKind: type.ownerKind,
      ownerId: type.ownerId,
      typeId: type.typeId,
      ...current,
      ...patch,
    };
    // Keep edits valid when an older saved preference lacks newly required controls.
    if (updated.targets && type.requiredTargets.length)
      updated.targets = [...new Set([...updated.targets, ...type.requiredTargets])];
    next.push(updated);
    editor.edit({
      ...settings,
      notificationPreferences: { ...settings.notificationPreferences, overrides: next },
    });
  };
  const owners = [...new Set(types.map(ownerGroup))];
  const unknown = overrides.filter(
    (r) => !types.some((t) => notificationTypeKey(t) === notificationTypeKey(r)),
  );
  const previewJob = auxiliary?.jobs.at(-1);
  const previewState =
    previewJob &&
    {
      queued: '待機中',
      generating: '生成中',
      waitingPlayback: '再生待ち',
      playing: '再生中',
      completed: '完了',
      failed: '失敗',
      canceled: '取消',
    }[previewJob.state];
  useSettingsFeedback({ busy: pending, error });
  return (
    <div className="settings-sections notification-settings">
      <SettingsSection
        title="通知の受け取り方"
        hint="種類ごとに通知先を組み合わせて設定できます。"
        collapsible
      >
        <SettingsField title="通知センター" description="全ての通知を確認できます。" />
        <SettingsField title="バナー" description="画面上部に表示されます。" />
        <SettingsField title="デスクトップ通知" description="タスクトレイ付近に表示されます。" />
        <SettingsField
          title="Windows通知"
          description="Windowsが表示・持続時間などを管理するため、自動消去までの秒数の設定は反映されません。"
        />
        <SettingsField title="読み上げ" description="接続先・モデル・声の設定が必要です。" />
        <SettingsField
          title="MCP Event"
          description="ChatGPT Work/Dotsのイベントトリガーとして使用します。Secure MCP Tunnel等を使用して、ChatGPTからプラグインとしてAppDockを使用するための連携が必要です。"
        />
      </SettingsSection>
      <SettingsSection
        title="読み上げ"
        description={`現在の声: ${effective.voice || '未設定'} ／ 速度: ${effective.speed}倍`}
        collapsible
      >
        <SettingsField
          title="TTS設定"
          description="通知のタイトルと本文は共通設定のTTSサーバーへ送信されます。接続先・モデル・声を設定してください。"
        >
          <SettingsActions>
            <button onClick={() => select('tts')}>設定を開く</button>
          </SettingsActions>
        </SettingsField>
        <SettingsField
          title="声"
          description={`現在の声: ${effective.voice || '未設定'}`}
          hint="共通の声を使うか、通知だけ別の声に変更できます。"
          {...settingAnchor('notifications', 'speech.voice')}
        >
          <SettingsActions>
            <Toggle
              label="通知の声に共通設定を使う"
              checked={speech.voice === undefined && !voiceOverride}
              onChange={(inherit) => {
                setVoiceOverride(!inherit);
                if (inherit) changeSpeech('voice');
                else if (effective.voice) changeSpeech('voice', effective.voice);
              }}
            />
            <span>共通設定を使う</span>
          </SettingsActions>
          {(speech.voice !== undefined || voiceOverride) && (
            <>
              <SettingsCombobox
                label="通知用のボイスID"
                value={speech.voice ?? ''}
                onChange={(value) => changeSpeech('voice', value)}
                options={voices}
              />
              <SettingsActions>
                <button
                  disabled={busy || pending}
                  onClick={() => {
                    const revision = auxiliary?.voiceListRevision;
                    void run('notificationVoices').then((v) => {
                      if (v && revision === voiceListRevision.current) setVoices(v.voices);
                    });
                  }}
                >
                  ボイス一覧を更新
                </button>
              </SettingsActions>
            </>
          )}
        </SettingsField>
        <SettingsField
          title="速度"
          description={`現在の速度: ${effective.speed}`}
          hint="1倍が標準速度です。"
          {...settingAnchor('notifications', 'speech.speed')}
        >
          <SettingsActions>
            <Toggle
              label="通知の速度に共通設定を使う"
              checked={speech.speed === undefined}
              onChange={(inherit) => changeSpeech('speed', inherit ? undefined : effective.speed)}
            />
            <span>共通設定を使う</span>
          </SettingsActions>
          {speech.speed !== undefined && (
            <SettingsInput
              type="number"
              min={0.25}
              max={4}
              step={0.05}
              aria-label="通知用の読み上げ速度"
              value={speech.speed}
              onChange={(e) =>
                changeSpeech('speed', e.target.value.trim() ? Number(e.target.value) : NaN)
              }
            />
          )}
        </SettingsField>
        <SettingsField
          title="試聴"
          description={
            !auxiliary?.configured || !effective.voice
              ? '読み上げには、接続先・モデル・声の設定が必要です。'
              : (previewState ?? '通知の読み上げを試聴できます。')
          }
          error={previewJob?.error?.message}
        >
          <SettingsActions {...settingAnchor('notifications', 'speech.preview')}>
            <button
              className="primary"
              disabled={
                busy || pending || previewActive || !auxiliary?.configured || !effective.voice
              }
              onClick={() => void run('notificationPreview', [crypto.randomUUID()])}
            >
              通知の読み上げを試聴
            </button>
            <button
              disabled={pending || !previewActive}
              onClick={() => void run('notificationPreviewStop')}
            >
              試聴を停止
            </button>
          </SettingsActions>
        </SettingsField>
      </SettingsSection>
      <SettingsSection
        title="MCP Event"
        hint="ChatGPT Work/Dotsのイベントトリガーとして使用するための機能です。"
        collapsible
      >
        <SettingsField
          title="MCP連携設定"
          description="MCP Eventを使用するには、MCPサーバーの設定と連携が必要です。"
        >
          <SettingsActions>
            <button onClick={() => select('codex')}>設定を開く</button>
          </SettingsActions>
        </SettingsField>
      </SettingsSection>
      {owners.map((owner) => {
        const rows = types.filter((t) => ownerGroup(t) === owner);
        return (
          <SettingsSection
            key={owner}
            variant="card"
            title={rows[0].ownerTitle}
            aria-label={rows[0].ownerTitle + 'の通知'}
          >
            {rows.map((type) => {
              const policy = resolveNotificationPolicy(type, settings);
              const row = overrides.find(
                (r) => notificationTypeKey(r) === notificationTypeKey(type),
              );
              const speaking = row?.speak === true;
              const eventSending = row?.mcpEvents === true;
              const delivery = policy.selectedTargets.map((target) => targetTitles[target]);
              const deliverySummary = delivery.length
                ? delivery.join('・')
                : eventSending
                  ? speaking
                    ? '音声・MCP Eventsのみ'
                    : 'MCP Eventsのみ'
                  : speaking
                    ? '音声のみ'
                    : '通知センターのみ';
              const duration =
                type.lifetimePolicy === 'condition'
                  ? '問題が解消するまで'
                  : policy.durationSeconds === null
                    ? '閉じるまで表示'
                    : `表示時間: ${policy.durationSeconds}秒`;
              const summary = [
                deliverySummary,
                duration,
                `読み上げ: ${speaking ? 'ON' : 'OFF'}`,
                `MCP Events: ${eventSending ? 'ON' : 'OFF'}`,
              ].join(' ／ ');
              return (
                <SettingsSection
                  variant="row"
                  title={type.title}
                  hint={type.description}
                  description={[
                    summary,
                    type.ownerKind === 'applet' &&
                    !['starting', 'running'].includes(type.ownerState)
                      ? 'Appletは停止中です。通知設定を編集できます。'
                      : '',
                    policy.reason ? (reasonTitles[policy.reason] ?? policy.reason) : '',
                  ]
                    .filter(Boolean)
                    .join(' ／ ')}
                  collapsible
                  className="notification-setting-card"
                  key={notificationTypeKey(type)}
                  {...settingAnchor('notifications', notificationSettingKey(type))}
                >
                  <SettingsField title="通知先" className="settings-field-wide">
                    <div className="settings-choice-grid">
                      {type.allowedTargets.map((target) => (
                        <SettingsChoice
                          key={target}
                          label={targetTitles[target]}
                          ariaLabel={type.title + 'の' + targetTitles[target]}
                          checked={policy.selectedTargets.includes(target)}
                          disabled={type.requiredTargets.includes(target)}
                          description={
                            type.requiredTargets.includes(target) ? 'この通知では必須' : undefined
                          }
                          onChange={(on) =>
                            change(type, {
                              targets: on
                                ? [...policy.selectedTargets, target]
                                : policy.selectedTargets.filter((t) => t !== target),
                            })
                          }
                        />
                      ))}
                      <SettingsChoice
                        label="読み上げ"
                        description="タイトルと本文を音声で通知"
                        ariaLabel={type.title + 'を読み上げる'}
                        checked={speaking}
                        onChange={(speak) => change(type, { speak })}
                      />
                      <SettingsChoice
                        label="MCP Events"
                        description="購読中のdot等へタイトルと本文を送信。OFF中は送信を止め、購読は有効期限まで保持"
                        ariaLabel={type.title + 'をMCP Eventsで送信'}
                        checked={eventSending}
                        onChange={(mcpEvents) => change(type, { mcpEvents })}
                      />
                    </div>
                    <SettingsChoice
                      label="通知センターのみ"
                      ariaLabel={type.title + 'の通知センターのみ'}
                      checked={!policy.selectedTargets.length && !speaking && !eventSending}
                      disabled={!!type.requiredTargets.length}
                      onChange={(on) => {
                        if (on) change(type, { targets: [], speak: false, mcpEvents: false });
                      }}
                    />
                  </SettingsField>
                  {speaking && (!auxiliary?.configured || !effective.voice) && (
                    <SettingsField
                      title="読み上げ設定"
                      description="読み上げには接続先・モデル・声の設定が必要です。"
                    >
                      <button onClick={() => select('tts')}>読み上げ設定を開く</button>
                    </SettingsField>
                  )}
                  {type.lifetimePolicy === 'userDuration' ? (
                    <SettingsField
                      title="自動消去までの秒数"
                      hint="1〜86,400秒。空欄なら閉じるまで表示します。"
                    >
                      <SettingsInput
                        type="text"
                        inputMode="numeric"
                        aria-label={type.title + 'の表示時間'}
                        placeholder="閉じるまで表示"
                        value={
                          row?.durationSeconds === undefined
                            ? (type.defaultDurationSeconds ?? '')
                            : (row.durationSeconds ?? '')
                        }
                        onChange={(e) => {
                          const value = e.target.value;
                          change(type, {
                            durationSeconds: (value === ''
                              ? null
                              : /^\d+$/.test(value)
                                ? Number(value)
                                : value) as number | null,
                          });
                        }}
                      />
                    </SettingsField>
                  ) : (
                    <SettingsField
                      title="表示時間"
                      description={
                        type.lifetimePolicy === 'condition'
                          ? '問題が解消するまで表示します。'
                          : '閉じるまで表示します。'
                      }
                    />
                  )}
                </SettingsSection>
              );
            })}
          </SettingsSection>
        );
      })}
      <SettingsSection title="通知の表示時間について" collapsible>
        <SettingsField
          title="変更の反映"
          description="表示時間の変更は次の通知から反映されます。現在表示中の通知の期限は変わりません。"
        />
        <SettingsField
          title="Windows通知"
          description="Windowsが表示・持続時間などを管理するため、自動消去までの秒数の設定は反映されません。ここで指定する表示時間は、通知センターで操作できる期間に反映されます。"
        />
      </SettingsSection>
      {!!unknown.length && (
        <SettingsSection
          title="現在利用できない種類"
          description="再導入に備えて、以前の設定を保持しています。"
          aria-label="現在利用できない通知種類"
          collapsible
        >
          {unknown.map((row) => (
            <SettingsField key={notificationTypeKey(row)} title={row.ownerId + ' / ' + row.typeId}>
              <SettingsActions>
                <button
                  onClick={() =>
                    editor.edit({
                      ...settings,
                      notificationPreferences: {
                        ...settings.notificationPreferences,
                        overrides: overrides.filter(
                          (r) => notificationTypeKey(r) !== notificationTypeKey(row),
                        ),
                      },
                    })
                  }
                >
                  この種類の設定を削除
                </button>
              </SettingsActions>
            </SettingsField>
          ))}
        </SettingsSection>
      )}
    </div>
  );
}

export type SettingsIssueKind =
  | 'read-invalid'
  | 'read-unavailable'
  | 'save-failed'
  | 'backup-failed'
  | 'apply-failed'
  | 'launch-save-failed';

export const settingsIssueMessages: Record<SettingsIssueKind, string> = {
  'read-invalid':
    'settings.jsonの形式が不正です。ファイルを修正するか、正常な設定から復元してください。再起動だけでは修復されません。',
  'read-unavailable':
    'settings.jsonを読み込めません。ファイルの有無、アクセス権、使用中のアプリを確認してください。',
  'save-failed':
    '設定の保存を完了できませんでした。保存先の空き容量とアクセス権を確認し、再起動後に設定し直してください。',
  'backup-failed':
    'このPCの正常設定バックアップ、または破損ファイルの退避を保存できません。空き容量とアクセス権を確認してください。',
  'apply-failed':
    '保存済み設定を実行中の機能へ反映できませんでした。対象機能の状態を確認して再起動してください。',
  'launch-save-failed':
    'Windowsの起動設定の変更または復元に失敗しました。一般設定で登録状態を確認して再起動してください。',
};
const applyMessages: Record<string, string> = {
  'apply-hotkeys':
    'グローバルショートカットを登録できませんでした。ほかのアプリとの競合やショートカット設定を確認して再起動してください。',
  'apply-window':
    'テーマ・ウィンドウ・トレイ・WebAppletへの設定反映に失敗しました。設定を確認して再起動してください。',
  'apply-applets':
    'Appletの構成へ設定を反映できませんでした。Appletの状態を確認して再起動してください。',
  'apply-services':
    'AI・読み上げ・通知への設定反映に失敗しました。設定を確認して再起動してください。',
};

export interface SettingsIssue {
  key: string;
  kind: SettingsIssueKind;
  message: string;
  since: number;
  immediate: boolean;
}

/** Operational state only. Never retains settings values or unfinished UI input. */
export class SettingsHealth {
  private issues = new Map<string, SettingsIssue>();
  private generations = new Map<string, number>();
  constructor(
    private changed: () => void,
    private now = Date.now,
  ) {}
  all() {
    return [...this.issues.values()].map((issue) => ({ ...issue }));
  }
  has(key: string) {
    return this.issues.has(key);
  }
  set(key: string, kind: SettingsIssueKind, generation = 0, immediate = true, message?: string) {
    if (generation < (this.generations.get(key) ?? 0)) return;
    this.generations.set(key, generation);
    const previous = this.issues.get(key);
    if (
      previous?.kind === kind &&
      previous.message ===
        (message ||
          (kind === 'apply-failed' && applyMessages[key]) ||
          settingsIssueMessages[kind]) &&
      (previous.immediate || !immediate)
    )
      return;
    this.issues.set(key, {
      key,
      kind,
      message:
        message || (kind === 'apply-failed' && applyMessages[key]) || settingsIssueMessages[kind],
      since: previous?.since ?? this.now(),
      immediate,
    });
    this.changed();
  }
  clear(key: string, generation = 0) {
    if (generation < (this.generations.get(key) ?? 0)) return;
    this.generations.set(key, generation);
    if (this.issues.delete(key)) this.changed();
  }
}

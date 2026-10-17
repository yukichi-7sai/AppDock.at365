import type { SettingsStore, SettingsRecoveryPlan } from './settings';
import { SettingsConflictError } from './settings';

export interface SettingsRecoveryUi {
  confirm(plan: SettingsRecoveryPlan): Promise<boolean>;
  chooseJson(): Promise<string | undefined>;
  openDirectory(): Promise<void>;
  chooseStartupAction(message: string): Promise<'restore' | 'open' | 'reload' | 'quit'>;
}

/** The minimal recovery loop runs before Applets, Shells and settings-dependent services. */
export async function recoverSettingsAtStartup(store: SettingsStore, ui: SettingsRecoveryUi) {
  let message =
    '設定ファイルとこのPCのバックアップを読み込めません。正常なJSONから復元するか、ファイルを修正して再読み込みしてください。再起動だけでは修復されません。';
  for (;;) {
    const choice = await ui.chooseStartupAction(message);
    if (choice === 'quit') return false;
    try {
      if (choice === 'open') {
        await ui.openDirectory();
        continue;
      }
      if (choice === 'reload') {
        store.reload();
        return true;
      }
      const file = await ui.chooseJson();
      if (!file) continue;
      const plan = store.prepareRecovery(file);
      if (!(await ui.confirm(plan))) continue;
      store.restoreRecovery(plan);
      return true;
    } catch (error) {
      // A healthy sync arriving during confirmation also permits a clean relaunch.
      if (error instanceof SettingsConflictError && !store.recovered) return true;
      message =
        error instanceof SettingsConflictError
          ? error.message
          : '復旧を完了できませんでした。JSONの形式、ファイルの大きさ（4MB以下）、保存先の空き容量とアクセス権を確認してください。元のファイルは保持しています。';
    }
  }
}

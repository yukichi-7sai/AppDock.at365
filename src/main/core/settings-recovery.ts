import { hostText } from '../../shared/i18n';
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
  let message = hostText('services.settingsRecovery.recoveryRequired');
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
          : hostText('services.settingsRecovery.failed');
    }
  }
}

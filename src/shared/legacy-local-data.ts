import { hostText } from './i18n';
/** Local UI diagnostics only; never part of synchronized settings or external APIs. */
export interface LegacyLocalDataState {
  targets: string[];
  scanFailed: boolean;
}
export const legacyLocalDataInstructions = hostText('services.sharedLegacyLocalData.guidance');

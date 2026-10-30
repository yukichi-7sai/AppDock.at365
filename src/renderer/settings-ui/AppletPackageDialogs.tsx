import type { AppletPackagePlan } from '../../shared/applet-packages';
import { useHostTranslation } from '../HostTranslation';
import { SettingsDialog } from './SettingsModal';

export type AppletActionInvoker = (name: string, args?: unknown[]) => Promise<any>;

/** A lost handoff response must not cause a second package operation. */
export async function applyAppletPackage(invoke: AppletActionInvoker, id: string) {
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

export function AppletUninstallDialog({
  plan,
  invoke,
  onClose,
}: {
  plan: AppletPackagePlan;
  invoke: AppletActionInvoker;
  onClose(): void;
}) {
  const { t } = useHostTranslation();
  return (
    <SettingsDialog
      title={t('settings.appletManagementSettings.uninstallTitle')}
      applyLabel={t('settings.appletManagementSettings.uninstallRestart')}
      onClose={() => {
        void invoke('discardAppletPackage', [plan.planId]).catch(() => {});
        onClose();
      }}
      onApply={() => applyAppletPackage(invoke, plan.planId)}
    >
      <p>
        {t('settings.appletManagementSettings.uninstallConfirm', {
          name: plan.name,
          version: plan.version,
        })}
      </p>
      <p>{t('settings.appletManagementSettings.uninstallHint')}</p>
      {!!plan.siteCount && (
        <p>{t('settings.appletManagementSettings.sitesHint', { count: plan.siteCount })}</p>
      )}
      {plan.shell && <p>{t('settings.appletManagementSettings.shellFallback')}</p>}
    </SettingsDialog>
  );
}

import { hostText } from '../../shared/i18n';
import type { ExtensionSnapshot, Settings } from '../../shared/contracts';
import { appletManagementCommands, type AppletOperation } from '../../shared/applet-management';
import type { SettingsStore } from './settings';
import { collectionRecord } from '../../shared/page-collections';
import { appletEnabled } from '../../shared/applet-state';

export class AppletManagementError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export class AppletManagement {
  private busy = new Set<string>();
  constructor(
    private options: {
      settings: SettingsStore;
      applets(): ExtensionSnapshot[];
      ready(): boolean;
      reconcile(): Promise<unknown>;
      restart(id: string): Promise<unknown>;
    },
  ) {}
  commands() {
    return appletManagementCommands(this.options.applets()).map((c) => ({
      ...c,
      available: c.available && !this.busy.has(c.appletId),
      unavailableReason:
        c.available && !this.busy.has(c.appletId)
          ? null
          : hostText('services.appletManagement.disabledOrChanging'),
      completion: 'lifecycleApplied' as const,
      permission: 'applets.manage' as const,
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    }));
  }
  has(id: string) {
    return this.commands().some((c) => c.id === id);
  }
  execute(id: string) {
    const command = this.commands().find((c) => c.id === id);
    if (!command)
      throw new AppletManagementError(
        'NOT_FOUND',
        hostText('services.appletManagement.commandMissing'),
      );
    return this.run(command.appletId, command.operation);
  }
  canEditEnabled(id: string) {
    const applet = this.options.applets().find((item) => item.id === id);
    return !!(
      this.options.ready() &&
      applet &&
      applet.sourceKind !== 'builtin' &&
      !this.busy.has(id) &&
      !['starting', 'stopping'].includes(applet.state)
    );
  }
  /** Plan a saved preference; normal settings reconciliation owns the later lifecycle effect. */
  prepareEnabled(id: string, enabled: boolean, next?: Settings) {
    if (typeof enabled !== 'boolean')
      throw new AppletManagementError(
        'INVALID_ARGUMENT',
        hostText('services.appletManagement.invalidOperation'),
      );
    const applet = this.target(id, enabled ? 'enable' : 'disable');
    const value = next ?? structuredClone(this.options.settings.value);
    if (applet.collection) {
      const item = collectionRecord(value, applet.collection);
      if (!item)
        throw new AppletManagementError('NOT_FOUND', hostText('services.appletManagement.missing'));
      item.enabled = enabled;
    } else {
      value.extensions[id] = { ...(value.extensions[id] ?? { settings: {} }), enabled };
    }
    return value;
  }
  private target(id: string, operation: AppletOperation) {
    if (!this.options.ready())
      throw new AppletManagementError(
        'NOT_READY',
        hostText('services.appletManagement.unavailable'),
      );
    if (!['enable', 'disable', 'restart'].includes(operation))
      throw new AppletManagementError(
        'INVALID_ARGUMENT',
        hostText('services.appletManagement.invalidOperation'),
      );
    if (this.busy.has(id))
      throw new AppletManagementError('BUSY', hostText('services.appletManagement.busy'));
    const { settings } = this.options;
    try {
      settings.assertRevision(settings.revision);
    } catch {
      throw new AppletManagementError(
        'CONFLICT',
        hostText('services.appletManagement.settingsChanged'),
      );
    }
    const applet = this.options.applets().find((a) => a.id === id);
    if (!applet)
      throw new AppletManagementError('NOT_FOUND', hostText('services.appletManagement.missing'));
    if (applet.sourceKind === 'builtin' && operation !== 'restart')
      throw new AppletManagementError(
        'UNAVAILABLE',
        hostText('services.appletManagement.defaultShellRequired'),
      );
    if (['starting', 'stopping'].includes(applet.state))
      throw new AppletManagementError('BUSY', hostText('services.appletManagement.changing'));
    if (operation === 'restart' && !applet.enabled)
      throw new AppletManagementError(
        'UNAVAILABLE',
        hostText('services.appletManagement.disabled'),
      );
    return applet;
  }
  async run(id: string, operation: AppletOperation) {
    const applet = this.target(id, operation);
    const { settings } = this.options;
    const savedEnabled = applet.collection
      ? collectionRecord(settings.value, applet.collection).enabled
      : appletEnabled(settings.value, id);
    const changed = operation !== 'restart' && savedEnabled !== (operation === 'enable');
    const next = changed ? this.prepareEnabled(id, operation === 'enable') : undefined;
    this.busy.add(id);
    try {
      if (next) {
        settings.save(next, settings.revision);
        await this.options.reconcile();
      } else if (operation === 'restart') {
        await this.options.restart(id);
      }
      const current = this.options.applets().find((a) => a.id === id);
      if (!current || !['running', 'waiting', 'stopped'].includes(current.state))
        throw new AppletManagementError(
          'LIFECYCLE_FAILED',
          hostText('services.appletManagement.unconfirmed'),
        );
      return {
        changed,
        applet: { id, enabled: current.enabled, state: current.state },
      };
    } finally {
      this.busy.delete(id);
    }
  }
}

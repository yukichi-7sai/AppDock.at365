import type { ExtensionSnapshot, Settings } from '../../shared/contracts';
import type { UiCommand } from '../../shared/commands';

/** Ribbon inputs outlive transient expansion, navigation and badge changes. */
export class RibbonCatalogCache {
  private revision = 0;
  private cached?: {
    settings: Settings;
    context: string;
    value: { applets: ExtensionSnapshot[]; commands: UiCommand[]; revision: number };
  };
  constructor(
    private applets: () => ExtensionSnapshot[],
    private commands: (applets: ExtensionSnapshot[]) => UiCommand[],
  ) {}
  invalidate() {
    this.cached = undefined;
  }
  get(settings: Settings, context: string) {
    if (this.cached?.settings === settings && this.cached.context === context)
      return this.cached.value;
    const applets = this.applets();
    const value = { applets, commands: this.commands(applets), revision: ++this.revision };
    this.cached = { settings, context, value };
    return value;
  }
}

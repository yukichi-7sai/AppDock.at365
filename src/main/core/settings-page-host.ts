import { hostText } from '../../shared/i18n';
import { randomUUID } from 'node:crypto';
import type {
  SettingsPageAction,
  SettingsPageConnection,
  SettingsPageRequest,
} from '../../shared/settings-page';
import type { SettingsPageSession } from './settings-page';

/** One host-owned settings surface, independent of Shell providers and native views. */
export class SettingsPageHost {
  private current?: { id: string; request: SettingsPageRequest; page: SettingsPageSession };
  private opening = 0;
  constructor(
    private options: {
      allowed(request: SettingsPageRequest): boolean;
      create(request: SettingsPageRequest): SettingsPageSession | Promise<SettingsPageSession>;
      flush(): Promise<void>;
      changed(connection: SettingsPageConnection): void;
    },
  ) {}
  async open(request: SettingsPageRequest): Promise<SettingsPageConnection> {
    const sequence = ++this.opening;
    if (!request || !this.options.allowed(request))
      throw Error(hostText('services.settingsPageHost.targetChanged'));
    // The first mount has no UI to acknowledge a flush yet.
    if (this.current) await this.options.flush();
    if (sequence !== this.opening || !this.options.allowed(request))
      throw Error(hostText('services.settingsPageHost.targetChanged'));
    this.close();
    const id = randomUUID();
    const bound = { ...request, id };
    const page = await this.options.create(bound);
    if (sequence !== this.opening || !this.options.allowed(request)) {
      page.dispose();
      throw Error(hostText('services.settingsPageHost.targetChanged'));
    }
    this.current = { id, request: bound, page };
    return { connectionId: id, snapshot: this.current.page.snapshot() };
  }
  private bound(id: string) {
    const current = this.current;
    if (
      !current ||
      current.id !== id ||
      !this.options.allowed(current.request) ||
      !current.page.isCurrent()
    )
      throw Error(hostText('services.settingsPageHost.staleConnection'));
    return current;
  }
  get(id: string) {
    return this.bound(id).page.snapshot();
  }
  async act(id: string, action: SettingsPageAction) {
    const current = this.bound(id);
    const response = await current.page.act(action);
    this.bound(id);
    return response;
  }
  close(id?: string) {
    if (id && this.current?.id !== id) return;
    this.current?.page.dispose();
    this.current = undefined;
  }
  refresh() {
    const current = this.current;
    if (current && this.options.allowed(current.request) && current.page.isCurrent())
      this.options.changed({ connectionId: current.id, snapshot: current.page.snapshot() });
  }
  dispose() {
    this.opening++;
    this.close();
  }
}

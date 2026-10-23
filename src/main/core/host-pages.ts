import type { HostPageAction, HostPageModel, HostPageRequest } from '../../shared/host-pages';
import type { HostPageController } from './host-page-controller';

/** One host-rendered page. There are no provider bindings or native child views. */
export class HostPages {
  private current?: HostPageController;
  private revision = -1;
  constructor(
    private options: {
      route(): string;
      ready(): boolean;
      blocked(): boolean;
      create(request: HostPageRequest): HostPageController;
      changed(model: HostPageModel): void;
    },
  ) {}
  open(request: HostPageRequest): HostPageModel | null {
    if (
      !request ||
      typeof request.id !== 'string' ||
      !request.id ||
      request.id.length > 100 ||
      !['logs', 'notifications', 'image-library'].includes(request.kind)
    )
      throw Error('Invalid host page request');
    // Navigation may still be confirming the renderer's restored route.
    if (request.route !== this.options.route()) return null;
    if (this.current?.id === request.id) {
      if (this.current.kind !== request.kind) throw Error('Host page target changed');
      this.current.update?.(request);
    } else {
      const next = this.options.create(request);
      this.close();
      this.current = next;
    }
    if (!this.options.ready()) return null;
    const model = this.current.snapshot();
    this.revision = model.revision;
    return model;
  }
  get(id?: string): HostPageModel | null {
    const current = this.current;
    if (!current || current.route !== this.options.route()) {
      if (id !== undefined) throw Error('Host page connection is stale');
      return null;
    }
    if (id !== undefined && id !== current.id) throw Error('Host page connection is stale');
    if (!this.options.ready()) return null;
    return current.snapshot();
  }
  async act(action: HostPageAction) {
    const current = this.current;
    if (
      !current ||
      !action ||
      action.id !== current.id ||
      current.route !== this.options.route() ||
      !this.options.ready()
    )
      throw Error('Host page connection is stale');
    if (this.options.blocked() && !current.passive?.(action))
      throw Error('Close the dialog before operating the page');
    try {
      return await current.act(action);
    } finally {
      if (this.current === current) this.refresh();
    }
  }
  close(id?: string) {
    if (id !== undefined && id !== this.current?.id) return;
    this.current?.dispose?.();
    this.current = undefined;
    this.revision = -1;
  }
  refresh() {
    const current = this.current;
    if (!current) return;
    if (current.route !== this.options.route()) {
      this.close();
      return;
    }
    if (!this.options.ready()) return;
    const model = current.snapshot();
    if (model.revision === this.revision) return;
    this.revision = model.revision;
    this.options.changed(model);
  }
  dispose() {
    this.close();
  }
}

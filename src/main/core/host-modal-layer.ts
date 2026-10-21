import type { BrowserWindow, WebContentsView } from 'electron';
import type { HostModalBackdrop } from '../../shared/host-modal';

export interface HostModalRegistration {
  readonly blocked: boolean;
  setVisible(visible: boolean): void;
  dispose(): void;
}

type Surface = { view: WebContentsView; visible: boolean; covered: boolean };

/** Composes registered native surfaces beneath host dialogs, preserving their renderers. */
export class HostModalLayer {
  private surfaces = new Map<WebContentsView, Surface>();
  private active = false;
  private backgroundReady = false;
  private revision = 0;
  private signature = '';

  constructor(
    private window: BrowserWindow,
    private changed?: () => void,
  ) {
    const reset = () => this.setActive(false);
    window.webContents.on('did-start-loading', reset);
    window.webContents.on('render-process-gone', reset);
    window.once('closed', () => this.surfaces.clear());
  }

  get isActive() {
    return this.active;
  }

  /** Update bounds before setVisible, and dispose the registration with its View. */
  register(view: WebContentsView): HostModalRegistration {
    if (this.surfaces.has(view)) throw Error('Modal surface is already registered');
    const surface: Surface = { view, visible: false, covered: this.active && this.backgroundReady };
    this.surfaces.set(view, surface);
    view.setVisible(false);
    let disposed = false;
    const owner = this;
    return {
      get blocked() {
        return owner.active;
      },
      setVisible: (visible) => {
        if (disposed) return;
        surface.visible = visible;
        this.show(surface);
        this.layout();
      },
      dispose: () => {
        if (disposed) return;
        disposed = true;
        this.surfaces.delete(view);
        surface.covered = false;
        this.show(surface);
        this.layout();
      },
    };
  }

  private show(surface: Surface) {
    if (!this.window.isDestroyed() && !surface.view.webContents.isDestroyed())
      surface.view.setVisible(surface.visible && !surface.covered);
  }

  setActive(active: boolean) {
    if (this.active === active) return;
    this.active = active;
    this.backgroundReady = false;
    this.signature = '';
    this.revision++;
    if (active) this.layout();
    else
      for (const surface of this.surfaces.values()) {
        surface.covered = false;
        this.show(surface);
      }
    this.changed?.();
  }

  ready(revision: number, _rendered = true): boolean {
    if (!this.active || revision !== this.revision) return false;
    // Native body views cover HTML dialogs even when their background capture failed.
    this.backgroundReady = true;
    for (const surface of this.surfaces.values()) {
      surface.covered = true;
      this.show(surface);
    }
    return true;
  }

  layout() {
    const window = this.window;
    if (!this.active || window.isDestroyed()) return;
    const zoom = window.webContents.getZoomFactor();
    const surfaces = window.contentView.children.flatMap((view) => {
      const surface = this.surfaces.get(view as WebContentsView);
      return surface?.visible && !surface.view.webContents.isDestroyed()
        ? [{ view: surface.view, bounds: surface.view.getBounds() }]
        : [];
    });
    const signature = JSON.stringify(
      surfaces.map(({ view, bounds }) => [view.webContents.id, bounds, zoom]),
    );
    if (signature === this.signature) return;
    this.signature = signature;
    const revision = ++this.revision;
    void Promise.all(
      surfaces.map(async ({ view, bounds }) => {
        const image = await view.webContents.capturePage(undefined, {
          stayHidden: true,
          stayAwake: true,
        });
        return {
          id: view.webContents.id,
          image: image.toDataURL(),
          bounds: {
            x: bounds.x / zoom,
            y: bounds.y / zoom,
            width: bounds.width / zoom,
            height: bounds.height / zoom,
          },
        };
      }),
    ).then(
      (surfaces) => {
        if (!this.active || revision !== this.revision || window.isDestroyed()) return;
        const model: HostModalBackdrop = { revision, surfaces };
        window.webContents.send('dock:hostModalBackdrop', model);
      },
      () => {
        if (!this.active || revision !== this.revision || window.isDestroyed()) return;
        this.signature = '';
        const model: HostModalBackdrop = { revision, surfaces: [], failed: true };
        window.webContents.send('dock:hostModalBackdrop', model);
      },
    );
  }
}

import type { WebContents } from 'electron';

/** Temporary visual CSS only; no snapshots, page scripts or renderer replacement. */
export class SurfaceBlur {
  private active = false;
  private revision = 0;
  private key?: string;

  constructor(private contents: WebContents) {
    contents.on('did-start-loading', () => {
      const previous = this.key;
      this.key = undefined;
      this.revision++;
      if (previous) void this.remove(previous);
    });
    contents.on('did-finish-load', () => {
      if (this.active) void this.apply();
    });
  }

  setActive(active: boolean) {
    if (active === this.active) return;
    this.active = active;
    void this.apply();
  }

  private async remove(key: string) {
    if (!this.contents.isDestroyed()) await this.contents.removeInsertedCSS(key).catch(() => {});
  }

  private async apply() {
    const revision = ++this.revision;
    const previous = this.key;
    this.key = undefined;
    if (previous) await this.remove(previous);
    if (!this.active || revision !== this.revision || this.contents.isDestroyed()) return;
    try {
      const key = await this.contents.insertCSS(':root:root { filter: blur(2px) !important; }', {
        // Electron 45 leaves user-origin rules applied after removeInsertedCSS.
        cssOrigin: 'author',
      });
      if (!this.active || revision !== this.revision) await this.remove(key);
      else this.key = key;
    } catch {
      // Navigation or renderer shutdown can invalidate an in-flight style insertion.
    }
  }
}

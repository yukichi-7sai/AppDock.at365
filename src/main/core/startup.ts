import { defaultShellId, shellRegions, shellView } from '../../shared/shell';
import type { ShellProvider } from './shell-provider-registry';

/** Only configured, enabled providers participate in the initial presentation. */
export function startupShellIds(
  providers: readonly ShellProvider[],
  assignments: Record<string, string>,
  safeMode: boolean,
): Set<string> {
  const ids = new Set([defaultShellId]);
  if (safeMode) return ids;
  for (const { id: region } of shellRegions) {
    const provider = providers.find((p) => p.id === assignments[region]);
    if (provider?.enabled && shellView(provider.shell, region)) ids.add(provider.id);
  }
  return ids;
}

/** Initial host content and the visible Shell regions have independent readiness signals. */
export class StartupUiBarrier {
  private rendered = false;
  private cancelled = false;
  private waiting?: Promise<boolean>;
  private resolve?: (ready: boolean) => void;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(private shellsReady: () => boolean) {}
  rendererReady() {
    this.rendered = true;
    this.check();
  }
  resetRenderer() {
    this.rendered = false;
  }
  check() {
    if (this.resolve && this.rendered && this.shellsReady()) this.finish(true);
  }
  wait(timeoutMs = 30000): Promise<boolean> {
    if (this.cancelled) return Promise.resolve(false);
    if (this.waiting) return this.waiting;
    if (this.rendered && this.shellsReady()) return Promise.resolve(true);
    this.waiting = new Promise((resolve) => {
      this.resolve = resolve;
      this.timer = setTimeout(() => this.finish(false), timeoutMs);
    });
    return this.waiting;
  }
  cancel() {
    this.cancelled = true;
    this.finish(false);
  }
  private finish(ready: boolean) {
    clearTimeout(this.timer);
    this.resolve?.(ready);
    this.resolve = undefined;
  }
}

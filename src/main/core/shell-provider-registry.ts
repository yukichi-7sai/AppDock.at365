import { hostText } from '../../shared/i18n';
import type { ExtensionManifest, ExtensionSnapshot } from '../../shared/contracts';
import {
  defaultShellId,
  isRetiredShellRegion,
  shellRegions,
  shellView,
  type ShellRegion,
  type ShellRegionStatus,
  type ShellRegionsSnapshot,
  type OwnShellState,
  type ShellRequirement,
} from '../../shared/shell';
/** Lightweight input: never asks the manager for its command catalog. */
export type ShellProvider = Pick<
  ExtensionManifest,
  'id' | 'version' | 'shell' | 'minimumHostVersion'
> & {
  folder: string;
  sourceKind?: 'builtin' | 'external';
  enabled: boolean;
  state: ExtensionSnapshot['state'];
  generation?: string;
};
export type ShellBindingState = {
  provider: string | null;
  version?: string;
  generation?: string;
  session?: string;
  ready: boolean;
  visible: boolean;
  pending?: string | null;
  reason?: string | null;
};
/** Resolves assignments and presentation state. Native surfaces and controllers stay in their Hosts. */
export class ShellProviderRegistry {
  private failures = new Set<string>();
  private probes = new Map<ShellRegion, () => ShellBindingState>();
  private revision = 0;
  private signature = '';
  constructor(
    private options: {
      assignments(): Record<string, string>;
      providers(): ShellProvider[];
      safeMode: boolean;
      changed?(): void;
      blocked?(region: ShellRegion): boolean;
    },
  ) {}
  touch() {
    const previous = this.revision;
    this.snapshot();
    if (previous !== this.revision) this.options.changed?.();
  }
  configured(region: ShellRegion) {
    return this.options.assignments()[region] ?? defaultShellId;
  }
  providers() {
    return this.options.providers();
  }
  private failureKey(region: ShellRegion, id: string, version: string) {
    return `${region}:${id}:${version}`;
  }
  failed(region: ShellRegion, id: string, version: string) {
    return this.failures.has(this.failureKey(region, id, version));
  }
  fail(region: ShellRegion, id: string, version: string) {
    this.failures.add(this.failureKey(region, id, version));
  }
  retry(region?: ShellRegion) {
    for (const key of this.failures)
      if (!region || key.startsWith(region + ':')) this.failures.delete(key);
  }
  private rejection(region: ShellRegion, p: ShellProvider | undefined): string | null {
    if (!p || (p.id === defaultShellId && p.sourceKind !== 'builtin'))
      return hostText('shell.status.missing');
    if (!p.enabled) return hostText('shell.status.disabled');
    if (!shellView(p.shell, region)) return hostText('shell.status.unsupported');
    if (region === 'ribbon' && p.shell?.ribbonSchemaVersion !== 2)
      return hostText('shell.status.oldRibbon');
    if (p.state === 'error') return hostText('shell.status.stopped');
    if (p.state !== 'running') return hostText('shell.status.starting');
    if (this.failed(region, p.id, p.version)) return hostText('shell.status.suppressed');
    return null;
  }
  resolve(region: ShellRegion, fallbackOnly = false) {
    const providers = this.providers();
    const configured = this.configured(region);
    const id = this.options.safeMode || fallbackOnly ? defaultShellId : configured;
    const requested = providers.find((p) => p.id === id);
    if (requested?.state === 'error') this.fail(region, requested.id, requested.version);
    let reason = this.rejection(region, requested);
    if (!reason)
      return {
        provider: requested!,
        reason: this.options.safeMode ? hostText('shell.status.safeMode') : null,
      };
    const fallback = providers.find((p) => p.id === defaultShellId);
    if (id === defaultShellId || this.rejection(region, fallback))
      return { provider: undefined, reason: hostText('shell.status.defaultUnavailable') };
    return { provider: fallback!, reason };
  }
  usable(
    region: ShellRegion,
    binding: Pick<ShellBindingState, 'provider' | 'version' | 'generation'>,
  ) {
    const p = this.providers().find((p) => p.id === binding.provider);
    return (
      !!p &&
      !this.rejection(region, p) &&
      p.version === binding.version &&
      p.generation === binding.generation
    );
  }
  observe(region: ShellRegion, probe: () => ShellBindingState) {
    this.probes.set(region, probe);
  }
  region(region: ShellRegion): ShellRegionStatus {
    const resolved = this.resolve(region);
    const b = this.probes.get(region)?.();
    const usable = b?.provider && this.usable(region, b);
    const connected = usable ? b!.provider : null;
    const bound = connected && b?.ready ? connected : null;
    const ready = !!bound && !!b?.ready;
    const visible = ready && !!b?.visible && !this.options.blocked?.(region);
    return {
      region,
      configuredProvider: this.configured(region),
      resolvedProvider: resolved.provider?.id ?? null,
      boundProvider: bound,
      pendingProvider:
        b?.pending ??
        (connected && !b?.ready
          ? connected
          : bound && bound !== resolved.provider?.id
            ? (resolved.provider?.id ?? null)
            : null),
      ready,
      visible,
      reason:
        b?.reason ??
        (bound && bound !== resolved.provider?.id
          ? hostText('shell.status.pending')
          : resolved.reason),
    };
  }
  snapshot(): ShellRegionsSnapshot {
    const regions = shellRegions.map((r) => this.region(r.id));
    const signature = JSON.stringify(regions);
    if (signature !== this.signature) {
      this.signature = signature;
      this.revision++;
    }
    return { contextId: 'primary', revision: this.revision, regions };
  }
  ownState(provider: string): OwnShellState {
    const declared = this.providers().find((p) => p.id === provider);
    const snapshot = this.snapshot();
    return {
      contextId: 'primary',
      revision: snapshot.revision,
      regions: snapshot.regions
        .filter((r) => !!shellView(declared?.shell, r.region))
        .map((r) => ({
          region: r.region,
          configured: r.configuredProvider === provider,
          resolved: r.resolvedProvider === provider,
          bound: r.boundProvider === provider,
          ready: r.boundProvider === provider && r.ready,
          visible: r.boundProvider === provider && r.visible,
          reason:
            r.configuredProvider === provider ||
            r.resolvedProvider === provider ||
            r.boundProvider === provider
              ? r.reason
              : hostText('shell.status.unassigned'),
        })),
    };
  }
  lease(provider: string, requirement?: ShellRequirement): (() => boolean) | undefined {
    if (!requirement) return;
    if (isRetiredShellRegion(requirement.region)) return () => false;
    const region = requirement.region;
    const generation = this.providers().find((p) => p.id === provider)?.generation;
    const session = this.probes.get(region)?.().session;
    return () =>
      this.providers().find((p) => p.id === provider)?.generation === generation &&
      !this.requirement(provider, requirement) &&
      (requirement.state !== 'visible' || this.probes.get(region)?.().session === session);
  }
  requirement(provider: string, requirement?: ShellRequirement): string | undefined {
    if (!requirement) return;
    if (isRetiredShellRegion(requirement.region)) return hostText('shell.status.hostPage');
    const state = this.region(requirement.region);
    if (
      requirement.state === 'resolved'
        ? state.resolvedProvider !== provider
        : state.boundProvider !== provider || !state.ready || !state.visible
    )
      return hostText(
        requirement.state === 'resolved' ? 'shell.status.notProvider' : 'shell.status.notVisible',
        { region: hostText(`appearance.shell.region.${requirement.region}`) },
      );
  }
}

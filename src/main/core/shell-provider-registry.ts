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
      return '提供元が未導入です。';
    if (!p.enabled) return '提供元が無効です。割り当ては保持しています。';
    if (!shellView(p.shell, region)) return 'この領域を提供していません。';
    if (region === 'ribbon' && p.shell?.ribbonSchemaVersion !== 2)
      return 'グループとバッジに対応していないリボンShellです。';
    if (p.state === 'error') return '提供元のworkerが停止しました。再試行してください。';
    if (p.state !== 'running') return '提供元の起動を待っています。';
    if (this.failed(region, p.id, p.version))
      return 'この領域の故障を抑止しています。再試行してください。';
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
      return { provider: requested!, reason: this.options.safeMode ? 'safe起動中です。' : null };
    const fallback = providers.find((p) => p.id === defaultShellId);
    if (id === defaultShellId || this.rejection(region, fallback))
      return { provider: undefined, reason: 'Default Shellを利用できません。再試行してください。' };
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
          ? '新しい割り当ての適用待ちです。'
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
              : 'この領域に割り当てられていません。',
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
    if (isRetiredShellRegion(requirement.region)) return 'このページは本体で共通表示します。';
    const state = this.region(requirement.region);
    if (
      requirement.state === 'resolved'
        ? state.resolvedProvider !== provider
        : state.boundProvider !== provider || !state.ready || !state.visible
    )
      return `${shellRegions.find((r) => r.id === requirement.region)!.title}: このAppletのShellは${requirement.state === 'resolved' ? '現在の提供元ではありません。' : '現在操作できる状態で表示されていません。'}`;
  }
}

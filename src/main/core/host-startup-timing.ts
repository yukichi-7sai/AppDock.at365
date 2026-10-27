import { performance } from 'node:perf_hooks';
import type {
  HostStartupTiming,
  HostStartupPhase,
  HostStartupWork,
  HostStartupCount,
  HostStartupMilestone,
} from '../../shared/host-startup-timing';

/** Bounded, in-memory measurements for this process's initialization only. */
export class HostStartupTimingRecorder {
  private readonly origin: number;
  private readonly startedAt = new Date().toISOString();
  private endedAt?: number;
  private phases = new Map<HostStartupPhase, HostStartupTiming['phases'][number]>();
  private work = new Map<HostStartupWork, HostStartupTiming['work'][number]>();
  private counts: HostStartupTiming['counts'] = {};
  private milestones: HostStartupTiming['milestones'] = {};
  constructor(private clock: () => number = () => performance.now()) {
    this.origin = clock();
  }
  get active() {
    return this.endedAt === undefined;
  }
  private elapsed() {
    return Math.max(0, this.clock() - this.origin);
  }
  begin(id: HostStartupPhase) {
    if (!this.active || this.phases.has(id))
      return (_state: 'ended' | 'error' | 'timeout' = 'ended') => {};
    const row: HostStartupTiming['phases'][number] = {
      id,
      startMs: this.elapsed(),
      durationMs: 0,
      state: 'running',
    };
    this.phases.set(id, row);
    return (state: 'ended' | 'error' | 'timeout' = 'ended') => {
      if (!this.active || row.state !== 'running') return;
      row.durationMs = Math.max(0, this.elapsed() - row.startMs);
      row.state = state;
    };
  }
  phase<T>(id: HostStartupPhase, action: () => T): T {
    const end = this.begin(id);
    try {
      const result = action();
      end();
      return result;
    } catch (error) {
      end('error');
      throw error;
    }
  }
  async phaseAsync<T>(id: HostStartupPhase, action: () => Promise<T>): Promise<T> {
    const end = this.begin(id);
    try {
      const result = await action();
      end();
      return result;
    } catch (error) {
      end('error');
      throw error;
    }
  }
  measure<T>(id: HostStartupWork, action: () => T): T {
    if (!this.active) return action();
    const start = this.clock();
    try {
      return action();
    } finally {
      if (this.active) {
        const ms = Math.max(0, this.clock() - start);
        const row = this.work.get(id) ?? { id, calls: 0, totalMs: 0, maxMs: 0 };
        row.calls++;
        row.totalMs += ms;
        row.maxMs = Math.max(row.maxMs, ms);
        this.work.set(id, row);
      }
    }
  }
  count(id: HostStartupCount, value: number, add = false) {
    if (this.active && Number.isFinite(value) && value >= 0)
      this.counts[id] = add ? (this.counts[id] ?? 0) + value : value;
  }
  countOnce(id: HostStartupCount, value: number) {
    if (this.counts[id] === undefined) this.count(id, value);
  }
  mark(id: HostStartupMilestone) {
    if (this.active && this.milestones[id] === undefined) this.milestones[id] = this.elapsed();
  }
  finish() {
    if (!this.active) return;
    this.endedAt = this.elapsed();
    for (const row of this.phases.values())
      if (row.state === 'running') {
        row.durationMs = Math.max(0, this.endedAt - row.startMs);
        row.state = 'error';
      }
  }
  snapshot(): HostStartupTiming {
    const elapsedMs = this.endedAt ?? this.elapsed();
    return {
      startedAt: this.startedAt,
      complete: !this.active,
      elapsedMs,
      processEntryMs: this.origin,
      milestones: { ...this.milestones },
      counts: { ...this.counts },
      phases: [...this.phases.values()].map((row) => ({
        ...row,
        durationMs: row.state === 'running' ? Math.max(0, elapsedMs - row.startMs) : row.durationMs,
      })),
      work: [...this.work.values()].map((row) => ({ ...row })),
    };
  }
}
export const hostStartupTiming = new HostStartupTimingRecorder();

export interface BackgroundJob {
  jobId: string;
  kind: string;
  owner: string;
  origin: string;
  state: 'queued' | 'running' | 'canceling' | 'attention' | 'completed' | 'failed' | 'canceled';
  phase: string;
  createdAt: string;
  updatedAt: string;
  actions: ('cancel' | 'retry' | 'details')[];
  shutdownImpact: { active: boolean; preserved: number; volatile: number };
  resultSummary: { saved: number; pending: number };
  error?: { code: string; message: string };
}
export interface BackgroundJobSource {
  snapshot(): BackgroundJob[];
  cancel(id: string): void | Promise<unknown>;
  retry(id: string): void | Promise<unknown>;
  close(): Promise<unknown>;
  settle(): Promise<unknown>;
}
/** Projects domain state; it deliberately owns no second scheduler. */
export class BackgroundJobs {
  private sources = new Map<string, BackgroundJobSource>();
  private listeners = new Set<() => void>();
  private revision = 0;
  private signature = '';
  private stopping = false;
  private approval?: Promise<boolean>;
  async prepareStop(confirm: (jobs: BackgroundJob[], loss: boolean) => Promise<boolean>) {
    if (this.approval) return this.approval;
    if (this.stopping) return true;
    this.approval = (async () => {
      const acknowledged = new Set<string>();
      for (;;) {
        const jobs = this.snapshot().jobs;
        const affected = jobs.filter(
          (job) => job.shutdownImpact.active || job.resultSummary.pending,
        );
        if (!affected.some((job) => !acknowledged.has(job.jobId))) break;
        if (!(await confirm(jobs, false))) return false;
        for (const job of affected) acknowledged.add(job.jobId);
      }
      await this.settle();
      const jobs = this.snapshot().jobs;
      if (jobs.some((job) => job.shutdownImpact.volatile) && !(await confirm(jobs, true))) {
        this.resume();
        return false;
      }
      return true;
    })()
      .catch((error) => {
        this.resume();
        throw error;
      })
      .finally(() => {
        this.approval = undefined;
      });
    return this.approval;
  }
  resume() {
    this.stopping = false;
  }
  async settle() {
    this.stopping = true;
    await Promise.all([...this.sources.values()].map((source) => source.settle()));
  }
  register(kind: string, source: BackgroundJobSource) {
    if (this.sources.has(kind)) throw Error('Duplicate background job source');
    this.sources.set(kind, source);
  }
  assertAccepting() {
    if (this.stopping) throw Error('AppDock is stopping');
  }
  snapshot() {
    const jobs = [...this.sources.values()].flatMap((source) => source.snapshot());
    const signature = JSON.stringify(jobs);
    if (signature !== this.signature) {
      this.signature = signature;
      this.revision++;
    }
    return { revision: this.revision, jobs };
  }
  summary() {
    const counts = { active: 0, ended: 0, attention: 0, completed: 0, failed: 0, canceled: 0 };
    for (const job of this.snapshot().jobs) {
      if (job.shutdownImpact.active || ['queued', 'running', 'canceling'].includes(job.state))
        counts.active++;
      else if (job.state === 'attention') counts.attention++;
      else {
        counts.ended++;
        if (job.state === 'completed' || job.state === 'failed' || job.state === 'canceled')
          counts[job.state]++;
      }
    }
    return counts;
  }
  changed() {
    this.snapshot();
    for (const listener of this.listeners) listener();
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  async act(kind: string, id: string, action: 'cancel' | 'retry') {
    this.assertAccepting();
    const source = this.sources.get(kind);
    if (
      !source
        ?.snapshot()
        .find((job) => job.jobId === id)
        ?.actions.includes(action)
    )
      throw Error('Background job action is unavailable');
    await source[action](id);
  }
  async close() {
    this.stopping = true;
    await Promise.all([...this.sources.values()].map((source) => source.close()));
  }
}

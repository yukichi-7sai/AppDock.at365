import type { CommandBatchPlan } from '../../shared/command-execution';

export interface CommandBatchLifetime {
  valid(): Promise<boolean>;
  execute(id: string): Promise<unknown>;
}
export interface CommandBatchResult {
  executed: number;
  failed: number;
  busy: number;
  cancelled: boolean;
}

/** One instance owns reservations across all input adapters. */
export class CommandDispatcher {
  private executing = new Set<string>();
  private inputs = new Set<string>();
  constructor(
    private execute: (id: string) => Promise<unknown>,
    private report: (message: string) => void,
    private stopped: () => boolean = () => false,
    private stackAvailable: (id: string) => boolean = () => true,
  ) {}
  async dispatch(
    input: string,
    plan: CommandBatchPlan,
    lifetime?: CommandBatchLifetime,
  ): Promise<CommandBatchResult> {
    const result = { executed: 0, failed: 0, busy: 0, cancelled: false };
    if (this.stopped()) return { ...result, cancelled: true };
    if (this.inputs.has(input)) return { ...result, busy: plan.commands.length };
    const stacks = plan.stackIds ?? [];
    if (stacks.some((id) => this.executing.has(id)))
      return { ...result, busy: plan.commands.length };
    const captured = plan.commands.filter((id) => !this.executing.has(id));
    result.busy = plan.commands.length - captured.length;
    this.inputs.add(input);
    // Reserve the complete fixed plan before SendInput or any asynchronous validity check.
    captured.forEach((id) => this.executing.add(id));
    stacks.forEach((id) => this.executing.add(id));
    try {
      for (const id of captured) {
        if (
          this.stopped() ||
          stacks.some((id) => !this.stackAvailable(id)) ||
          (lifetime && !(await lifetime.valid()))
        ) {
          result.cancelled = true;
          break;
        }
        try {
          await (lifetime?.execute ?? this.execute)(id);
          result.executed++;
        } catch (error) {
          result.failed++;
          this.report(`${id}: ${String(error)}`);
        }
      }
    } finally {
      captured.forEach((id) => this.executing.delete(id));
      stacks.forEach((id) => this.executing.delete(id));
      this.inputs.delete(input);
    }
    return result;
  }
}

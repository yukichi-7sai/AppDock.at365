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

/** Each accepted input owns an independent, ordered execution of its captured plan. */
export class CommandDispatcher {
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
    const stacks = plan.stackIds ?? [];
    for (const id of plan.commands) {
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
    return result;
  }
}

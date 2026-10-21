import { commandBatch } from '../../shared/command-execution';
import { CommandDispatcher, type CommandBatchLifetime } from './command-dispatcher';

/** Compatibility for callers already holding an authorized command list. */
export class ShortcutDispatcher extends CommandDispatcher {
  dispatch(
    key: string,
    commands: string[] | Parameters<CommandDispatcher['dispatch']>[1],
    options?: CommandBatchLifetime,
  ) {
    return super.dispatch(
      key,
      Array.isArray(commands) ? commandBatch(commands) : commands,
      options,
    );
  }
}

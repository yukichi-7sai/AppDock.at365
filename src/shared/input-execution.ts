import { hostText } from './i18n';
import {
  commandExecutionModeSchema,
  parseCommandExecutionMode,
  type CommandExecutionMode,
  type GestureExecutionMode,
} from './command-execution-mode';

/** Missing entries inherit the trigger's current execution mode. */
export type InputExecutionModes = Record<string, CommandExecutionMode>;

export function parseInputExecutionModes(
  value: unknown,
  normalize: (input: unknown) => string,
): InputExecutionModes {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error(hostText('settings.inputExecution.invalid'));
  const entries = Object.entries(value).map(([input, mode]) => {
    return [normalize(input), parseCommandExecutionMode(mode)] as const;
  });
  if (new Set(entries.map(([input]) => input)).size !== entries.length)
    throw Error(hostText('settings.inputExecution.invalid'));
  return Object.fromEntries(entries);
}

/** Native aliases describe one key press; the first explicit entry in notification order wins. */
export function inputExecutionMode(
  fallback: GestureExecutionMode,
  modes: InputExecutionModes | undefined,
  input: string | readonly string[],
): CommandExecutionMode {
  for (const key of typeof input === 'string' ? [input] : input) {
    if (modes && Object.hasOwn(modes, key)) return modes[key];
  }
  return fallback;
}

export const inputExecutionModesSchema = {
  type: 'object',
  maxProperties: 2000,
  additionalProperties: commandExecutionModeSchema,
  description:
    '入力IDごとの実行方法。first、all、または{mode:"count",count:正の整数}。条件に一致する行を登録順に最大count件選び、入れ子は親で1件として数えます。未指定の入力は全体のexecutionModeを使用します。',
} as const;

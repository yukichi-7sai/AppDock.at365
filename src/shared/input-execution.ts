import { hostText } from './i18n';
import type { CommandExecutionMode } from './command-execution';

/** Missing entries inherit the trigger's current execution mode. */
export type InputExecutionModes = Record<string, CommandExecutionMode>;

export function parseInputExecutionModes(
  value: unknown,
  normalize: (input: unknown) => string,
): InputExecutionModes {
  if (value === undefined) return {};
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length > 2000
  )
    throw Error(hostText('settings.inputExecution.invalid'));
  const entries = Object.entries(value).map(([input, mode]) => {
    if (mode !== 'first' && mode !== 'all')
      throw Error(hostText('settings.inputExecution.invalid'));
    return [normalize(input), mode] as const;
  });
  if (new Set(entries.map(([input]) => input)).size !== entries.length)
    throw Error(hostText('settings.inputExecution.invalid'));
  return Object.fromEntries(entries);
}

/** Native aliases describe one key press; the first explicit entry in notification order wins. */
export function inputExecutionMode(
  fallback: CommandExecutionMode,
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
  additionalProperties: { type: 'string', enum: ['first', 'all'] },
  description:
    '入力IDごとの実行方法。指定のない入力はジェスチャー全体のexecutionModeを使用します。',
} as const;

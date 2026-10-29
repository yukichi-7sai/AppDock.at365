import { hostText } from './i18n';

export type GestureExecutionMode = 'first' | 'all';
export type CommandExecutionMode = GestureExecutionMode | { mode: 'count'; count: number };

export function parseCommandExecutionMode(value: unknown): CommandExecutionMode {
  if (value === 'first' || value === 'all') return value;
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === 2 &&
    'mode' in value &&
    value.mode === 'count' &&
    'count' in value &&
    typeof value.count === 'number' &&
    Number.isSafeInteger(value.count) &&
    value.count >= 1
  )
    return { mode: 'count', count: value.count };
  throw Error(hostText('settings.inputExecution.invalid'));
}

/** Count eligible rows at this level, before flattening nested stacks. */
export function commandExecutionLimit(value: CommandExecutionMode): number {
  const mode = parseCommandExecutionMode(value);
  return mode === 'all' ? Infinity : mode === 'first' ? 1 : mode.count;
}

export const commandExecutionModeSchema = {
  anyOf: [
    { type: 'string', enum: ['first', 'all'] },
    {
      type: 'object',
      additionalProperties: false,
      required: ['mode', 'count'],
      properties: {
        mode: { type: 'string', enum: ['count'] },
        // JSON numbers must round-trip exactly through JavaScript and native input.
        count: { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
      },
    },
  ],
} as const;

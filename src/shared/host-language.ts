/** Host UI languages are independent of regional formats, time zones and Web sessions. */
export const hostLanguages = ['ja'] as const;
export type HostLanguage = (typeof hostLanguages)[number];
export const defaultHostLanguage: HostLanguage = 'ja';
export function isHostLanguage(value: unknown): value is HostLanguage {
  return typeof value === 'string' && (hostLanguages as readonly string[]).includes(value);
}
